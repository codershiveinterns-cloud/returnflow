import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { encrypt, randomToken } from "../lib/crypto.js";
import { conflict, unauthorized, forbidden, HttpError } from "../lib/errors.js";
import { rateLimit } from "../lib/rateLimit.js";
import { slugify } from "../lib/slug.js";
import { requireAuth, auth } from "../auth/middleware.js";
import { permissionsFor, ROLE_META, type Role } from "../auth/rbac.js";
import { clearSession, issueSession } from "../auth/session.js";
import { orgPublic } from "./shared.js";

export const authRouter = Router();

const password = z.string().min(8, "Use at least 8 characters").max(128);
const email = z.string().trim().toLowerCase().email("Enter a valid email");

const signupBody = z.object({
  orgName: z.string().trim().min(2, "Enter your business name").max(80),
  name: z.string().trim().min(2, "Enter your name").max(80),
  email,
  password,
});

const loginBody = z.object({ email, password: z.string().min(1, "Enter your password"), organizationId: z.string().optional() });

const limiter = rateLimit({ windowMs: 60_000, max: 10 });

/** Per-account lockout: 8 failed attempts within 15 minutes blocks that email for the rest of the window. */
const failures = new Map<string, { count: number; first: number }>();
const LOCK_WINDOW = 15 * 60_000;
function recordFailure(email: string) {
  const now = Date.now();
  if (failures.size > 10_000) for (const [k, v] of failures) if (now - v.first > LOCK_WINDOW) failures.delete(k);
  const f = failures.get(email);
  if (!f || now - f.first > LOCK_WINDOW) failures.set(email, { count: 1, first: now });
  else f.count++;
}
function isLockedOut(email: string) {
  const f = failures.get(email);
  if (!f) return false;
  if (Date.now() - f.first > LOCK_WINDOW) {
    failures.delete(email);
    return false;
  }
  return f.count >= 8;
}

async function uniqueSlug(base: string) {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if (!(await db.organization.findUnique({ where: { slug: candidate } }))) return candidate;
  }
  return `${root}-${randomToken(3).toLowerCase()}`;
}

authRouter.post("/signup", limiter, async (req, res) => {
  const body = signupBody.parse(req.body);
  if (await db.user.findUnique({ where: { email: body.email } })) throw conflict("An account with this email already exists. Sign in instead.");

  const slug = await uniqueSlug(body.orgName);
  const passwordHash = await bcrypt.hash(body.password, 12);
  const { user, org, membership } = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: body.orgName, slug, webhookSecretEnc: encrypt(`whsec_${randomToken(24)}`) } });
    const user = await tx.user.create({ data: { email: body.email, name: body.name, passwordHash, lastLoginAt: new Date() } });
    const membership = await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: "admin" } });
    await audit({ organizationId: org.id, actor: { type: "user", id: user.id, label: user.name }, action: "workspace.created", entityType: "organization", entityId: org.id, req }, tx);
    return { user, org, membership };
  });

  issueSession(res, { sub: user.id, org: org.id, mid: membership.id, v: user.sessionVersion });
  res.status(201).json(await sessionPayload(membership.id));
});

authRouter.post("/login", limiter, async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await db.user.findUnique({ where: { email: body.email }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
  // Always run bcrypt so response timing doesn't reveal whether the email exists.
  if (isLockedOut(body.email)) throw new HttpError(429, "Too many failed sign-in attempts. Try again in 15 minutes.", "locked_out");
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
  if (!user || !ok) {
    recordFailure(body.email);
    if (user) {
      const m = user.memberships[0];
      if (m) await audit({ organizationId: m.organizationId, actor: { type: "system", label: "Sign-in" }, action: "auth.login_failed", meta: { email: body.email }, req });
    }
    throw unauthorized("That email and password don't match");
  }
  failures.delete(body.email);

  const active = user.memberships.filter((m) => m.status === "active");
  const membership = active.find((m) => m.organizationId === body.organizationId) ?? active[0];
  if (!membership) throw forbidden("Your access to this workspace has been disabled. Contact your admin.");

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ organizationId: membership.organizationId, actor: { type: "user", id: user.id, label: user.name }, action: "auth.login", req });
  issueSession(res, { sub: user.id, org: membership.organizationId, mid: membership.id, v: user.sessionVersion });
  res.json(await sessionPayload(membership.id));
});

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await sessionPayload(auth(req).membershipId));
});

async function sessionPayload(membershipId: string) {
  const m = await db.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { user: true, organization: true } });
  const role = m.role as Role;
  return {
    user: { id: m.user.id, name: m.user.name, email: m.user.email },
    organization: orgPublic(m.organization),
    role,
    roleLabel: ROLE_META[role].label,
    permissions: permissionsFor(role),
  };
}

const passwordBody = z.object({ current: z.string().min(1, "Enter your current password"), next: password });

/** Changing the password signs the user out on every other device. */
const passwordLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5, key: (req) => `pw:${req.cookies?.rf_session ?? req.ip}` });

authRouter.post("/password", passwordLimiter, requireAuth, async (req, res) => {
  const a = auth(req);
  const body = passwordBody.parse(req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: a.userId } });
  if (!(await bcrypt.compare(body.current, user.passwordHash))) throw new HttpError(400, "Your current password isn't correct", "wrong_password");
  if (body.current === body.next) throw conflict("Choose a password you haven't used here");
  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.next, 12), sessionVersion: { increment: 1 } } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "auth.password_changed", req });
  issueSession(res, { sub: user.id, org: a.orgId, mid: a.membershipId, v: updated.sessionVersion });
  res.json({ ok: true });
});

authRouter.post("/sign-out-everywhere", requireAuth, async (req, res) => {
  const a = auth(req);
  await db.user.update({ where: { id: a.userId }, data: { sessionVersion: { increment: 1 } } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "auth.signed_out_everywhere", req });
  clearSession(res);
  res.status(204).end();
});
