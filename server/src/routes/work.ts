import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { notFound } from "../lib/errors.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { parseList } from "../returns/eligibility.js";
import { canResolve, syncRestock } from "../returns/resolution.js";
import { rma } from "./shared.js";

/** Role work queues for Milestone 3: warehouse inspection, finance refunds, inventory, risk. */
export const workRouter = Router();

const DAY = 864e5;

workRouter.get("/inspections", requirePermission("inspection:perform"), async (req, res) => {
  const { orgId } = auth(req);
  const rows = await db.returnRequest.findMany({
    where: { organizationId: orgId, status: { in: ["pickup_scheduled", "in_transit", "received", "inspected"] } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      customer: { select: { name: true, email: true } },
      shipment: { select: { courier: true, awb: true, status: true } },
      items: { include: { orderItem: { select: { name: true, variant: true, sku: true } }, inspection: { select: { grade: true, disposition: true } } } },
    },
  });
  const shape = (r: (typeof rows)[number]) => ({
    id: r.id,
    rma: rma(r.number),
    status: r.status,
    customer: r.customer.name ?? r.customer.email,
    reasons: [...new Set(r.items.map((i) => i.reason))],
    holdRefund: r.holdRefund,
    riskLevel: r.riskLevel,
    shipment: r.shipment,
    items: r.items.map((i) => ({ id: i.id, name: i.orderItem.name, variant: i.orderItem.variant, sku: i.orderItem.sku, quantity: i.quantity, reason: i.reason, inspection: i.inspection })),
    updatedAt: r.updatedAt,
  });
  res.json({
    toInspect: rows.filter((r) => r.status === "received").map(shape),
    incoming: rows.filter((r) => r.status === "in_transit" || r.status === "pickup_scheduled").map(shape),
    recent: rows.filter((r) => r.status === "inspected").slice(0, 20).map(shape),
  });
});

workRouter.get("/refunds", requirePermission("refunds:issue"), async (req, res) => {
  const { orgId } = auth(req);
  const [open, done] = await Promise.all([
    db.returnRequest.findMany({
      where: { organizationId: orgId, status: { in: ["received", "inspected"] } },
      orderBy: { updatedAt: "asc" },
      include: { customer: { select: { name: true, email: true } }, order: { select: { orderNumber: true, paymentMethod: true, paymentRef: true } }, items: { include: { inspection: { select: { grade: true, mismatch: true } } } } },
    }),
    db.refund.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 50, include: { returnRequest: { select: { id: true, number: true, customer: { select: { name: true, email: true } } } } } }),
  ]);
  const card = (r: (typeof open)[number]) => ({
    id: r.id,
    rma: rma(r.number),
    status: r.status,
    resolution: r.resolution,
    valueMinor: r.valueMinor,
    currency: r.currency,
    customer: r.customer.name ?? r.customer.email,
    orderNumber: r.order.orderNumber,
    paymentMethod: r.order.paymentMethod,
    hasPaymentRef: !!r.order.paymentRef,
    riskLevel: r.riskLevel,
    holdRefund: r.holdRefund,
    grades: r.items.map((i) => i.inspection?.grade).filter(Boolean),
    mismatch: r.items.some((i) => i.inspection?.mismatch),
    resolvable: canResolve(r),
  });
  const cards = open.map(card);
  const totals = await db.refund.groupBy({ by: ["kind"], where: { organizationId: orgId, status: { not: "failed" }, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, _sum: { amountMinor: true }, _count: true });
  res.json({
    ready: cards.filter((c) => c.resolvable.ok),
    onHold: cards.filter((c) => !c.resolvable.ok),
    completed: done.map((d) => ({ ...d, rma: rma(d.returnRequest.number), returnId: d.returnRequest.id, customer: d.returnRequest.customer.name ?? d.returnRequest.customer.email })),
    last30d: Object.fromEntries(totals.map((t) => [t.kind, { amountMinor: t._sum.amountMinor ?? 0, count: t._count }])),
  });
});

workRouter.get("/inventory", requirePermission("inventory:view"), async (req, res) => {
  const { orgId } = auth(req);
  const q = z.object({ disposition: z.enum(["restock", "refurbish", "damaged", "dispose"]).optional() }).parse(req.query);
  const [rows, summary] = await Promise.all([
    db.inventoryMovement.findMany({ where: { organizationId: orgId, ...(q.disposition && { disposition: q.disposition }) }, orderBy: { createdAt: "desc" }, take: 200, include: { returnRequest: { select: { id: true, number: true } } } }),
    db.inventoryMovement.groupBy({ by: ["disposition"], where: { organizationId: orgId }, _sum: { quantity: true } }),
  ]);
  res.json({
    summary: Object.fromEntries(summary.map((s) => [s.disposition, s._sum.quantity ?? 0])),
    movements: rows.map((m) => ({ ...m, rma: rma(m.returnRequest.number), returnId: m.returnRequest.id })),
  });
});

workRouter.post("/inventory/:id/sync", requirePermission("inventory:view"), async (req, res) => {
  const { orgId } = auth(req);
  const mv = await db.inventoryMovement.findFirst({ where: { id: String(req.params.id), organizationId: orgId } });
  if (!mv) throw notFound();
  await syncRestock(orgId, mv.id);
  res.json(await db.inventoryMovement.findUnique({ where: { id: mv.id } }));
});

/**
 * Unusual-pattern detection: serial returners, repeated high-value claims,
 * product return spikes and location spikes (last 14 days vs the 14 before).
 */
workRouter.get("/risk", requirePermission("risk:view"), async (req, res) => {
  const { orgId } = auth(req);
  const now = Date.now();
  const since90 = new Date(now - 90 * DAY);
  const returns = await db.returnRequest.findMany({
    where: { organizationId: orgId, createdAt: { gte: since90 } },
    include: { customer: { select: { id: true, name: true, email: true } }, order: { select: { shippingAddress: true } }, items: { include: { orderItem: { select: { sku: true, name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const valid = returns.filter((r) => r.status !== "rejected");

  const byCustomer = new Map<string, { name: string; email: string; count: number; valueMinor: number; highValue: number; rmas: string[] }>();
  for (const r of valid) {
    const c = byCustomer.get(r.customer.id) ?? { name: r.customer.name ?? r.customer.email, email: r.customer.email, count: 0, valueMinor: 0, highValue: 0, rmas: [] };
    c.count++;
    c.valueMinor += r.valueMinor;
    if (r.valueMinor > 500_000) c.highValue++;
    c.rmas.push(rma(r.number));
    byCustomer.set(r.customer.id, c);
  }
  const customers = [...byCustomer.values()];

  const windowCount = <K extends string>(key: (r: (typeof returns)[number]) => K[] | K | null) => {
    const m = new Map<K, { recent: number; prior: number; label: string }>();
    for (const r of valid) {
      const age = now - r.createdAt.getTime();
      const bucket = age <= 14 * DAY ? "recent" : age <= 28 * DAY ? "prior" : null;
      if (!bucket) continue;
      const keys = key(r);
      for (const k of (Array.isArray(keys) ? keys : keys ? [keys] : []) as K[]) {
        const e = m.get(k) ?? { recent: 0, prior: 0, label: String(k) };
        e[bucket]++;
        m.set(k, e);
      }
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).filter((e) => e.recent >= 2 && e.recent >= 2 * Math.max(1, e.prior)).sort((a, b) => b.recent - a.recent);
  };
  const skuNames = new Map(valid.flatMap((r) => r.items.map((i) => [i.orderItem.sku, i.orderItem.name] as const)));

  res.json({
    highRisk: returns
      .filter((r) => r.riskLevel === "high" || (r.riskScore ?? 0) >= 45)
      .slice(0, 20)
      .map((r) => ({ id: r.id, rma: rma(r.number), status: r.status, score: r.riskScore, level: r.riskLevel, customer: r.customer.name ?? r.customer.email, valueMinor: r.valueMinor, currency: r.currency, factors: JSON.parse(r.riskFactors), flags: parseList(r.flags), createdAt: r.createdAt })),
    serialReturners: customers.filter((c) => c.count >= 3).sort((a, b) => b.count - a.count),
    highValueClaims: customers.filter((c) => c.highValue >= 2).sort((a, b) => b.valueMinor - a.valueMinor),
    productSpikes: windowCount((r) => [...new Set(r.items.map((i) => i.orderItem.sku))]).map((s) => ({ ...s, name: skuNames.get(s.key) ?? s.key })),
    locationSpikes: windowCount((r) => (r.order.shippingAddress ? (JSON.parse(r.order.shippingAddress).city as string) ?? null : null)),
    distribution: {
      low: returns.filter((r) => r.riskLevel === "low").length,
      medium: returns.filter((r) => r.riskLevel === "medium").length,
      high: returns.filter((r) => r.riskLevel === "high").length,
    },
  });
});
