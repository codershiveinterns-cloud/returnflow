import type { RequestHandler } from "express";
import { HttpError } from "./errors.js";

/**
 * Fixed-window in-memory limiter. Adequate for a single instance; swap for a
 * Redis-backed store when the API runs on more than one node.
 */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Parameters<RequestHandler>[0]) => string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, _res, next) => {
    if (process.env.NODE_ENV === "test") return next();
    const k = opts.key ? opts.key(req) : req.ip ?? "anon";
    const now = Date.now();
    const entry = hits.get(k);
    if (!entry || entry.resetAt < now) {
      hits.set(k, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > opts.max) {
      return next(new HttpError(429, "Too many attempts. Please wait a minute and try again.", "rate_limited"));
    }
    next();
  };
}
