import { db } from "../db.js";
import { audit, type Actor } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { decryptJson, randomToken } from "../lib/crypto.js";
import type { Role } from "../auth/rbac.js";
import { analyzeCondition, type Checklist, type ConditionAnalysis } from "../ai/index.js";
import { restockOnShopify } from "../inventory/shopifySync.js";
import { queueNotification } from "../notify/index.js";
import type { ShopifyConfig } from "../orders/shopify.js";
import { refundPayment, simulateRefund, type RazorpayConfig } from "../payments/razorpay.js";
import { rma } from "../routes/shared.js";
import { moveTo } from "./service.js";

/**
 * Milestone 3: the back half of the return loop —
 * receive → inspect (with AI suggestion) → inventory → refund / credit / replacement.
 */
type StaffCtx = { orgId: string; actor: Actor; role: Role; userId: string; req?: Parameters<typeof audit>[0]["req"] };

const money = (minor: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);

async function loadReturn(orgId: string, id: string) {
  const r = await db.returnRequest.findFirst({
    where: { id, organizationId: orgId },
    include: { items: { include: { orderItem: true, inspection: true, photos: true } }, order: true, refunds: true },
  });
  if (!r) throw notFound("Return not found");
  return r;
}

// ───────────────────────── Receive ─────────────────────────

export async function markReceived(s: StaffCtx, id: string) {
  const r = await loadReturn(s.orgId, id);
  if (!["pickup_scheduled", "in_transit"].includes(r.status)) throw badRequest("Only returns on their way back can be marked as received");
  await db.$transaction(async (tx) => {
    if (r.status === "pickup_scheduled") await moveTo(tx, r, "in_transit", s.actor, "Picked up (recorded at warehouse arrival)");
    await moveTo(tx, r, "received", s.actor, `Received at the warehouse by ${s.actor.label}`);
    await tx.shipment.updateMany({ where: { returnId: r.id }, data: { status: "delivered" } });
    await audit({ organizationId: s.orgId, actor: s.actor, action: "return.received", entityType: "return", entityId: r.id, meta: { rma: rma(r.number) }, req: s.req }, tx);
  });
  queueNotification(r.id, "received");
}

// ───────────────────────── Inspect ─────────────────────────

export async function suggestCondition(orgId: string, id: string, itemId: string, checklist: Checklist): Promise<ConditionAnalysis> {
  const r = await loadReturn(orgId, id);
  const item = r.items.find((i) => i.id === itemId);
  if (!item) throw notFound("Item not found on this return");
  return analyzeCondition({
    product: `${item.orderItem.name}${item.orderItem.variant ? ` (${item.orderItem.variant})` : ""}`,
    claimedReason: item.reason,
    customerDetail: item.reasonDetail,
    checklist,
    photos: item.photos,
  });
}

export type InspectionInput = {
  checklist: Checklist;
  grade: "A" | "B" | "C" | "D";
  disposition: "restock" | "refurbish" | "damaged" | "dispose";
  notes?: string;
  aiSuggestion?: ConditionAnalysis | null;
  photos: { key: string; mime: string; size: number }[];
};

export async function recordInspection(s: StaffCtx, id: string, itemId: string, input: InspectionInput) {
  const r = await loadReturn(s.orgId, id);
  if (!["received", "inspected", "refunded", "replaced"].includes(r.status)) throw badRequest("Mark the parcel as received before inspecting it");
  const item = r.items.find((i) => i.id === itemId);
  if (!item) throw notFound("Item not found on this return");
  if (item.inspection) throw badRequest("This item has already been inspected");

  const mismatch = !!input.aiSuggestion?.mismatch;
  const remaining = r.items.filter((i) => !i.inspection && i.id !== itemId).length;
  let movementId = "";

  await db.$transaction(async (tx) => {
    for (const p of input.photos) {
      await tx.returnPhoto.create({ data: { organizationId: s.orgId, returnId: r.id, returnItemId: item.id, storageKey: p.key, mimeType: p.mime, sizeBytes: p.size, uploadedBy: "staff" } });
    }
    await tx.inspection.create({
      data: {
        organizationId: s.orgId,
        returnId: r.id,
        returnItemId: item.id,
        checklist: JSON.stringify(input.checklist),
        grade: input.grade,
        disposition: input.disposition,
        notes: input.notes || null,
        aiSuggestion: input.aiSuggestion ? JSON.stringify(input.aiSuggestion) : null,
        mismatch,
        inspectorId: s.userId,
        inspectorName: s.actor.label,
      },
    });
    const mv = await tx.inventoryMovement.create({
      data: {
        organizationId: s.orgId,
        returnId: r.id,
        returnItemId: item.id,
        sku: item.orderItem.sku,
        name: item.orderItem.name,
        quantity: item.quantity,
        disposition: input.disposition,
        syncStatus: input.disposition === "restock" ? "not_connected" : "not_required",
      },
    });
    movementId = mv.id;
    await tx.returnEvent.create({
      data: {
        organizationId: s.orgId,
        returnId: r.id,
        type: "note",
        message: `Inspected ${item.orderItem.name}: grade ${input.grade}, ${input.disposition}${mismatch ? " — condition doesn't match the customer's reason" : ""}`,
        actorType: "user",
        actorId: s.userId,
        actorLabel: s.actor.label,
      },
    });
    if (remaining === 0 && r.status === "received") {
      await moveTo(tx, r, "inspected", s.actor, `Inspection complete (${r.items.length} item${r.items.length === 1 ? "" : "s"})`);
    }
    await audit({ organizationId: s.orgId, actor: s.actor, action: "return.inspected", entityType: "return", entityId: r.id, meta: { rma: rma(r.number), sku: item.orderItem.sku, grade: input.grade, disposition: input.disposition, mismatch, aiGrade: input.aiSuggestion?.grade }, req: s.req }, tx);
    await audit({ organizationId: s.orgId, actor: s.actor, action: "inventory.movement", entityType: "inventory", entityId: mv.id, meta: { rma: rma(r.number), sku: item.orderItem.sku, quantity: item.quantity, disposition: input.disposition } }, tx);
  });

  if (input.disposition === "restock") await syncRestock(s.orgId, movementId);
  if (remaining === 0 && r.status === "inspected") queueNotification(r.id, "inspected");
  return { complete: remaining === 0 };
}

/** Pushes a restock to the connected store. Safe to retry. */
export async function syncRestock(orgId: string, movementId: string) {
  const mv = await db.inventoryMovement.findFirst({ where: { id: movementId, organizationId: orgId } });
  if (!mv || mv.disposition !== "restock") return;
  const shop = await db.integration.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider: "shopify" } } });
  if (!shop) {
    await db.inventoryMovement.update({ where: { id: mv.id }, data: { syncStatus: "not_connected", syncMessage: "Connect a store to sync stock automatically" } });
    return;
  }
  if (shop.mode === "sandbox") {
    await db.inventoryMovement.update({ where: { id: mv.id }, data: { syncStatus: "synced", syncTarget: shop.displayName, syncMessage: `+${mv.quantity} available (test store)` } });
    return;
  }
  try {
    const msg = await restockOnShopify(decryptJson<ShopifyConfig>(shop.configEnc), mv.sku, mv.quantity);
    await db.inventoryMovement.update({ where: { id: mv.id }, data: { syncStatus: "synced", syncTarget: shop.displayName, syncMessage: msg } });
  } catch (err) {
    await db.inventoryMovement.update({ where: { id: mv.id }, data: { syncStatus: "failed", syncTarget: shop.displayName, syncMessage: err instanceof Error ? err.message : "Sync failed" } });
  }
}

// ───────────────────────── Resolve ─────────────────────────

export type ResolveInput = {
  kind: "refund" | "store_credit" | "replacement";
  method: "razorpay" | "manual" | "store_credit" | "replacement";
  amount?: number; // major units; defaults to the full return value
  reference?: string;
  note?: string;
};

export function canResolve(r: { status: string; holdRefund: boolean; riskLevel: string | null }) {
  if (r.status === "inspected") return { ok: true as const };
  if (r.status === "received" && !r.holdRefund && r.riskLevel !== "high") return { ok: true as const };
  if (r.status === "received") return { ok: false as const, why: "This refund is on hold until the items are inspected" };
  return { ok: false as const, why: "Returns can be resolved once they're received at the warehouse" };
}

export async function resolveReturn(s: StaffCtx, id: string, input: ResolveInput) {
  const r = await loadReturn(s.orgId, id);
  const gate = canResolve(r);
  if (!gate.ok) throw badRequest(gate.why);
  if (r.refunds.some((x) => x.status !== "failed")) throw badRequest("This return has already been resolved");

  const amountMinor = input.amount !== undefined ? Math.round(input.amount * 100) : r.valueMinor;
  if (amountMinor <= 0 && input.kind !== "replacement") throw badRequest("Amount must be more than zero");
  if (amountMinor > r.valueMinor) throw badRequest(`Amount can't exceed the return value (${money(r.valueMinor, r.currency)})`);

  let reference = input.reference?.trim() || null;
  let gatewayMode: string | null = null;
  let status: "processing" | "succeeded" | "failed" = "succeeded";
  let error: string | null = null;

  if (input.kind === "refund" && input.method === "razorpay") {
    const gw = await db.integration.findUnique({ where: { organizationId_provider: { organizationId: s.orgId, provider: "razorpay" } } });
    if (!gw) throw badRequest("Connect Razorpay in Integrations → Payments, or record a manual refund");
    if (!r.order.paymentRef) throw badRequest("This order has no Razorpay payment ID — record a manual refund instead");
    try {
      const res = gw.mode === "sandbox" ? simulateRefund(amountMinor) : await refundPayment(decryptJson<RazorpayConfig>(gw.configEnc), r.order.paymentRef, amountMinor, { rma: rma(r.number), order: r.order.orderNumber });
      reference = res.id;
      gatewayMode = gw.mode === "sandbox" ? "test" : "live";
      status = res.status === "processed" ? "succeeded" : res.status === "failed" ? "failed" : "processing";
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : "Gateway error";
    }
  } else if (input.kind === "refund" && input.method === "manual") {
    if (!reference) throw badRequest("Add the bank / UPI transaction reference");
  } else if (input.kind === "store_credit") {
    const org = await db.organization.findUniqueOrThrow({ where: { id: s.orgId }, select: { slug: true } });
    reference = `${org.slug.slice(0, 3).toUpperCase()}-CR-${randomToken(6).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)}`;
  } else if (input.kind === "replacement") {
    if (!reference) throw badRequest("Add the replacement order number");
  } else {
    throw badRequest("Choose how to resolve this return");
  }

  const refund = await db.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        organizationId: s.orgId,
        returnId: r.id,
        kind: input.kind,
        method: input.method,
        amountMinor: input.kind === "replacement" ? 0 : amountMinor,
        currency: r.currency,
        status,
        reference,
        gatewayMode,
        note: input.note || null,
        error,
        createdById: s.userId,
        createdByName: s.actor.label,
        processedAt: status === "failed" ? null : new Date(),
      },
    });
    if (status !== "failed") {
      const to = input.kind === "replacement" ? "replaced" : "refunded";
      const what = input.kind === "replacement" ? `Replacement sent · order ${reference}` : input.kind === "store_credit" ? `Store credit of ${money(amountMinor, r.currency)} issued · ${reference}` : `Refund of ${money(amountMinor, r.currency)} ${status === "processing" ? "initiated" : "issued"}${gatewayMode === "test" ? " (test mode)" : ""} · ${reference}`;
      await moveTo(tx, r, to, s.actor, what, { resolvedAt: new Date() });
    }
    await audit({ organizationId: s.orgId, actor: s.actor, action: status === "failed" ? "refund.failed" : "refund.issued", entityType: "refund", entityId: refund.id, meta: { rma: rma(r.number), kind: input.kind, method: input.method, amountMinor, reference, error, partial: amountMinor < r.valueMinor }, req: s.req }, tx);
    return refund;
  });

  if (status !== "failed") {
    const key = input.kind === "replacement" ? "replaced" : input.kind === "store_credit" ? "store_credit" : "refunded";
    queueNotification(r.id, key, { amount: money(amountMinor, r.currency), reference: reference ?? undefined });
  }
  if (status === "failed") throw badRequest(`Refund failed: ${error}`);
  return refund;
}
