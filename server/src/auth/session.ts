import type { Response } from "express";
import jwt from "jsonwebtoken";
import { env, isProd } from "../env.js";

export const SESSION_COOKIE = "rf_session";
const MAX_AGE_S = 60 * 60 * 12; // 12h working session

export type SessionClaims = { sub: string; org: string; mid: string };

export function issueSession(res: Response, claims: SessionClaims) {
  const token = jwt.sign(claims, env.SESSION_SECRET, { expiresIn: MAX_AGE_S, audience: "app" });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: MAX_AGE_S * 1000,
    path: "/",
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function readSession(token: string | undefined): SessionClaims | null {
  if (!token) return null;
  try {
    return jwt.verify(token, env.SESSION_SECRET, { audience: "app" }) as SessionClaims;
  } catch {
    return null;
  }
}

/** Short-lived token proving a customer looked up a specific order in the portal. */
export function issuePortalToken(orgId: string, orderId: string) {
  return jwt.sign({ org: orgId, order: orderId }, env.SESSION_SECRET, { expiresIn: "45m", audience: "portal" });
}

export function readPortalToken(token: string | undefined): { org: string; order: string } | null {
  if (!token) return null;
  try {
    return jwt.verify(token, env.SESSION_SECRET, { audience: "portal" }) as { org: string; order: string };
  } catch {
    return null;
  }
}
