import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { rateLimit } from "../lib/rateLimit.js";
import { requireApiKey } from "../auth/middleware.js";
import { ingestOrders, recordSync } from "../orders/ingest.js";
import { normalizeOrderNumber } from "../orders/schema.js";
import { RETURN_STATUSES } from "../returns/status.js";
import { param, rma } from "./shared.js";

/** Versioned machine API, authenticated with per-workspace API keys. */
export const publicApiRouter = Router();
publicApiRouter.use(rateLimit({ windowMs: 60_000, max: 120, key: (req) => req.header("authorization")?.slice(0, 20) ?? req.ip ?? "" }));
publicApiRouter.use(requireApiKey);

publicApiRouter.post("/orders", async (req, res) => {
  const key = req.apiKey!;
  const batch = Array.isArray(req.body?.orders) ? req.body.orders : req.body && typeof req.body === "object" && !Array.isArray(req.body) ? [req.body] : null;
  if (!batch || !batch.length) throw badRequest("Send an order object, or { \"orders\": [...] }");
  if (batch.length > 100) throw badRequest("A single request can contain at most 100 orders");
  const result = await recordSync(key.orgId, { source: "api", trigger: "api", label: key.name }, () => ingestOrders(key.orgId, batch, "api"));
  await audit({ organizationId: key.orgId, actor: key.actor, action: "orders.api_upsert", entityType: "sync_run", entityId: result.syncRunId, meta: { created: result.created, updated: result.updated, failed: result.failed } });
  const status = result.failed === batch.length ? 422 : result.created && !result.updated && !result.failed ? 201 : 200;
  res.status(status).json({ received: result.received, created: result.created, updated: result.updated, failed: result.failed, errors: result.errors });
});

publicApiRouter.get("/orders/:orderNumber", async (req, res) => {
  const key = req.apiKey!;
  const o = await db.order.findUnique({
    where: { organizationId_orderNumber: { organizationId: key.orgId, orderNumber: normalizeOrderNumber(param(req.params.orderNumber)) } },
    include: { customer: true, items: true, returns: { select: { number: true, status: true, createdAt: true } } },
  });
  if (!o) throw notFound("Order not found");
  res.json({
    order_number: o.orderNumber,
    status: o.status,
    source: o.source,
    placed_at: o.placedAt,
    currency: o.currency,
    total_minor: o.totalMinor,
    customer: { email: o.customer.email, name: o.customer.name, phone: o.customer.phone },
    items: o.items.map((i) => ({ sku: i.sku, name: i.name, variant: i.variant, quantity: i.quantity, unit_price_minor: i.unitPriceMinor })),
    returns: o.returns.map((r) => ({ rma: rma(r.number), status: r.status, created_at: r.createdAt })),
  });
});

publicApiRouter.get("/returns", async (req, res) => {
  const key = req.apiKey!;
  const q = z.object({ status: z.enum(RETURN_STATUSES).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
  const rows = await db.returnRequest.findMany({
    where: { organizationId: key.orgId, ...(q.status && { status: q.status }) },
    orderBy: { createdAt: "desc" },
    take: q.limit,
    include: { order: { select: { orderNumber: true } }, items: { include: { orderItem: { select: { sku: true } } } } },
  });
  res.json({
    returns: rows.map((r) => ({
      rma: rma(r.number),
      status: r.status,
      resolution: r.resolution,
      order_number: r.order.orderNumber,
      value_minor: r.valueMinor,
      currency: r.currency,
      created_at: r.createdAt,
      items: r.items.map((i) => ({ sku: i.orderItem.sku, quantity: i.quantity, reason: i.reason })),
    })),
  });
});
