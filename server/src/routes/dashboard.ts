import { Router } from "express";
import { db } from "../db.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { rma } from "./shared.js";

export const dashboardRouter = Router();

const DAY = 864e5;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

dashboardRouter.get("/", requirePermission("dashboard:view"), async (req, res) => {
  const { orgId } = auth(req);
  const now = new Date();
  const since14 = new Date(now.getTime() - 13 * DAY);
  since14.setUTCHours(0, 0, 0, 0);
  const since30 = new Date(now.getTime() - 30 * DAY);

  const [org, orderCount, shippedOrders, ordersWithReturns, returns30, awaitingReview, valueAgg, recentReturns, recentReturnsWindow, recentOrdersWindow, reasons, syncRuns, shopify, apiKeys] =
    await Promise.all([
      db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { currency: true, slug: true } }),
      db.order.count({ where: { organizationId: orgId } }),
      db.order.count({ where: { organizationId: orgId, status: { in: ["fulfilled", "delivered"] } } }),
      db.order.count({ where: { organizationId: orgId, returns: { some: {} } } }),
      db.returnRequest.count({ where: { organizationId: orgId, createdAt: { gte: since30 } } }),
      db.returnRequest.count({ where: { organizationId: orgId, status: "requested" } }),
      db.returnRequest.aggregate({ where: { organizationId: orgId, status: { notIn: ["rejected", "closed"] } }, _sum: { valueMinor: true } }),
      db.returnRequest.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { customer: { select: { name: true, email: true } }, order: { select: { orderNumber: true } }, items: { select: { reason: true } } },
      }),
      db.returnRequest.findMany({ where: { organizationId: orgId, createdAt: { gte: since14 } }, select: { createdAt: true } }),
      db.order.findMany({ where: { organizationId: orgId, placedAt: { gte: since14 } }, select: { placedAt: true } }),
      db.returnItem.groupBy({ by: ["reason"], where: { returnRequest: { organizationId: orgId } }, _sum: { quantity: true } }),
      db.syncRun.findMany({ where: { organizationId: orgId }, orderBy: { startedAt: "desc" }, take: 5 }),
      db.integration.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider: "shopify" } }, select: { status: true, mode: true, displayName: true, lastSyncedAt: true } }),
      db.apiKey.count({ where: { organizationId: orgId, revokedAt: null } }),
    ]);

  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since14.getTime() + i * DAY);
    return { date: dayKey(d), returns: 0, orders: 0 };
  });
  const byDay = new Map(series.map((s) => [s.date, s]));
  recentReturnsWindow.forEach((r) => byDay.get(dayKey(r.createdAt)) && byDay.get(dayKey(r.createdAt))!.returns++);
  recentOrdersWindow.forEach((o) => byDay.get(dayKey(o.placedAt)) && byDay.get(dayKey(o.placedAt))!.orders++);

  res.json({
    currency: org.currency,
    portalSlug: org.slug,
    kpis: {
      orders: orderCount,
      returnRate: shippedOrders ? ordersWithReturns / shippedOrders : 0,
      returns30d: returns30,
      awaitingReview,
      openValueMinor: valueAgg._sum.valueMinor ?? 0,
    },
    series,
    reasons: reasons.map((r) => ({ reason: r.reason, count: r._sum.quantity ?? 0 })).sort((a, b) => b.count - a.count),
    recentReturns: recentReturns.map((r) => ({
      id: r.id,
      rma: rma(r.number),
      status: r.status,
      resolution: r.resolution,
      valueMinor: r.valueMinor,
      currency: r.currency,
      createdAt: r.createdAt,
      orderNumber: r.order.orderNumber,
      customer: r.customer.name ?? r.customer.email,
      reasons: [...new Set(r.items.map((i) => i.reason))],
    })),
    syncRuns,
    channels: { shopify, apiKeys },
  });
});
