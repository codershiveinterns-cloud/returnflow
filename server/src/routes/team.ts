import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { permissionsFor, PERMISSIONS, ROLE_META, ROLES } from "../auth/rbac.js";
import { param } from "./shared.js";

export const teamRouter = Router();

teamRouter.get("/", requirePermission("team:view"), async (req, res) => {
  const members = await db.membership.findMany({
    where: { organizationId: auth(req).orgId },
    include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    members: members.map((m) => ({ id: m.id, role: m.role, status: m.status, createdAt: m.createdAt, user: m.user, isYou: m.userId === auth(req).userId })),
    roles: ROLES.map((r) => ({ id: r, ...ROLE_META[r], permissions: permissionsFor(r) })),
    permissions: PERMISSIONS,
  });
});

const addBody = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(ROLES),
  password: z.string().min(8, "Temporary password must be at least 8 characters").max(128),
});

/**
 * Admins add teammates with a temporary password. Email invitations arrive
 * with the notification framework in Milestone 2.
 */
teamRouter.post("/", requirePermission("team:manage"), async (req, res) => {
  const a = auth(req);
  const body = addBody.parse(req.body);
  let user = await db.user.findUnique({ where: { email: body.email } });
  if (user && (await db.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: a.orgId } } }))) {
    throw conflict("This person is already on the team");
  }
  if (user) throw conflict("This email already belongs to a ReturnFlow account in another workspace");
  user = await db.user.create({ data: { name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12) } });
  const m = await db.membership.create({ data: { userId: user.id, organizationId: a.orgId, role: body.role } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "team.member_added", entityType: "membership", entityId: m.id, meta: { email: body.email, role: body.role }, req });
  res.status(201).json({ id: m.id });
});

const patchBody = z.object({ role: z.enum(ROLES).optional(), status: z.enum(["active", "disabled"]).optional() });

teamRouter.patch("/:id", requirePermission("team:manage"), async (req, res) => {
  const a = auth(req);
  const body = patchBody.parse(req.body);
  const m = await db.membership.findFirst({ where: { id: param(req.params.id), organizationId: a.orgId }, include: { user: true } });
  if (!m) throw notFound("Team member not found");
  const losingAdmin = m.role === "admin" && m.status === "active" && ((body.role && body.role !== "admin") || body.status === "disabled");
  if (losingAdmin) {
    const admins = await db.membership.count({ where: { organizationId: a.orgId, role: "admin", status: "active" } });
    if (admins <= 1) throw badRequest("A workspace needs at least one active admin");
  }
  const updated = await db.membership.update({ where: { id: m.id }, data: body });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "team.member_updated", entityType: "membership", entityId: m.id, meta: { email: m.user.email, from: { role: m.role, status: m.status }, to: body }, req });
  res.json({ id: updated.id, role: updated.role, status: updated.status });
});
