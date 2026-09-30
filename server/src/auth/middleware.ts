import type { NextFunction, Request, RequestHandler, Response } from "express";
import { db } from "../db.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import type { Actor } from "../lib/audit.js";
import { sha256 } from "../lib/crypto.js";
import { can, isRole, type Permission, type Role } from "./rbac.js";
import { readSession, SESSION_COOKIE } from "./session.js";

export type AuthContext = {
  userId: string;
  membershipId: string;
  orgId: string;
  role: Role;
  name: string;
  email: string;
  actor: Actor;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      apiKey?: { id: string; orgId: string; name: string; actor: Actor };
      rawBody?: Buffer;
    }
  }
}

/** Resolves the session cookie against the database on every request, so disabling a member takes effect immediately. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const claims = readSession(req.cookies?.[SESSION_COOKIE]);
  if (!claims) return next(unauthorized());
  const membership = await db.membership.findUnique({
    where: { id: claims.mid },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!membership || membership.userId !== claims.sub || membership.organizationId !== claims.org) return next(unauthorized());
  if (membership.status !== "active") return next(forbidden("Your access to this workspace has been disabled"));
  if (!isRole(membership.role)) return next(forbidden());
  req.auth = {
    userId: membership.user.id,
    membershipId: membership.id,
    orgId: membership.organizationId,
    role: membership.role,
    name: membership.user.name,
    email: membership.user.email,
    actor: { type: "user", id: membership.user.id, label: membership.user.name },
  };
  next();
};

export const requirePermission =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    const ok = permissions.every((p) => can(req.auth!.role, p));
    next(ok ? undefined : forbidden());
  };

/** `Authorization: Bearer rf_<prefix>_<secret>` — machine access for the REST API. */
export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(rf_([a-z0-9]{8})_[A-Za-z0-9_-]{20,})$/.exec(header.trim());
  if (!match) return next(unauthorized("Missing or malformed API key"));
  const key = await db.apiKey.findUnique({ where: { prefix: match[2] } });
  if (!key || key.revokedAt || key.hash !== sha256(match[1])) return next(unauthorized("Invalid API key"));
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  req.apiKey = { id: key.id, orgId: key.organizationId, name: key.name, actor: { type: "api_key", id: key.id, label: `API key “${key.name}”` } };
  next();
}

export const auth = (req: Request) => {
  if (!req.auth) throw unauthorized();
  return req.auth;
};
