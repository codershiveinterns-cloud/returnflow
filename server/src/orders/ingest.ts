import { db } from "../db.js";
import { toMinor } from "../lib/money.js";
import { orderInput, type OrderInput, type OrderSource } from "./schema.js";

export type IngestResult = {
  received: number;
  created: number;
  updated: number;
  failed: number;
  errors: { ref: string; message: string }[];
  orderIds: string[];
};

/**
 * Idempotent upsert of orders into a tenant. Orders are matched on
 * (organizationId, orderNumber); items on a stable line key. Items that are
 * already referenced by a return are never deleted, even if a later sync
 * drops them, so return history always resolves to the original SKU.
 */
export async function ingestOrders(orgId: string, payloads: unknown[], source: OrderSource): Promise<IngestResult> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { currency: true } });
  const result: IngestResult = { received: payloads.length, created: 0, updated: 0, failed: 0, errors: [], orderIds: [] };

  for (const [index, payload] of payloads.entries()) {
    const parsed = orderInput.safeParse(payload);
    const ref = refFor(payload, index);
    if (!parsed.success) {
      result.failed++;
      result.errors.push({ ref, message: parsed.error.issues.map((i) => `${i.path.join(".") || "order"}: ${i.message}`).join("; ") });
      continue;
    }
    try {
      const { id, created } = await upsertOrder(orgId, parsed.data, source, org.currency);
      result.orderIds.push(id);
      created ? result.created++ : result.updated++;
    } catch (err) {
      result.failed++;
      result.errors.push({ ref, message: err instanceof Error ? err.message : "Could not save order" });
    }
  }
  return result;
}

function refFor(payload: unknown, index: number) {
  const p = payload as { order_number?: unknown };
  return typeof p?.order_number === "string" && p.order_number ? `#${p.order_number.replace(/^#/, "")}` : `item ${index + 1}`;
}

function lineKeys(items: OrderInput["items"]) {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = item.external_id ?? item.sku;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

async function upsertOrder(orgId: string, input: OrderInput, source: OrderSource, defaultCurrency: string) {
  const currency = input.currency ?? defaultCurrency;
  const keys = lineKeys(input.items);
  const items = input.items.map((item, i) => ({
    lineKey: keys[i],
    sku: item.sku,
    name: item.name,
    variant: item.variant ?? null,
    category: item.category ?? null,
    quantity: item.quantity,
    unitPriceMinor: toMinor(item.unit_price, currency),
    imageUrl: item.image_url ?? null,
  }));
  const totalMinor = input.total !== undefined ? toMinor(input.total, currency) : items.reduce((s, i) => s + i.quantity * i.unitPriceMinor, 0);
  const deliveredAt = input.delivered_at ?? (input.status === "delivered" ? input.placed_at : null);

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { organizationId_email: { organizationId: orgId, email: input.customer.email } },
      create: { organizationId: orgId, email: input.customer.email, name: input.customer.name, phone: input.customer.phone, externalId: input.customer.external_id },
      update: {
        ...(input.customer.name && { name: input.customer.name }),
        ...(input.customer.phone && { phone: input.customer.phone }),
        ...(input.customer.external_id && { externalId: input.customer.external_id }),
      },
    });

    const fields = {
      customerId: customer.id,
      externalId: input.external_id ?? null,
      status: input.status,
      paymentMethod: input.payment_method,
      currency,
      totalMinor,
      placedAt: input.placed_at,
      deliveredAt,
      shippingAddress: input.shipping_address ? JSON.stringify(input.shipping_address) : null,
    };

    const existing = await tx.order.findUnique({
      where: { organizationId_orderNumber: { organizationId: orgId, orderNumber: input.order_number } },
      include: { items: { include: { _count: { select: { returnItems: true } } } } },
    });

    if (!existing) {
      const order = await tx.order.create({
        data: { ...fields, organizationId: orgId, orderNumber: input.order_number, source, items: { create: items.map((i) => ({ ...i, organizationId: orgId })) } },
      });
      return { id: order.id, created: true };
    }

    await tx.order.update({ where: { id: existing.id }, data: fields });
    const incoming = new Set(items.map((i) => i.lineKey));
    for (const item of items) {
      await tx.orderItem.upsert({
        where: { orderId_lineKey: { orderId: existing.id, lineKey: item.lineKey } },
        create: { ...item, orderId: existing.id, organizationId: orgId },
        update: item,
      });
    }
    const removable = existing.items.filter((i) => !incoming.has(i.lineKey) && i._count.returnItems === 0).map((i) => i.id);
    if (removable.length) await tx.orderItem.deleteMany({ where: { id: { in: removable } } });
    return { id: existing.id, created: false };
  });
}

/** Wraps an ingest in a SyncRun record so every import is visible in Sync history. */
export async function recordSync<T extends IngestResult>(
  orgId: string,
  meta: { source: OrderSource; trigger: string; label?: string },
  work: () => Promise<T>,
): Promise<T & { syncRunId: string }> {
  const run = await db.syncRun.create({ data: { organizationId: orgId, source: meta.source, trigger: meta.trigger, label: meta.label, status: "running" } });
  try {
    const r = await work();
    const status = r.failed === 0 ? "success" : r.created + r.updated > 0 ? "partial" : "failed";
    await db.syncRun.update({
      where: { id: run.id },
      data: { status, received: r.received, created: r.created, updated: r.updated, failed: r.failed, errors: r.errors.length ? JSON.stringify(r.errors.slice(0, 200)) : null, finishedAt: new Date() },
    });
    return { ...r, syncRunId: run.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await db.syncRun.update({ where: { id: run.id }, data: { status: "failed", errors: JSON.stringify([{ ref: "sync", message }]), finishedAt: new Date() } });
    throw err;
  }
}
