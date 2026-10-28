import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { badRequest, notFound } from "../lib/errors.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { parseList } from "../returns/eligibility.js";
import multer from "multer";
import { IMAGE_TYPES, putFile } from "../lib/storage.js";
import { canResolve, markReceived, recordInspection, resolveReturn, suggestCondition } from "../returns/resolution.js";
import { approveReturn, CHECKPOINTS, COURIERS, escalateReturn, recordCheckpoint, rejectReturn, REJECT_REASONS, schedulePickup } from "../returns/service.js";
import { REASON_CODES, RETURN_REASONS } from "../returns/reasons.js";
import { RESOLUTIONS, RETURN_STATUSES } from "../returns/status.js";
import { pagination, param, rma } from "./shared.js";

export const returnsRouter = Router();

const listQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(RETURN_STATUSES).optional(),
  reason: z.enum(REASON_CODES).optional(),
  resolution: z.enum(RESOLUTIONS).optional(),
  minValue: z.coerce.number().nonnegative().optional(),
  queue: z.enum(["escalated", "flagged"]).optional(),
});

returnsRouter.get("/", requirePermission("returns:view"), async (req, res) => {
  const { orgId } = auth(req);
  const q = listQuery.parse(req.query);
  const rmaOnly = q.q ? /^rf-?\d+$/i.test(q.q) : false;
  const term = q.q?.replace(/^#/, "").replace(/^rf-?/i, "");
  const where: Prisma.ReturnRequestWhereInput = {
    organizationId: orgId,
    ...(q.status && { status: q.status }),
    ...(q.resolution && { resolution: q.resolution }),
    ...(q.reason && { items: { some: { reason: q.reason } } }),
    ...(q.minValue !== undefined && { valueMinor: { gte: Math.round(q.minValue * 100) } }),
    ...(q.queue === "escalated" && { requiresManager: true, status: "requested" }),
    ...(q.queue === "flagged" && { NOT: { flags: "[]" } }),
    ...(term && rmaOnly && { number: Number(term) }),
    ...(term && !rmaOnly && {
      OR: [
        ...(/^\d+$/.test(term) ? [{ number: Number(term) }] : []),
        { order: { orderNumber: { contains: term } } },
        { customer: { email: { contains: term.toLowerCase() } } },
        { customer: { name: { contains: term } } },
      ],
    }),
  };
  const [total, rows, statusCounts] = await Promise.all([
    db.returnRequest.count({ where }),
    db.returnRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        order: { select: { orderNumber: true } },
        customer: { select: { name: true, email: true } },
        items: { select: { reason: true, quantity: true, orderItem: { select: { name: true } } } },
        _count: { select: { photos: true } },
      },
    }),
    db.returnRequest.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: true }),
  ]);
  const escalated = await db.returnRequest.count({ where: { organizationId: orgId, status: "requested", requiresManager: true } });
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    escalated,
    returns: rows.map((r) => ({
      id: r.id,
      rma: rma(r.number),
      status: r.status,
      resolution: r.resolution,
      channel: r.channel,
      valueMinor: r.valueMinor,
      currency: r.currency,
      createdAt: r.createdAt,
      orderNumber: r.order.orderNumber,
      customer: r.customer,
      itemCount: r.items.reduce((s, i) => s + i.quantity, 0),
      itemNames: r.items.map((i) => i.orderItem.name),
      reasons: [...new Set(r.items.map((i) => i.reason))],
      photoCount: r._count.photos,
      flags: parseList(r.flags),
      requiresManager: r.requiresManager,
      riskScore: r.riskScore,
      riskLevel: r.riskLevel,
    })),
  });
});

returnsRouter.get("/meta", requirePermission("returns:view"), (_req, res) => {
  res.json({ statuses: RETURN_STATUSES, reasons: RETURN_REASONS, resolutions: RESOLUTIONS, rejectReasons: REJECT_REASONS, couriers: COURIERS, checkpoints: CHECKPOINTS });
});

returnsRouter.get("/:id", requirePermission("returns:view"), async (req, res) => {
  const { orgId } = auth(req);
  const r = await db.returnRequest.findFirst({
    where: { id: param(req.params.id), organizationId: orgId },
    include: {
      order: { select: { id: true, orderNumber: true, placedAt: true, deliveredAt: true, status: true, paymentMethod: true, paymentRef: true, totalMinor: true, source: true } },
      customer: { include: { _count: { select: { orders: true, returns: true } } } },
      items: { include: { orderItem: true, photos: { select: { id: true, uploadedBy: true } }, inspection: true } },
      refunds: { orderBy: { createdAt: "desc" } },
      inventory: { orderBy: { createdAt: "desc" } },
      photos: { where: { returnItemId: null }, select: { id: true } },
      events: { orderBy: { createdAt: "asc" } },
      shipment: { include: { checkpoints: { orderBy: { at: "desc" } } } },
      notifications: { orderBy: { createdAt: "desc" }, select: { id: true, template: true, subject: true, status: true, to: true, createdAt: true } },
    },
  });
  if (!r) throw notFound("Return not found");
  const decidedBy = r.decidedById ? await db.user.findUnique({ where: { id: r.decidedById }, select: { name: true } }) : null;
  res.json({
    id: r.id,
    rma: rma(r.number),
    status: r.status,
    resolution: r.resolution,
    channel: r.channel,
    customerNote: r.customerNote,
    valueMinor: r.valueMinor,
    currency: r.currency,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    order: r.order,
    customer: { id: r.customer.id, name: r.customer.name, email: r.customer.email, phone: r.customer.phone, orderCount: r.customer._count.orders, returnCount: r.customer._count.returns },
    items: r.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      reason: i.reason,
      reasonDetail: i.reasonDetail,
      sku: i.orderItem.sku,
      name: i.orderItem.name,
      variant: i.orderItem.variant,
      category: i.orderItem.category,
      unitPriceMinor: i.orderItem.unitPriceMinor,
      imageUrl: i.orderItem.imageUrl,
      photos: i.photos.filter((p) => p.uploadedBy === "customer").map((p) => `/api/files/photos/${p.id}`),
      inspectionPhotos: i.photos.filter((p) => p.uploadedBy === "staff").map((p) => `/api/files/photos/${p.id}`),
      ai: i.aiReason ? { reason: i.aiReason, summary: i.aiSummary, confidence: i.aiConfidence, source: i.aiSource } : null,
      inspection: i.inspection && {
        checklist: JSON.parse(i.inspection.checklist),
        grade: i.inspection.grade,
        disposition: i.inspection.disposition,
        notes: i.inspection.notes,
        mismatch: i.inspection.mismatch,
        aiSuggestion: i.inspection.aiSuggestion ? JSON.parse(i.inspection.aiSuggestion) : null,
        inspectorName: i.inspection.inspectorName,
        createdAt: i.inspection.createdAt,
      },
    })),
    extraPhotos: r.photos.map((p) => `/api/files/photos/${p.id}`),
    events: r.events.map((e) => ({ id: e.id, type: e.type, status: e.status, message: e.message, actorType: e.actorType, actorLabel: e.actorLabel, createdAt: e.createdAt })),
    eligibility: r.eligibility ? JSON.parse(r.eligibility) : null,
    flags: parseList(r.flags),
    requiresManager: r.requiresManager,
    escalatedAt: r.escalatedAt,
    decision: r.decidedAt ? { reason: r.decisionReason, at: r.decidedAt, by: decidedBy?.name ?? "Automation" } : null,
    shipment: r.shipment,
    notifications: r.notifications,
    risk: r.riskScore === null ? null : { score: r.riskScore, level: r.riskLevel, factors: JSON.parse(r.riskFactors) },
    holdRefund: r.holdRefund,
    refunds: r.refunds,
    inventory: r.inventory,
    resolvable: canResolve(r),
    paymentRef: r.order.paymentRef ?? null,
  });
});

// ───────────────────────── Workflow actions ─────────────────────────

const staff = (req: Parameters<typeof auth>[0]) => {
  const a = auth(req);
  return { orgId: a.orgId, actor: a.actor, role: a.role, userId: a.userId, req };
};

const noteBody = z.object({ note: z.string().trim().max(500).optional() });

returnsRouter.post("/:id/approve", requirePermission("returns:decide"), async (req, res) => {
  await approveReturn(staff(req), param(req.params.id), noteBody.parse(req.body ?? {}).note);
  res.json({ ok: true });
});

returnsRouter.post("/:id/reject", requirePermission("returns:decide"), async (req, res) => {
  const body = z.object({ reason: z.enum(Object.keys(REJECT_REASONS) as [keyof typeof REJECT_REASONS]), note: z.string().trim().max(500).optional() }).parse(req.body);
  if (body.reason === "other" && !body.note) throw badRequest("Describe the reason for rejecting");
  await rejectReturn(staff(req), param(req.params.id), body.reason, body.note);
  res.json({ ok: true });
});

returnsRouter.post("/:id/escalate", requirePermission("returns:decide"), async (req, res) => {
  await escalateReturn(staff(req), param(req.params.id), noteBody.parse(req.body ?? {}).note);
  res.json({ ok: true });
});

const pickupBody = z.object({
  courier: z.string().trim().min(2, "Choose a courier").max(40),
  awb: z.string().trim().min(4, "Enter the AWB / tracking number").max(40).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  scheduledFor: z.coerce.date().optional(),
  pickupWindow: z.string().trim().max(40).optional(),
});

returnsRouter.post("/:id/pickup", requirePermission("pickups:manage"), async (req, res) => {
  await schedulePickup(staff(req), param(req.params.id), pickupBody.parse(req.body));
  res.json({ ok: true });
});

const trackingBody = z.object({
  status: z.enum(Object.keys(CHECKPOINTS) as [keyof typeof CHECKPOINTS]).refine((s) => s !== "scheduled", "Choose a tracking status"),
  location: z.string().trim().max(80).optional(),
  note: z.string().trim().max(200).optional(),
});

returnsRouter.post("/:id/tracking", requirePermission("pickups:manage"), async (req, res) => {
  const a = auth(req);
  const body = trackingBody.parse(req.body);
  const sh = await db.shipment.findFirst({ where: { returnId: param(req.params.id), organizationId: a.orgId } });
  if (!sh) throw badRequest("Schedule a pickup first");
  await recordCheckpoint(a.orgId, sh.id, { ...body, source: "manual" }, a.actor, req);
  res.json({ ok: true });
});

// ───────────────────────── Milestone 3: receive, inspect, resolve ─────────────────────────

returnsRouter.post("/:id/receive", requirePermission("inspection:perform"), async (req, res) => {
  await markReceived(staff(req), param(req.params.id));
  res.json({ ok: true });
});

const checklistSchema = z.object({
  packaging: z.enum(["pass", "fail"]),
  tags: z.enum(["pass", "fail"]),
  damage: z.enum(["pass", "fail"]),
  usage: z.enum(["pass", "fail"]),
});

returnsRouter.post("/:id/items/:itemId/analyze", requirePermission("inspection:perform"), async (req, res) => {
  const { checklist } = z.object({ checklist: checklistSchema }).parse(req.body);
  res.json(await suggestCondition(auth(req).orgId, param(req.params.id), param(req.params.itemId), checklist));
});

const inspectionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => (IMAGE_TYPES.includes(file.mimetype) && file.mimetype !== "image/svg+xml" ? cb(null, true) : cb(badRequest("Photos must be JPG, PNG, WEBP or HEIC"))),
});

const inspectionBody = z.object({
  checklist: checklistSchema,
  grade: z.enum(["A", "B", "C", "D"]),
  disposition: z.enum(["restock", "refurbish", "damaged", "dispose"]),
  notes: z.string().trim().max(1000).optional(),
  aiSuggestion: z
    .object({ grade: z.enum(["A", "B", "C", "D"]), disposition: z.string(), mismatch: z.boolean(), explanation: z.string().max(1000), source: z.enum(["claude", "rules"]) })
    .nullable()
    .optional(),
});

returnsRouter.post("/:id/items/:itemId/inspect", requirePermission("inspection:perform"), inspectionUpload.array("photos", 6), async (req, res) => {
  const a = auth(req);
  let raw: unknown;
  try {
    raw = JSON.parse(String(req.body?.payload ?? ""));
  } catch {
    throw badRequest("Malformed request");
  }
  const body = inspectionBody.parse(raw);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const photos = await Promise.all(files.map(async (f) => ({ key: await putFile(a.orgId, "inspections", f.buffer, f.mimetype), mime: f.mimetype, size: f.size })));
  const result = await recordInspection(staff(req), param(req.params.id), param(req.params.itemId), { ...body, aiSuggestion: body.aiSuggestion as never, photos });
  res.json(result);
});

const resolveBody = z.object({
  kind: z.enum(["refund", "store_credit", "replacement"]),
  method: z.enum(["razorpay", "manual", "store_credit", "replacement"]),
  amount: z.coerce.number().nonnegative().optional(),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
});

returnsRouter.post("/:id/resolve", requirePermission("refunds:issue"), async (req, res) => {
  const refund = await resolveReturn(staff(req), param(req.params.id), resolveBody.parse(req.body));
  res.json(refund);
});
