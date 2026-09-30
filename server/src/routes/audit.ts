import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { pagination } from "./shared.js";

export const auditRouter = Router();

auditRouter.get("/", requirePermission("audit:view"), async (req, res) => {
  const { orgId } = auth(req);
  const q = pagination.extend({ action: z.string().max(60).optional() }).parse(req.query);
  const where = { organizationId: orgId, ...(q.action && { action: { startsWith: q.action } }) };
  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  res.json({ total, page: q.page, pageSize: q.pageSize, entries: entries.map((e) => ({ ...e, meta: e.meta ? JSON.parse(e.meta) : null })) });
});
