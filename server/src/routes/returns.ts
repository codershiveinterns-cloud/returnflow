import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { notFound } from "../lib/errors.js";
import { auth, requirePermission } from "../auth/middleware.js";
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
});

returnsRouter.get("/", requirePermission("returns:view"), async (req, res) => {
  const { orgId } = auth(req);
  const q = listQuery.parse(req.query);
  const term = q.q?.replace(/^#/, "").replace(/^rf-/i, "");
  const where: Prisma.ReturnRequestWhereInput = {
    organizationId: orgId,
    ...(q.status && { status: q.status }),
    ...(q.resolution && { resolution: q.resolution }),
    ...(q.reason && { items: { some: { reason: q.reason } } }),
    ...(q.minValue !== undefined && { valueMinor: { gte: Math.round(q.minValue * 100) } }),
    ...(term && {
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
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
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
    })),
  });
});

returnsRouter.get("/meta", requirePermission("returns:view"), (_req, res) => {
  res.json({ statuses: RETURN_STATUSES, reasons: RETURN_REASONS, resolutions: RESOLUTIONS });
});

returnsRouter.get("/:id", requirePermission("returns:view"), async (req, res) => {
  const { orgId } = auth(req);
  const r = await db.returnRequest.findFirst({
    where: { id: param(req.params.id), organizationId: orgId },
    include: {
      order: { select: { id: true, orderNumber: true, placedAt: true, deliveredAt: true, status: true, paymentMethod: true, totalMinor: true, source: true } },
      customer: { include: { _count: { select: { orders: true, returns: true } } } },
      items: { include: { orderItem: true, photos: { select: { id: true } } } },
      photos: { where: { returnItemId: null }, select: { id: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!r) throw notFound("Return not found");
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
      photos: i.photos.map((p) => `/api/files/photos/${p.id}`),
    })),
    extraPhotos: r.photos.map((p) => `/api/files/photos/${p.id}`),
    events: r.events.map((e) => ({ id: e.id, type: e.type, status: e.status, message: e.message, actorType: e.actorType, actorLabel: e.actorLabel, createdAt: e.createdAt })),
  });
});
