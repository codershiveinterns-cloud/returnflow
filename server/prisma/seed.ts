/**
 * Demo data for local development and staging.
 *
 * Creates two fully isolated tenants so tenant separation can be checked by
 * hand. Demo sign-ins (local/staging only — never use in production):
 *
 *   Workspace “Kaveri & Co.”   portal: /r/kaveri
 *     admin@kaveri.test      Admin
 *     manager@kaveri.test    Manager
 *     support@kaveri.test    Support Agent
 *     warehouse@kaveri.test  Warehouse Staff
 *     finance@kaveri.test    Finance
 *
 *   Workspace “Northwind Outfitters”   portal: /r/northwind
 *     admin@northwind.test   Admin
 *
 *   Password for every demo user: Demo@12345
 *
 * Portal test order: #1029 with neha.joshi@example.com (phone 98000 00009)
 */
import bcrypt from "bcryptjs";
import { db } from "../src/db.js";
import { encrypt, encryptJson, randomToken } from "../src/lib/crypto.js";
import { ingestOrders, recordSync } from "../src/orders/ingest.js";
import { mapShopifyOrder } from "../src/orders/shopify.js";
import { sandboxOrders } from "../src/orders/shopifySandbox.js";
import type { OrderInput } from "../src/orders/schema.js";
import { createReturn, recordCheckpoint, schedulePickup } from "../src/returns/service.js";
import { flushNotifications } from "../src/notify/index.js";

const PASSWORD = "Demo@12345";
const DAY = 864e5;
const ago = (days: number, hours = 10) => new Date(Date.now() - days * DAY + hours * 36e5 - 12 * 36e5);

const PEOPLE = [
  ["Ananya Rao", "ananya.rao@example.com", "+91 98000 00001"],
  ["Vikram Sethi", "vikram.sethi@example.com", "+91 98000 00002"],
  ["Priya Nair", "priya.nair@example.com", "+91 98000 00003"],
  ["Rahul Mehta", "rahul.mehta@example.com", "+91 98000 00004"],
  ["Sneha Kulkarni", "sneha.k@example.com", "+91 98000 00005"],
  ["Imran Qureshi", "imran.q@example.com", "+91 98000 00006"],
  ["Kavya Menon", "kavya.menon@example.com", "+91 98000 00007"],
  ["Aditya Bhat", "aditya.bhat@example.com", "+91 98000 00008"],
  ["Neha Joshi", "neha.joshi@example.com", "+91 98000 00009"],
  ["Farah Siddiqui", "farah.s@example.com", "+91 98000 00010"],
] as const;

const CATALOG = [
  { sku: "KRT-LIN-M-IND", name: "Linen Kurta", variant: "M / Indigo", category: "Apparel", price: 1899 },
  { sku: "KRT-LIN-L-SND", name: "Linen Kurta", variant: "L / Sand", category: "Apparel", price: 1899 },
  { sku: "DRS-MID-S-RST", name: "Tiered Midi Dress", variant: "S / Rust", category: "Apparel", price: 2799 },
  { sku: "SNK-CNV-8-WHT", name: "Canvas Sneakers", variant: "UK 8 / White", category: "Footwear", price: 2499 },
  { sku: "BAG-TOT-TAN", name: "Leather Tote", variant: "Tan", category: "Bags", price: 4299 },
  { sku: "DUP-SLK-RST", name: "Silk Dupatta", variant: "Rust", category: "Accessories", price: 749 },
  { sku: "WTC-MIN-STL", name: "Minimal Analog Watch", variant: "Steel", category: "Accessories", price: 5499 },
  { sku: "JNS-SLM-32", name: "Slim Fit Jeans", variant: "32", category: "Apparel", price: 2199 },
  { sku: "SHR-OXF-L-SKY", name: "Oxford Shirt", variant: "L / Sky", category: "Apparel", price: 1599 },
  { sku: "SAR-CTN-MUL", name: "Handloom Cotton Saree", variant: "Mulberry", category: "Apparel", price: 12499 },
];

function makeOrders(count: number, start: number): OrderInput[] {
  return Array.from({ length: count }, (_, i) => {
    const [name, email, phone] = PEOPLE[i % PEOPLE.length];
    const placed = ago(38 - Math.floor((i * 38) / count));
    const status: OrderInput["status"] = i % 13 === 5 ? "cancelled" : i >= count - 3 ? "pending" : i % 4 === 0 ? "fulfilled" : "delivered";
    const lines = [CATALOG[i % CATALOG.length], ...(i % 3 === 0 ? [CATALOG[(i + 4) % CATALOG.length]] : [])];
    return {
      order_number: String(start + i),
      placed_at: placed,
      status,
      payment_method: i % 4 === 1 ? "cod" : "prepaid",
      currency: "INR",
      delivered_at: status === "delivered" ? new Date(placed.getTime() + 4 * DAY) : undefined,
      customer: { email, name, phone },
      shipping_address: { city: ["Bengaluru", "Mumbai", "Pune", "Delhi"][i % 4], country: "India" },
      items: lines.map((l) => ({ sku: l.sku, name: l.name, variant: l.variant, category: l.category, quantity: i % 7 === 2 ? 2 : 1, unit_price: l.price })),
    };
  });
}

async function createWorkspace(name: string, slug: string, users: [string, string, string][], brandColor: string, headline?: string) {
  const org = await db.organization.create({
    data: { name, slug, brandColor, supportEmail: `care@${slug}.test`, portalHeadline: headline, webhookSecretEnc: encrypt(`whsec_${randomToken(24)}`) },
  });
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [userName, email, role] of users) {
    const user = await db.user.create({ data: { name: userName, email, passwordHash: hash } });
    await db.membership.create({ data: { userId: user.id, organizationId: org.id, role } });
  }
  return org;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true to override.");
  }
  if (await db.organization.findUnique({ where: { slug: "kaveri" } })) {
    console.log("Demo data already present — skipping. Run `npm run db:reset` for a clean slate.");
    return;
  }

  const kaveri = await createWorkspace(
    "Kaveri & Co.",
    "kaveri",
    [
      ["Meera Krishnan", "admin@kaveri.test", "admin"],
      ["Arjun Rao", "manager@kaveri.test", "manager"],
      ["Divya Shetty", "support@kaveri.test", "support"],
      ["Ravi Kumar", "warehouse@kaveri.test", "warehouse"],
      ["Sana Sheikh", "finance@kaveri.test", "finance"],
    ],
    "#8a3b12",
    "Returns & exchanges, made simple",
  );

  // CSV-style historical import
  await recordSync(kaveri.id, { source: "csv", trigger: "upload", label: "historical-orders-aug.csv" }, () => ingestOrders(kaveri.id, makeOrders(34, 1001), "csv"));
  // Orders from a custom checkout via the REST API
  await recordSync(kaveri.id, { source: "api", trigger: "api", label: "Storefront checkout" }, () => ingestOrders(kaveri.id, makeOrders(8, 2001), "api"));
  // Shopify sandbox store
  await db.integration.create({
    data: {
      organizationId: kaveri.id,
      provider: "shopify",
      mode: "sandbox",
      displayName: "Test store",
      configEnc: encryptJson({ shopDomain: "test-store.myshopify.com", accessToken: "sandbox", apiSecret: `sandbox_${randomToken(16)}` }),
      lastSyncedAt: new Date(),
    },
  });
  await recordSync(kaveri.id, { source: "shopify", trigger: "manual", label: "Test store" }, () => ingestOrders(kaveri.id, sandboxOrders(12, 3001).map(mapShopifyOrder), "shopify"));

  // Automation rules (Milestone 2)
  const rules = [
    { name: "High-value returns need a manager", priority: 10, match: "all", conditions: [{ field: "value", op: "gt", value: 10000 }], action: "require_manager", actionNote: "Return value above ₹10,000" },
    { name: "Hold refunds for repeat returners", priority: 20, match: "all", conditions: [{ field: "customer_returns_90d", op: "gte", value: 1 }], action: "hold_refund", actionNote: null },
    { name: "Fast-track small store-credit returns", priority: 30, match: "all", conditions: [{ field: "resolution", op: "is", value: "store_credit" }, { field: "value", op: "lte", value: 3000 }], action: "auto_approve", actionNote: null },
    { name: "Change of mind only within 15 days", priority: 40, match: "all", conditions: [{ field: "reason", op: "is", value: "changed_mind" }, { field: "days_since_delivery", op: "gt", value: 15 }], action: "auto_reject", actionNote: "Change-of-mind returns are accepted within 15 days of delivery" },
  ];
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@kaveri.test" } });
  for (const r of rules) {
    await db.automationRule.create({ data: { ...r, conditions: JSON.stringify(r.conditions), organizationId: kaveri.id, createdById: admin.id } });
  }

  // Return requests, created through the same service the portal uses so the
  // eligibility engine and rules decide each one.
  const requests: { order: string; lines: { sku: string; qty?: number; reason: string; detail?: string }[]; resolution: string; days: number; note?: string }[] = [
    { order: "1015", lines: [{ sku: "BAG-TOT-TAN", reason: "defective", detail: "Strap stitching came loose after a week" }], resolution: "replacement", days: 9 },
    { order: "1018", lines: [{ sku: "JNS-SLM-32", reason: "size_issue", detail: "Waist runs small" }], resolution: "store_credit", days: 8 },
    { order: "1016", lines: [{ sku: "SAR-CTN-MUL", reason: "wrong_item", detail: "Received a blue saree instead of mulberry" }], resolution: "refund", days: 6, note: "Please arrange pickup after 5pm." },
    { order: "1022", lines: [{ sku: "KRT-LIN-L-SND", reason: "size_issue", detail: "Shoulders are too narrow" }], resolution: "replacement", days: 5 },
    { order: "1023", lines: [{ sku: "DRS-MID-S-RST", reason: "not_as_described", detail: "Colour is much darker than the photos" }], resolution: "store_credit", days: 4 },
    { order: "1020", lines: [{ sku: "SAR-CTN-MUL", reason: "size_issue" }], resolution: "refund", days: 3 },
    { order: "1021", lines: [{ sku: "KRT-LIN-M-IND", reason: "changed_mind" }], resolution: "refund", days: 2 },
    { order: "1024", lines: [{ sku: "SNK-CNV-8-WHT", qty: 1, reason: "defective", detail: "Sole started peeling after the first wear" }], resolution: "refund", days: 1.2 },
    { order: "1008", lines: [{ sku: "JNS-SLM-32", reason: "changed_mind" }], resolution: "refund", days: 1 },
    { order: "1025", lines: [{ sku: "BAG-TOT-TAN", reason: "changed_mind" }], resolution: "refund", days: 0.6 },
    { order: "1027", lines: [{ sku: "WTC-MIN-STL", reason: "changed_mind", detail: "Dial is smaller than expected" }], resolution: "refund", days: 0.3 },
    { order: "1003", lines: [{ sku: "DRS-MID-S-RST", reason: "defective", detail: "Seam split on the side" }], resolution: "replacement", days: 0.15 },
    { order: "1030", lines: [{ sku: "SAR-CTN-MUL", reason: "changed_mind" }], resolution: "refund", days: 0.08 },
  ];

  const created: Record<string, string> = {};
  for (const r of requests) {
    const org = await db.organization.findUniqueOrThrow({ where: { id: kaveri.id } });
    const order = await db.order.findUniqueOrThrow({ where: { organizationId_orderNumber: { organizationId: kaveri.id, orderNumber: r.order } }, include: { items: true, customer: true } });
    const lines = r.lines.map((l) => ({ l, item: order.items.find((i) => i.sku === l.sku) })).filter((x) => x.item);
    if (!lines.length) throw new Error(`Seed: order ${r.order} has none of ${r.lines.map((l) => l.sku)}`);
    const res = await createReturn({
      org,
      order,
      lines: lines.map(({ l, item }) => ({ orderItemId: item!.id, quantity: l.qty ?? 1, reason: l.reason, reasonDetail: l.detail, photos: [] })),
      resolution: r.resolution,
      note: r.note,
      channel: "portal",
      actor: { type: "customer", id: order.customerId, label: order.customer.name ?? order.customer.email },
      createdAt: ago(r.days, 12),
    });
    created[r.order] = res.id;
  }

  // Move a few approved returns along the pickup flow
  const support = await db.user.findUniqueOrThrow({ where: { email: "support@kaveri.test" } });
  const staff = { orgId: kaveri.id, actor: { type: "user" as const, id: support.id, label: support.name }, role: "support" as const, userId: support.id };
  const tryStep = async (fn: () => Promise<unknown>) => fn().catch((e) => console.warn("seed step skipped:", e.message));
  await tryStep(() => schedulePickup(staff, created["1018"], { courier: "Delhivery", awb: "7751093244", scheduledFor: ago(7) }));
  await tryStep(async () => {
    const sh = await db.shipment.findUniqueOrThrow({ where: { returnId: created["1018"] } });
    await recordCheckpoint(kaveri.id, sh.id, { status: "picked_up", location: "Pune", source: "webhook", at: ago(6) }, { type: "system", label: "Delhivery tracking" });
    await recordCheckpoint(kaveri.id, sh.id, { status: "delivered", location: "Bhiwandi DC", source: "webhook", at: ago(4) }, { type: "system", label: "Delhivery tracking" });
  });
  await tryStep(() => schedulePickup(staff, created["1022"], { courier: "Blue Dart", awb: "BD48210076IN", scheduledFor: ago(3), pickupWindow: "10am – 2pm" }));
  await tryStep(async () => {
    const sh = await db.shipment.findUniqueOrThrow({ where: { returnId: created["1022"] } });
    await recordCheckpoint(kaveri.id, sh.id, { status: "picked_up", location: "Mumbai", source: "manual", at: ago(2) }, staff.actor);
  });
  await tryStep(() => schedulePickup(staff, created["1021"], { courier: "Xpressbees", awb: "XB1400238877", scheduledFor: ago(-1), pickupWindow: "2pm – 6pm" }));
  // Booking happened before the courier events above; date the "scheduled" checkpoints accordingly.
  for (const sh of await db.shipment.findMany({ where: { organizationId: kaveri.id }, include: { checkpoints: true } })) {
    const firstMove = sh.checkpoints.filter((c) => c.status !== "scheduled").sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    const bookedAt = new Date(Math.min(Date.now(), (firstMove?.at ?? sh.scheduledFor ?? new Date()).getTime() - 864e5));
    await db.shipmentCheckpoint.updateMany({ where: { shipmentId: sh.id, status: "scheduled" }, data: { at: bookedAt } });
  }
  await flushNotifications();

  // Second tenant: proves isolation (its data must never appear in Kaveri's console)
  const northwind = await createWorkspace("Northwind Outfitters", "northwind", [["Leo Fernandes", "admin@northwind.test", "admin"]], "#1d4d4f");
  await recordSync(northwind.id, { source: "csv", trigger: "upload", label: "northwind-initial.csv" }, () =>
    ingestOrders(northwind.id, makeOrders(6, 9001).map((o) => ({ ...o, customer: { ...o.customer, email: `nw.${o.customer.email}` } })), "csv"),
  );

  console.log("Seeded demo workspaces: Kaveri & Co. (/r/kaveri), Northwind Outfitters (/r/northwind)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
