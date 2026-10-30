import { Router, type Response } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { RETURN_REASONS } from "../returns/reasons.js";
import { rma } from "./shared.js";
import { findAllInPages } from "../lib/batch.js";

export const analyticsRouter = Router();
analyticsRouter.use(requirePermission("analytics:view"));

const DAY = 864e5;
const REASON_LABEL = Object.fromEntries(RETURN_REASONS.map((r) => [r.code, r.label]));
const rangeQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90, 365].includes(d), "Choose 7, 30, 90 or 365 days").default(30) });

/** One query pass that every view (JSON, CSV, PDF) is built from. */
async function compute(orgId: string, days: number) {
  const since = new Date(Date.now() - days * DAY);
  const [org, orders, returns, refunds, movements] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true, currency: true } }),
    findAllInPages((p) => db.order.findMany({ ...p, orderBy: { id: "asc" }, where: { organizationId: orgId, placedAt: { gte: since } }, select: { id: true, status: true, shippingAddress: true, items: { select: { sku: true, name: true, quantity: true } } } })),
    findAllInPages((p) => db.returnRequest.findMany({
      ...p,
      orderBy: { id: "asc" },
      where: { organizationId: orgId, createdAt: { gte: since } },
      include: {
        items: { select: { reason: true, aiReason: true, quantity: true, orderItem: { select: { sku: true, name: true, unitPriceMinor: true } } } },
        events: { where: { type: "status" }, select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        order: { select: { shippingAddress: true } },
      },
    })),
    db.refund.findMany({ where: { organizationId: orgId, createdAt: { gte: since }, status: { not: "failed" } } }),
    db.inventoryMovement.findMany({ where: { organizationId: orgId, createdAt: { gte: since } }, select: { disposition: true, quantity: true } }),
  ]);

  const shipped = orders.filter((o) => o.status === "fulfilled" || o.status === "delivered");
  const shippedIds = new Set(shipped.map((o) => o.id));
  const returnedOrders = new Set(returns.filter((r) => shippedIds.has(r.orderId)).map((r) => r.orderId));
  const resolved = returns.filter((r) => r.resolvedAt);
  const avgHours = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const at = (r: (typeof returns)[number], status: string) => r.events.find((e) => e.status === status)?.createdAt.getTime();

  // Time series: daily for ≤ 30 days, weekly otherwise
  const bucketDays = days <= 30 ? 1 : 7;
  const buckets = Math.ceil(days / bucketDays);
  const start = new Date(since);
  start.setUTCHours(0, 0, 0, 0);
  const series = Array.from({ length: buckets }, (_, i) => ({ date: new Date(start.getTime() + i * bucketDays * DAY).toISOString().slice(0, 10), returns: 0, refundedMinor: 0 }));
  const idx = (d: Date) => Math.min(buckets - 1, Math.max(0, Math.floor((d.getTime() - start.getTime()) / (bucketDays * DAY))));
  returns.forEach((r) => series[idx(r.createdAt)].returns++);
  refunds.forEach((f) => (series[idx(f.createdAt)].refundedMinor += f.amountMinor));

  // Reasons (AI-cleaned when available)
  const reasons = new Map<string, number>();
  for (const r of returns) for (const i of r.items) reasons.set(i.aiReason ?? i.reason, (reasons.get(i.aiReason ?? i.reason) ?? 0) + i.quantity);

  // Products: returned units vs sold units in range
  const sold = new Map<string, { name: string; units: number }>();
  for (const o of shipped) for (const i of o.items) sold.set(i.sku, { name: i.name, units: (sold.get(i.sku)?.units ?? 0) + i.quantity });
  const returnedBySku = new Map<string, { name: string; units: number; valueMinor: number }>();
  for (const r of returns.filter((x) => x.status !== "rejected"))
    for (const i of r.items) {
      const e = returnedBySku.get(i.orderItem.sku) ?? { name: i.orderItem.name, units: 0, valueMinor: 0 };
      e.units += i.quantity;
      e.valueMinor += i.quantity * i.orderItem.unitPriceMinor;
      returnedBySku.set(i.orderItem.sku, e);
    }
  const products = [...returnedBySku.entries()]
    .map(([sku, v]) => ({ sku, name: v.name, returned: v.units, sold: sold.get(sku)?.units ?? null, returnRate: sold.get(sku)?.units ? v.units / sold.get(sku)!.units : null, valueMinor: v.valueMinor }))
    .sort((a, b) => b.returned - a.returned || b.valueMinor - a.valueMinor)
    .slice(0, 10);

  // Processing time by stage (hours)
  const stage = (from: string, to: string) => avgHours(returns.map((r) => [at(r, from), at(r, to)]).filter(([a, b]) => a && b).map(([a, b]) => (b! - a!) / 36e5));
  const stages = [
    { key: "decision", label: "Request → decision", hours: avgHours(returns.map((r) => [at(r, "requested"), at(r, "approved") ?? at(r, "rejected")]).filter(([a, b]) => a && b).map(([a, b]) => (b! - a!) / 36e5)) },
    { key: "pickup", label: "Approved → pickup booked", hours: stage("approved", "pickup_scheduled") },
    { key: "transit", label: "Pickup → at warehouse", hours: stage("pickup_scheduled", "received") },
    { key: "resolution", label: "At warehouse → resolved", hours: avgHours(resolved.map((r) => [at(r, "received"), r.resolvedAt!.getTime()]).filter(([a, b]) => a && b).map(([a, b]) => (b! - a!) / 36e5)) },
  ];

  const cities = new Map<string, number>();
  for (const r of returns) {
    const city = r.order.shippingAddress ? (JSON.parse(r.order.shippingAddress).city as string | undefined) : undefined;
    if (city) cities.set(city, (cities.get(city) ?? 0) + 1);
  }

  const units = (d: string) => movements.filter((m) => m.disposition === d).reduce((s, m) => s + m.quantity, 0);
  const inspectedUnits = movements.reduce((s, m) => s + m.quantity, 0);
  const sum = (kind: string) => refunds.filter((f) => f.kind === kind).reduce((s, f) => s + f.amountMinor, 0);
  const auto = returns.filter((r) => r.decisionReason && !r.decidedById && ["approved", "rejected"].includes(r.events[1]?.status ?? "")).length;

  return {
    organization: org.name,
    currency: org.currency,
    days,
    since,
    kpis: {
      orders: shipped.length,
      returns: returns.length,
      returnRate: shipped.length ? returnedOrders.size / shipped.length : 0,
      refundedMinor: sum("refund"),
      storeCreditMinor: sum("store_credit"),
      replacements: refunds.filter((f) => f.kind === "replacement").length,
      avgResolutionHours: avgHours(resolved.map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 36e5)),
      restockRate: inspectedUnits ? units("restock") / inspectedUnits : null,
      automationRate: returns.length ? auto / returns.length : 0,
      rejected: returns.filter((r) => r.status === "rejected").length,
    },
    series,
    bucket: bucketDays === 1 ? "day" : "week",
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, label: REASON_LABEL[reason] ?? reason, count })).sort((a, b) => b.count - a.count),
    products,
    stages,
    resolutions: ["refund", "store_credit", "replacement"].map((k) => ({ resolution: k, count: returns.filter((r) => r.resolution === k).length })),
    locations: [...cities.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    dispositions: ["restock", "refurbish", "damaged", "dispose"].map((d) => ({ disposition: d, units: units(d) })),
  };
}

analyticsRouter.get("/", async (req, res) => {
  const { days } = rangeQuery.parse(req.query);
  res.json(await compute(auth(req).orgId, days));
});

// ───────────────────────── CSV exports ─────────────────────────

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection and quote when needed
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
const major = (minor: number) => (minor / 100).toFixed(2);

function sendCsv(res: Response, name: string, rows: unknown[][]) {
  res.type("text/csv").attachment(name).send("﻿" + toCsv(rows));
}

analyticsRouter.get("/export/returns.csv", async (req, res) => {
  const a = auth(req);
  const { days } = rangeQuery.parse(req.query);
  const rows = await findAllInPages((p) => db.returnRequest.findMany({
    ...p,
    where: { organizationId: a.orgId, createdAt: { gte: new Date(Date.now() - days * DAY) } },
    orderBy: { number: "asc" },
    include: { order: { select: { orderNumber: true, paymentMethod: true } }, customer: { select: { name: true, email: true } }, items: { include: { orderItem: { select: { sku: true, name: true } } } }, refunds: { where: { status: { not: "failed" } } } },
  }));
  await audit({ organizationId: a.orgId, actor: a.actor, action: "report.exported", meta: { report: "returns.csv", days }, req });
  sendCsv(res, `returns-last-${days}-days.csv`, [
    ["rma", "created_at", "status", "order_number", "customer", "email", "payment_method", "items", "skus", "reasons", "requested_outcome", "value", "currency", "risk_score", "resolved_at", "resolution_kind", "resolved_amount", "reference"],
    ...rows.map((r) => [
      rma(r.number), r.createdAt.toISOString(), r.status, r.order.orderNumber, r.customer.name, r.customer.email, r.order.paymentMethod,
      r.items.reduce((s, i) => s + i.quantity, 0), r.items.map((i) => i.orderItem.sku).join(" "), [...new Set(r.items.map((i) => i.reason))].join(" "),
      r.resolution, major(r.valueMinor), r.currency, r.riskScore, r.resolvedAt?.toISOString(), r.refunds[0]?.kind, r.refunds[0] ? major(r.refunds[0].amountMinor) : "", r.refunds[0]?.reference,
    ]),
  ]);
});

analyticsRouter.get("/export/refunds.csv", async (req, res) => {
  const a = auth(req);
  const { days } = rangeQuery.parse(req.query);
  const rows = await db.refund.findMany({
    where: { organizationId: a.orgId, createdAt: { gte: new Date(Date.now() - days * DAY) } },
    orderBy: { createdAt: "asc" },
    include: { returnRequest: { select: { number: true, order: { select: { orderNumber: true } }, customer: { select: { name: true, email: true } } } } },
  });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "report.exported", meta: { report: "refunds.csv", days }, req });
  sendCsv(res, `refunds-last-${days}-days.csv`, [
    ["created_at", "rma", "order_number", "customer", "kind", "method", "status", "amount", "currency", "reference", "mode", "issued_by", "note"],
    ...rows.map((f) => [f.createdAt.toISOString(), rma(f.returnRequest.number), f.returnRequest.order.orderNumber, f.returnRequest.customer.name ?? f.returnRequest.customer.email, f.kind, f.method, f.status, major(f.amountMinor), f.currency, f.reference, f.gatewayMode ?? "", f.createdByName, f.note]),
  ]);
});

// ───────────────────────── PDF report ─────────────────────────

analyticsRouter.get("/report.pdf", async (req, res) => {
  const a = auth(req);
  const { days } = rangeQuery.parse(req.query);
  const d = await compute(a.orgId, days);
  await audit({ organizationId: a.orgId, actor: a.actor, action: "report.exported", meta: { report: "summary.pdf", days }, req });

  const money = (minor: number) => `${d.currency === "INR" ? "Rs " : d.currency + " "}${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
  const hrs = (h: number | null) => (h === null ? "—" : h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`);
  const ink = "#15171a", muted = "#6b6860", line = "#e3dfd6", kraft = "#c48a3f";

  res.type("application/pdf").attachment(`returnflow-report-${days}d.pdf`);
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${d.organization} – Returns report`, Author: "ReturnFlow" } });
  doc.pipe(res);
  const W = doc.page.width - 96;

  doc.rect(0, 0, doc.page.width, 6).fill(kraft);
  doc.fillColor(muted).fontSize(9).text("RETURNFLOW · RETURNS REPORT", 48, 40, { characterSpacing: 1 });
  doc.fillColor(ink).fontSize(22).text(d.organization, 48, 56);
  doc.fillColor(muted).fontSize(10).text(`Last ${days} days · ${d.since.toDateString().slice(4)} – ${new Date().toDateString().slice(4)}`, 48, 84);

  // KPI grid
  const kpis: [string, string][] = [
    ["Return rate", pct(d.kpis.returnRate)],
    ["Return requests", String(d.kpis.returns)],
    ["Refunded", money(d.kpis.refundedMinor)],
    ["Store credit", money(d.kpis.storeCreditMinor)],
    ["Avg. resolution", hrs(d.kpis.avgResolutionHours)],
    ["Restock rate", pct(d.kpis.restockRate)],
  ];
  const cw = W / 3, ch = 58;
  kpis.forEach(([label, value], i) => {
    const x = 48 + (i % 3) * cw, y = 112 + Math.floor(i / 3) * ch;
    doc.rect(x, y, cw - 8, ch - 8).lineWidth(0.7).strokeColor(line).stroke();
    doc.fillColor(muted).fontSize(8.5).text(label, x + 10, y + 10);
    doc.fillColor(ink).fontSize(16).text(value, x + 10, y + 24);
  });

  let y = 112 + 2 * ch + 14;
  const heading = (t: string) => {
    doc.fillColor(ink).fontSize(12).text(t, 48, y);
    y += 20;
  };
  const bars = (rows: { label: string; value: number; note?: string }[]) => {
    const max = Math.max(1, ...rows.map((r) => r.value));
    for (const r of rows) {
      doc.fillColor(ink).fontSize(9.5).text(r.label, 48, y, { width: 150 });
      doc.rect(205, y + 2, (W - 260) * (r.value / max), 7).fill(ink);
      doc.fillColor(muted).fontSize(9).text(r.note ?? String(r.value), 48 + W - 50, y, { width: 50, align: "right" });
      y += 17;
    }
    y += 10;
  };

  heading("Why customers return");
  bars(d.reasons.slice(0, 6).map((r) => ({ label: r.label, value: r.count })));

  heading("Most returned products");
  doc.fillColor(muted).fontSize(8.5);
  doc.text("Product", 48, y).text("SKU", 250, y).text("Returned", 380, y, { width: 60, align: "right" }).text("Return rate", 440, y, { width: 60, align: "right" });
  y += 14;
  doc.moveTo(48, y).lineTo(48 + W, y).lineWidth(0.5).strokeColor(line).stroke();
  y += 6;
  for (const p of d.products.slice(0, 8)) {
    doc.fillColor(ink).fontSize(9.5).text(p.name, 48, y, { width: 195 }).fillColor(muted).text(p.sku, 250, y, { width: 125 }).fillColor(ink).text(String(p.returned), 380, y, { width: 60, align: "right" }).text(pct(p.returnRate), 440, y, { width: 60, align: "right" });
    y += 16;
  }
  y += 12;

  if (y > 640) {
    doc.addPage();
    y = 48;
  }
  heading("Processing time by stage");
  bars(d.stages.map((s) => ({ label: s.label.replace(/ → /g, " to "), value: s.hours ?? 0, note: hrs(s.hours) })));

  heading("Outcomes");
  bars([
    ...d.resolutions.map((r) => ({ label: `Asked for ${r.resolution.replace("_", " ")}`, value: r.count })),
    ...d.dispositions.map((x) => ({ label: `Inspected: ${x.disposition}`, value: x.units, note: `${x.units} unit${x.units === 1 ? "" : "s"}` })),
  ]);

  doc.fillColor(muted).fontSize(8).text(`Generated ${new Date().toLocaleString("en-IN")} by ${a.name}`, 48, doc.page.height - 60, { width: W, align: "center" });
  doc.end();
});
