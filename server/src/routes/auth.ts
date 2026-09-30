import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { encrypt, randomToken } from "../lib/crypto.js";
import { conflict, unauthorized, forbidden } from "../lib/errors.js";
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

  issueSession(res, { sub: user.id, org: org.id, mid: membership.id });
  res.status(201).json(await sessionPayload(membership.id));
});

authRouter.post("/login", limiter, async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await db.user.findUnique({ where: { email: body.email }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
  // Always run bcrypt so response timing doesn't reveal whether the email exists.
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
  if (!user || !ok) throw unauthorized("That email and password don't match");

  const active = user.memberships.filter((m) => m.status === "active");
  const membership = active.find((m) => m.organizationId === body.organizationId) ?? active[0];
  if (!membership) throw forbidden("Your access to this workspace has been disabled. Contact your admin.");

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ organizationId: membership.organizationId, actor: { type: "user", id: user.id, label: user.name }, action: "auth.login", req });
  issueSession(res, { sub: user.id, org: membership.organizationId, mid: membership.id });
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
