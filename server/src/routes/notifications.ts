import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { notFound } from "../lib/errors.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { TEMPLATES } from "../notify/templates.js";
import { pagination, param, rma } from "./shared.js";

export const notificationsRouter = Router();
notificationsRouter.use(requirePermission("notifications:view"));

notificationsRouter.get("/", async (req, res) => {
  const { orgId } = auth(req);
  const q = pagination.extend({ status: z.enum(["sent", "logged", "failed", "skipped"]).optional() }).parse(req.query);
  const where = { organizationId: orgId, ...(q.status && { status: q.status }) };
  const [total, rows] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { returnRequest: { select: { id: true, number: true } } } }),
  ]);
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    smtpConfigured: !!process.env.SMTP_URL,
    notifications: rows.map((n) => ({
      id: n.id,
      channel: n.channel,
      to: n.to,
      template: n.template,
      templateLabel: TEMPLATES[n.template as keyof typeof TEMPLATES]?.label ?? n.template,
      subject: n.subject,
      status: n.status,
      provider: n.provider,
      error: n.error,
      createdAt: n.createdAt,
      returnId: n.returnRequest?.id ?? null,
      rma: n.returnRequest ? rma(n.returnRequest.number) : null,
    })),
  });
});

notificationsRouter.get("/:id", async (req, res) => {
  const n = await db.notification.findFirst({ where: { id: param(req.params.id), organizationId: auth(req).orgId } });
  if (!n) throw notFound();
  res.json({ id: n.id, subject: n.subject, to: n.to, channel: n.channel, html: n.body, status: n.status, createdAt: n.createdAt });
});
