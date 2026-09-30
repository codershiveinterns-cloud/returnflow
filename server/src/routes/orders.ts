import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { audit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { CSV_TEMPLATE, parseOrdersCsv } from "../orders/csv.js";
import { ingestOrders, recordSync } from "../orders/ingest.js";
import { ORDER_STATUSES } from "../orders/schema.js";
import { pagination, param, rma } from "./shared.js";

export const ordersRouter = Router();

const listQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  source: z.enum(["shopify", "api", "webhook", "csv"]).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});

ordersRouter.get("/", requirePermission("orders:view"), async (req, res) => {
  const { orgId } = auth(req);
  const q = listQuery.parse(req.query);
  const term = q.q?.replace(/^#/, "");
  const where: Prisma.OrderWhereInput = {
    organizationId: orgId,
    ...(q.source && { source: q.source }),
    ...(q.status && { status: q.status }),
    ...(term && {
      OR: [
        { orderNumber: { contains: term } },
        { customer: { email: { contains: term.toLowerCase() } } },
        { customer: { name: { contains: term } } },
        { items: { some: { sku: { contains: term } } } },
      ],
    }),
  };
  const [total, orders, counts] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { customer: { select: { name: true, email: true } }, _count: { select: { items: true, returns: true } } },
    }),
    db.order.groupBy({ by: ["source"], where: { organizationId: orgId }, _count: true }),
  ]);
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    sourceCounts: Object.fromEntries(counts.map((c) => [c.source, c._count])),
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      source: o.source,
      status: o.status,
      paymentMethod: o.paymentMethod,
      currency: o.currency,
      totalMinor: o.totalMinor,
      placedAt: o.placedAt,
      deliveredAt: o.deliveredAt,
      customer: o.customer,
      itemCount: o._count.items,
      returnCount: o._count.returns,
      updatedAt: o.updatedAt,
    })),
  });
});

ordersRouter.get("/import/template.csv", requirePermission("orders:view"), (_req, res) => {
  res.type("text/csv").attachment("returnflow-orders-template.csv").send(CSV_TEMPLATE);
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

ordersRouter.post("/import", requirePermission("orders:import"), upload.single("file"), async (req, res) => {
  const a = auth(req);
  if (!req.file) throw badRequest("Choose a CSV file to import");
  if (!/\.csv$/i.test(req.file.originalname) && !/csv|text\/plain|excel/.test(req.file.mimetype)) throw badRequest("The file must be a .csv");
  const parsed = parseOrdersCsv(req.file.buffer.toString("utf8"));
  const commit = req.body?.commit === "true";

  if (parsed.missingColumns.length) {
    res.status(422).json({ error: { code: "missing_columns", message: `Missing required column${parsed.missingColumns.length > 1 ? "s" : ""}: ${parsed.missingColumns.join(", ")}`, details: parsed } });
    return;
  }

  if (!commit) {
    const existing = await db.order.findMany({
      where: { organizationId: a.orgId, orderNumber: { in: parsed.orders.map((o) => o.order_number) } },
      select: { orderNumber: true },
    });
    const existingSet = new Set(existing.map((e) => e.orderNumber));
    res.json({
      fileName: req.file.originalname,
      rowCount: parsed.rowCount,
      orderCount: parsed.orders.length,
      itemCount: parsed.orders.reduce((s, o) => s + o.items.length, 0),
      newCount: parsed.orders.filter((o) => !existingSet.has(o.order_number)).length,
      updateCount: parsed.orders.filter((o) => existingSet.has(o.order_number)).length,
      errors: parsed.errors,
      sample: parsed.orders.slice(0, 8).map((o) => ({
        orderNumber: o.order_number,
        placedAt: o.placed_at,
        status: o.status,
        customer: o.customer.name ?? o.customer.email,
        email: o.customer.email,
        items: o.items.length,
        currency: o.currency ?? null,
        total: o.items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
        exists: existingSet.has(o.order_number),
      })),
    });
    return;
  }

  const result = await recordSync(a.orgId, { source: "csv", trigger: "upload", label: req.file.originalname }, async () => {
    const r = await ingestOrders(a.orgId, parsed.orders, "csv");
    return { ...r, received: parsed.orders.length + parsed.errors.length, failed: r.failed + parsed.errors.length, errors: [...parsed.errors, ...r.errors] };
  });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "orders.csv_imported", entityType: "sync_run", entityId: result.syncRunId, meta: { file: req.file.originalname, created: result.created, updated: result.updated, failed: result.failed }, req });
  res.json({ syncRunId: result.syncRunId, created: result.created, updated: result.updated, failed: result.failed, errors: result.errors });
});

ordersRouter.get("/:id", requirePermission("orders:view"), async (req, res) => {
  const { orgId } = auth(req);
  const o = await db.order.findFirst({
    where: { id: param(req.params.id), organizationId: orgId },
    include: {
      customer: { include: { _count: { select: { orders: true, returns: true } } } },
      items: { include: { returnItems: { select: { quantity: true } } } },
      returns: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, resolution: true, valueMinor: true, createdAt: true } },
    },
  });
  if (!o) throw notFound("Order not found");
  res.json({
    id: o.id,
    orderNumber: o.orderNumber,
    externalId: o.externalId,
    source: o.source,
    status: o.status,
    paymentMethod: o.paymentMethod,
    currency: o.currency,
    totalMinor: o.totalMinor,
    placedAt: o.placedAt,
    deliveredAt: o.deliveredAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    shippingAddress: o.shippingAddress ? JSON.parse(o.shippingAddress) : null,
    customer: { id: o.customer.id, name: o.customer.name, email: o.customer.email, phone: o.customer.phone, orderCount: o.customer._count.orders, returnCount: o.customer._count.returns },
    items: o.items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, variant: i.variant, category: i.category, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, imageUrl: i.imageUrl, returnedQuantity: i.returnItems.reduce((s, r) => s + r.quantity, 0) })),
    returns: o.returns.map((r) => ({ ...r, rma: rma(r.number) })),
  });
});
