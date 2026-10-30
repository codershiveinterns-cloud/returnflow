import { db, type Tx } from "../db.js";
import type { Order, OrderItem, Customer, Organization, ReturnRequest } from "../generated/prisma/client.js";
import { audit, type Actor } from "../lib/audit.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { can, type Role } from "../auth/rbac.js";
import { queueNotification } from "../notify/index.js";
import type { TemplateKey, TemplateVars } from "../notify/templates.js";
import { rma } from "../routes/shared.js";
import { evaluate, type Evaluation } from "./eligibility.js";
import { scoreRisk } from "./risk.js";
import { classifyReason } from "../ai/index.js";
import type { RuleContext } from "./rules.js";
import { TRANSITIONS, type ReturnStatus } from "./status.js";

/**
 * Return workflow service. Every state change goes through here so the
 * timeline (customer-visible), audit log (staff-visible) and notifications
 * stay consistent no matter which screen, API or webhook triggered it.
 */

const DAY = 864e5;
type Note = { key: TemplateKey; extra?: Partial<TemplateVars> };

const eventActor = (a: Actor) => ({
  actorType: a.type === "api_key" ? "system" : a.type,
  actorId: "id" in a ? a.id : undefined,
  actorLabel: a.label,
});

export async function moveTo(tx: Tx, ret: Pick<ReturnRequest, "id" | "status" | "organizationId">, to: ReturnStatus, actor: Actor, message: string, data: Record<string, unknown> = {}) {
  const allowed = TRANSITIONS[ret.status as ReturnStatus] ?? [];
  if (!allowed.includes(to)) throw badRequest(`A return can't move from “${ret.status.replace(/_/g, " ")}” to “${to.replace(/_/g, " ")}”`);
  // Compare-and-set: if another request changed the status meanwhile, stop instead of overwriting it.
  const { count } = await tx.returnRequest.updateMany({ where: { id: ret.id, status: ret.status }, data: { status: to, ...data } });
  if (count === 0) throw conflict("This return was just updated by someone else — refresh and try again");
  await tx.returnEvent.create({ data: { organizationId: ret.organizationId, returnId: ret.id, type: "status", status: to, message, ...eventActor(actor) } });
  ret.status = to;
}

async function note(tx: Tx, ret: Pick<ReturnRequest, "id" | "organizationId">, actor: Actor, message: string) {
  await tx.returnEvent.create({ data: { organizationId: ret.organizationId, returnId: ret.id, type: "note", message, ...eventActor(actor) } });
}

// ───────────────────────── Create (portal / staff / seed) ─────────────────────────

export type NewReturnLine = { orderItemId: string; quantity: number; reason: string; reasonDetail?: string | null; photos: { key: string; mime: string; size: number }[] };

export async function createReturn(input: {
  org: Organization;
  order: Order & { customer: Customer; items: OrderItem[] };
  lines: NewReturnLine[];
  resolution: string;
  note?: string | null;
  channel: "portal" | "staff";
  actor: Actor;
  createdAt?: Date;
  req?: Parameters<typeof audit>[0]["req"];
}) {
  const { org, order, lines } = input;
  const now = input.createdAt ?? new Date();
  const itemsById = new Map(order.items.map((i) => [i.id, i]));
  const valueMinor = lines.reduce((s, l) => s + l.quantity * itemsById.get(l.orderItemId)!.unitPriceMinor, 0);

  const [prior, rules] = await Promise.all([
    db.returnRequest.findMany({
      where: { organizationId: org.id, customerId: order.customerId, status: { not: "rejected" }, createdAt: { gte: new Date(now.getTime() - 90 * DAY), lte: now } },
      select: { valueMinor: true, items: { select: { reason: true } } },
    }),
    db.automationRule.findMany({ where: { organizationId: org.id, enabled: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
  ]);
  const history = prior.length;
  const daysSinceDelivery = Math.max(0, Math.floor((now.getTime() - (order.deliveredAt ?? order.placedAt).getTime()) / DAY));
  const risk = scoreRisk({
    valueMinor,
    returns90d: history,
    claimed90dMinor: prior.reduce((s, p) => s + p.valueMinor, 0),
    changedMind90d: prior.filter((p) => p.items.some((i) => i.reason === "changed_mind")).length,
    reasons: lines.map((l) => l.reason),
    hasPhotos: lines.some((l) => l.photos.length > 0),
    paymentMethod: order.paymentMethod,
    daysSinceDelivery,
    windowDays: org.returnWindowDays,
    orderToReturnRatio: order.totalMinor ? valueMinor / order.totalMinor : 0,
  });

  const ctx: RuleContext & { orderStatus: string; valueMinor: number } = {
    value: valueMinor / 100,
    valueMinor,
    reason: lines.map((l) => l.reason),
    category: lines.map((l) => itemsById.get(l.orderItemId)!.category ?? "").filter(Boolean),
    customer_returns_90d: history,
    days_since_delivery: daysSinceDelivery,
    payment_method: order.paymentMethod,
    item_count: lines.reduce((s, l) => s + l.quantity, 0),
    resolution: input.resolution,
    has_photos: lines.some((l) => l.photos.length > 0),
    risk_score: risk.score,
    orderStatus: order.status,
  };
  const result = evaluate(org, ctx, rules);
  if (risk.level === "high") {
    result.flags = [...new Set([...result.flags, "High return risk", "Refund on hold until inspection"])];
    result.holdRefund = true;
    if (result.outcome === "auto_approve") {
      result.outcome = "review";
      result.reason = `High return risk (score ${risk.score})`;
    }
  }
  const system: Actor = { type: "system", label: "ReturnFlow" };
  const notes: Note[] = [];

  const created = await db.$transaction(async (tx) => {
    const { nextReturnNumber } = await tx.organization.update({ where: { id: org.id }, data: { nextReturnNumber: { increment: 1 } }, select: { nextReturnNumber: true } });
    const number = nextReturnNumber - 1;
    const ret = await tx.returnRequest.create({
      data: {
        organizationId: org.id,
        number,
        orderId: order.id,
        customerId: order.customerId,
        status: "requested",
        resolution: input.resolution,
        channel: input.channel,
        customerNote: input.note || null,
        valueMinor,
        currency: order.currency,
        eligibility: JSON.stringify(serialize(result)),
        flags: JSON.stringify(result.flags),
        requiresManager: result.requiresManager,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskFactors: JSON.stringify(risk.factors),
        holdRefund: result.holdRefund,
        createdAt: now,
      },
    });
    for (const line of lines) {
      const item = await tx.returnItem.create({ data: { returnId: ret.id, orderItemId: line.orderItemId, quantity: line.quantity, reason: line.reason, reasonDetail: line.reasonDetail || null } });
      for (const p of line.photos) {
        await tx.returnPhoto.create({ data: { organizationId: org.id, returnId: ret.id, returnItemId: item.id, storageKey: p.key, mimeType: p.mime, sizeBytes: p.size, uploadedBy: "customer", createdAt: now } });
      }
    }
    await tx.returnEvent.create({
      data: { organizationId: org.id, returnId: ret.id, type: "status", status: "requested", message: input.channel === "portal" ? "Return requested through the customer portal" : "Return created by staff", ...eventActor(input.actor), createdAt: now },
    });
    await audit({ organizationId: org.id, actor: input.actor, action: "return.requested", entityType: "return", entityId: ret.id, meta: { rma: rma(number), order: order.orderNumber, valueMinor, outcome: result.outcome }, req: input.req }, tx);

    const at = new Date(now.getTime() + 1000);
    if (result.outcome === "auto_approve") {
      await tx.returnRequest.update({ where: { id: ret.id }, data: { status: "approved", decisionReason: result.reason, decidedAt: at } });
      await tx.returnEvent.create({ data: { organizationId: org.id, returnId: ret.id, type: "status", status: "approved", message: `Approved automatically — ${result.reason}`, ...eventActor(system), createdAt: at } });
      await audit({ organizationId: org.id, actor: system, action: "return.auto_approved", entityType: "return", entityId: ret.id, meta: { rma: rma(number), reason: result.reason } }, tx);
      notes.push({ key: "approved" });
    } else if (result.outcome === "auto_reject") {
      await tx.returnRequest.update({ where: { id: ret.id }, data: { status: "rejected", decisionReason: result.reason, decidedAt: at } });
      await tx.returnEvent.create({ data: { organizationId: org.id, returnId: ret.id, type: "status", status: "rejected", message: `Rejected automatically — ${result.reason}`, ...eventActor(system), createdAt: at } });
      await audit({ organizationId: org.id, actor: system, action: "return.auto_rejected", entityType: "return", entityId: ret.id, meta: { rma: rma(number), reason: result.reason } }, tx);
      notes.push({ key: "rejected", extra: { reason: result.reason } });
    } else {
      await tx.returnEvent.create({
        data: { organizationId: org.id, returnId: ret.id, type: "system", message: `${result.requiresManager ? "Needs manager approval" : "Sent for review"} — ${result.reason}`, ...eventActor(system), createdAt: at },
      });
      notes.push({ key: "requested" });
    }
    for (const m of result.matchedRules) {
      await tx.automationRule.update({ where: { id: m.id }, data: { matchCount: { increment: 1 }, lastMatchedAt: now } });
    }
    return { ...ret, number };
  });

  notes.forEach((n) => queueNotification(created.id, n.key, n.extra));
  queueReasonAnalysis(created.id);
  return { id: created.id, number: created.number, rma: rma(created.number), valueMinor, outcome: result.outcome, status: result.outcome === "auto_approve" ? "approved" : result.outcome === "auto_reject" ? "rejected" : "requested", reason: result.reason };
}

function serialize(e: Evaluation) {
  return { outcome: e.outcome, reason: e.reason, checks: e.checks, matchedRules: e.matchedRules, holdRefund: e.holdRefund };
}

// ───────────────────────── Staff decisions ─────────────────────────

export const REJECT_REASONS = {
  outside_window: "Outside the return window",
  used_or_damaged: "Item shows signs of use or damage",
  non_returnable: "Item isn't eligible for return",
  missing_evidence: "Not enough evidence for the claim",
  duplicate: "Duplicate request",
  other: "Other",
} as const;

type StaffCtx = { orgId: string; actor: Actor; role: Role; userId: string; req?: Parameters<typeof audit>[0]["req"] };

async function load(orgId: string, id: string) {
  const r = await db.returnRequest.findFirst({ where: { id, organizationId: orgId } });
  if (!r) throw notFound("Return not found");
  return r;
}

export async function approveReturn(s: StaffCtx, id: string, note?: string) {
  const r = await load(s.orgId, id);
  const override = r.status === "rejected";
  if (r.requiresManager || override) {
    if (!can(s.role, "returns:decide_escalated")) throw forbidden(override ? "Only a manager can override a rejection" : "This return needs manager approval");
  }
  if (override) {
    // While rejected, these units were free to be returned again; make sure they haven't been.
    const items = await db.returnItem.findMany({ where: { returnId: r.id }, include: { orderItem: { include: { returnItems: { where: { returnId: { not: r.id }, returnRequest: { status: { not: "rejected" } } }, select: { quantity: true } } } } } });
    for (const it of items) {
      const elsewhere = it.orderItem.returnItems.reduce((s, x) => s + x.quantity, 0);
      if (elsewhere + it.quantity > it.orderItem.quantity) throw badRequest(`Can't override: ${it.orderItem.name} is already covered by another return`);
    }
  }
  await db.$transaction(async (tx) => {
    await moveTo(tx, r, "approved", s.actor, override ? `Rejection overridden and approved by ${s.actor.label}${note ? ` — ${note}` : ""}` : `Approved by ${s.actor.label}${note ? ` — ${note}` : ""}`, {
      decidedById: s.userId,
      decidedAt: new Date(),
      decisionReason: note || (override ? "Manager override" : "Approved by staff"),
    });
    await audit({ organizationId: s.orgId, actor: s.actor, action: override ? "return.override_approved" : "return.approved", entityType: "return", entityId: r.id, meta: { rma: rma(r.number), note, escalated: r.requiresManager }, req: s.req }, tx);
  });
  queueNotification(r.id, "approved");
}

export async function rejectReturn(s: StaffCtx, id: string, reasonCode: keyof typeof REJECT_REASONS, note?: string) {
  const r = await load(s.orgId, id);
  if (r.requiresManager && !can(s.role, "returns:decide_escalated")) throw forbidden("This return needs manager approval");
  const reason = reasonCode === "other" ? note || "Other" : REJECT_REASONS[reasonCode];
  await db.$transaction(async (tx) => {
    await moveTo(tx, r, "rejected", s.actor, `Rejected by ${s.actor.label} — ${reason}${note && reasonCode !== "other" ? ` (${note})` : ""}`, {
      decidedById: s.userId,
      decidedAt: new Date(),
      decisionReason: reason,
    });
    await audit({ organizationId: s.orgId, actor: s.actor, action: "return.rejected", entityType: "return", entityId: r.id, meta: { rma: rma(r.number), reason, note }, req: s.req }, tx);
  });
  queueNotification(r.id, "rejected", { reason });
}

export async function escalateReturn(s: StaffCtx, id: string, note?: string) {
  const r = await load(s.orgId, id);
  if (r.status !== "requested") throw badRequest("Only returns awaiting review can be escalated");
  if (r.requiresManager) throw badRequest("This return is already with a manager");
  await db.$transaction(async (tx) => {
    await tx.returnRequest.update({ where: { id: r.id }, data: { requiresManager: true, escalatedAt: new Date() } });
    await note_(tx, r, s.actor, `Escalated to a manager by ${s.actor.label}${note ? ` — ${note}` : ""}`);
    await audit({ organizationId: s.orgId, actor: s.actor, action: "return.escalated", entityType: "return", entityId: r.id, meta: { rma: rma(r.number), note }, req: s.req }, tx);
  });
}
const note_ = note;

// ───────────────────────── Pickup & tracking ─────────────────────────

export const COURIERS = ["Delhivery", "Blue Dart", "Ecom Express", "Xpressbees", "Shadowfax", "DTDC", "India Post", "Other"] as const;
export const CHECKPOINTS = {
  scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery to warehouse",
  delivered: "Delivered to warehouse",
  failed: "Pickup attempt failed",
} as const;
export type CheckpointStatus = keyof typeof CHECKPOINTS;

const dateFmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(d);

export async function schedulePickup(s: StaffCtx, id: string, input: { courier: string; awb: string; scheduledFor?: Date; pickupWindow?: string }) {
  const r = await load(s.orgId, id);
  if (r.status !== "approved") throw badRequest("Pickups can only be scheduled for approved returns");
  const clash = await db.shipment.findUnique({ where: { organizationId_awb: { organizationId: s.orgId, awb: input.awb } } });
  if (clash) throw badRequest("This tracking number is already used by another return");
  await db.$transaction(async (tx) => {
    const sh = await tx.shipment.create({ data: { organizationId: s.orgId, returnId: r.id, courier: input.courier, awb: input.awb, status: "scheduled", scheduledFor: input.scheduledFor, pickupWindow: input.pickupWindow } });
    await tx.shipmentCheckpoint.create({ data: { shipmentId: sh.id, status: "scheduled", note: input.scheduledFor ? `For ${dateFmt(input.scheduledFor)}${input.pickupWindow ? `, ${input.pickupWindow}` : ""}` : null, source: "manual" } });
    await moveTo(tx, r, "pickup_scheduled", s.actor, `Pickup scheduled with ${input.courier} · AWB ${input.awb}${input.scheduledFor ? ` · ${dateFmt(input.scheduledFor)}` : ""}`);
    await audit({ organizationId: s.orgId, actor: s.actor, action: "return.pickup_scheduled", entityType: "return", entityId: r.id, meta: { rma: rma(r.number), courier: input.courier, awb: input.awb }, req: s.req }, tx);
  });
  queueNotification(r.id, "pickup_scheduled", { courier: input.courier, awb: input.awb, pickupDate: input.scheduledFor ? dateFmt(input.scheduledFor) : undefined, pickupWindow: input.pickupWindow });
}

/** Records a courier checkpoint and advances the return when the parcel moves. Used by staff and the courier webhook. */
export async function recordCheckpoint(orgId: string, shipmentId: string, cp: { status: CheckpointStatus; location?: string; note?: string; at?: Date; source: "manual" | "webhook" }, actor: Actor, req?: StaffCtx["req"]) {
  const sh = await db.shipment.findFirst({ where: { id: shipmentId, organizationId: orgId }, include: { returnRequest: true } });
  if (!sh) throw notFound("Shipment not found");
  const r = sh.returnRequest;
  const notes: Note[] = [];
  await db.$transaction(async (tx) => {
    await tx.shipmentCheckpoint.create({ data: { shipmentId: sh.id, status: cp.status, location: cp.location, note: cp.note, source: cp.source, at: cp.at ?? new Date() } });
    const shipStatus = cp.status === "picked_up" || cp.status === "out_for_delivery" ? "in_transit" : cp.status;
    await tx.shipment.update({ where: { id: sh.id }, data: { status: shipStatus } });
    const where = cp.location ? ` · ${cp.location}` : "";
    if (["picked_up", "in_transit", "out_for_delivery"].includes(cp.status) && r.status === "pickup_scheduled") {
      await moveTo(tx, r, "in_transit", actor, `${CHECKPOINTS[cp.status]} by ${sh.courier}${where}`);
      notes.push({ key: "in_transit", extra: { courier: sh.courier, awb: sh.awb } });
    } else if (cp.status === "delivered") {
      if (r.status === "pickup_scheduled") await moveTo(tx, r, "in_transit", actor, `Picked up by ${sh.courier}`);
      if (r.status === "in_transit") {
        await moveTo(tx, r, "received", actor, `Delivered to warehouse by ${sh.courier}${where}`);
        notes.push({ key: "received" });
      }
    } else {
      await note(tx, r, actor, `${CHECKPOINTS[cp.status]}${where}${cp.note ? ` — ${cp.note}` : ""}`);
    }
    await audit({ organizationId: orgId, actor, action: "return.tracking_updated", entityType: "return", entityId: r.id, meta: { rma: rma(r.number), awb: sh.awb, status: cp.status, source: cp.source }, req }, tx);
  });
  notes.forEach((n) => queueNotification(r.id, n.key, n.extra));
}

// ───────────────────────── AI reason analysis ─────────────────────────

const pendingAi = new Set<Promise<unknown>>();
export const flushAi = () => Promise.all([...pendingAi]);

/** Classifies each item's free-text reason in the background; never blocks the customer. */
export function queueReasonAnalysis(returnId: string) {
  const p = (async () => {
    const items = await db.returnItem.findMany({ where: { returnId }, include: { orderItem: { select: { name: true } } } });
    for (const it of items) {
      const text = it.reasonDetail?.trim();
      if (!text) continue;
      const a = await classifyReason(text, it.reason, it.orderItem.name);
      await db.returnItem.update({ where: { id: it.id }, data: { aiReason: a.reason, aiSummary: a.summary, aiConfidence: a.confidence, aiSource: a.source } });
    }
  })().catch((e) => console.error("reason analysis failed", e));
  pendingAi.add(p);
  p.finally(() => pendingAi.delete(p));
}
