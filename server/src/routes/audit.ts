import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { pagination } from "./shared.js";
import { audit } from "../lib/audit.js";

export const auditRouter = Router();

auditRouter.get("/export.csv", requirePermission("audit:view"), async (req, res) => {
  const a = auth(req);
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(3650).default(90) }).parse(req.query);
  const rows = await db.auditLog.findMany({ where: { organizationId: a.orgId, createdAt: { gte: new Date(Date.now() - days * 864e5) } }, orderBy: { createdAt: "asc" } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "report.exported", meta: { report: "audit.csv", days }, req });
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [["time", "actor_type", "actor", "action", "entity", "entity_id", "details", "ip"], ...rows.map((e) => [e.createdAt.toISOString(), e.actorType, e.actorLabel, e.action, e.entityType, e.entityId, e.meta, e.ip])];
  res.type("text/csv").attachment(`audit-log-last-${days}-days.csv`).send("\uFEFF" + lines.map((l) => l.map(cell).join(",")).join("\n") + "\n");
});

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
