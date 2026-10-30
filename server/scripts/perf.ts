/**
 * Performance check (PRD: return queue & analytics under 2 s).
 * Builds a throwaway database with a realistic volume, then times the
 * heaviest console endpoints through the real HTTP stack.
 *
 *   npx tsx scripts/perf.ts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const dbFile = path.resolve("prisma/perf.db");
fs.rmSync(dbFile, { force: true });
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.NODE_ENV = "test";
execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });

const { db } = await import("../src/db.js");
const { createApp } = await import("../src/app.js");
const bcrypt = (await import("bcryptjs")).default;
const { encrypt, randomToken } = await import("../src/lib/crypto.js");

const ORDERS = 6000, RETURNS = 4000, DAY = 864e5;
const org = await db.organization.create({ data: { name: "Perf Store", slug: "perf", webhookSecretEnc: encrypt(randomToken()) } });
const user = await db.user.create({ data: { name: "Perf Admin", email: "perf@admin.test", passwordHash: await bcrypt.hash("perfpass1", 4) } });
await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "admin" } });

const customers = Array.from({ length: 1500 }, (_, i) => ({ id: `c${i}`, organizationId: org.id, email: `c${i}@perf.test`, name: `Customer ${i}` }));
await db.customer.createMany({ data: customers });
const statuses = ["requested", "approved", "pickup_scheduled", "in_transit", "received", "inspected", "refunded", "rejected"];
const reasons = ["size_issue", "defective", "wrong_item", "not_as_described", "changed_mind"];
for (let b = 0; b < ORDERS; b += 500) {
  await db.order.createMany({ data: Array.from({ length: 500 }, (_, k) => { const i = b + k; return { id: `o${i}`, organizationId: org.id, customerId: `c${i % 1500}`, orderNumber: String(100000 + i), source: "shopify", status: "delivered", currency: "INR", totalMinor: 249900, placedAt: new Date(Date.now() - (i % 360) * DAY), deliveredAt: new Date(Date.now() - (i % 360) * DAY + 3 * DAY), shippingAddress: JSON.stringify({ city: ["Pune", "Delhi", "Mumbai", "Chennai"][i % 4] }) }; }) });
  await db.orderItem.createMany({ data: Array.from({ length: 500 }, (_, k) => { const i = b + k; return { id: `oi${i}`, organizationId: org.id, orderId: `o${i}`, lineKey: `SKU-${i % 80}`, sku: `SKU-${i % 80}`, name: `Product ${i % 80}`, quantity: 1, unitPriceMinor: 249900 }; }) });
}
for (let b = 0; b < RETURNS; b += 500) {
  await db.returnRequest.createMany({ data: Array.from({ length: 500 }, (_, k) => { const i = b + k; const created = new Date(Date.now() - (i % 360) * DAY + DAY); return { id: `r${i}`, organizationId: org.id, number: 1000 + i, orderId: `o${i}`, customerId: `c${i % 1500}`, status: statuses[i % statuses.length], resolution: "refund", valueMinor: 249900, currency: "INR", riskScore: i % 100, riskLevel: i % 100 >= 60 ? "high" : i % 100 >= 30 ? "medium" : "low", createdAt: created, resolvedAt: i % 8 === 6 ? new Date(created.getTime() + 5 * DAY) : null }; }) });
  await db.returnItem.createMany({ data: Array.from({ length: 500 }, (_, k) => { const i = b + k; return { id: `ri${i}`, returnId: `r${i}`, orderItemId: `oi${i}`, quantity: 1, reason: reasons[i % reasons.length] }; }) });
  await db.returnEvent.createMany({ data: Array.from({ length: 500 }, (_, k) => { const i = b + k; return { organizationId: org.id, returnId: `r${i}`, type: "status", status: "requested", message: "Requested", actorType: "customer", createdAt: new Date(Date.now() - (i % 360) * DAY + DAY) }; }) });
}

const server = http.createServer(createApp()).listen(0);
const port = (server.address() as { port: number }).port;
const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "perf@admin.test", password: "perfpass1" }) });
const cookie = login.headers.get("set-cookie")!.split(";")[0];

const endpoints = ["/api/returns", "/api/returns?status=requested&q=Customer", "/api/dashboard", "/api/analytics?days=30", "/api/analytics?days=365", "/api/work/risk", "/api/orders"];
console.log(`Dataset: ${ORDERS} orders, ${RETURNS} returns\n`);
let worst = 0;
for (const e of endpoints) {
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const res = await fetch(`http://localhost:${port}${e}`, { headers: { cookie } });
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`${e} → ${res.status}`);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[2];
  worst = Math.max(worst, times[4]);
  console.log(`${e.padEnd(42)} median ${median.toFixed(0).padStart(5)} ms   max ${times[4].toFixed(0).padStart(5)} ms`);
}
console.log(`\nSlowest response: ${worst.toFixed(0)} ms — ${worst < 2000 ? "within" : "OVER"} the 2 s target`);
server.close();
await db.$disconnect();
fs.rmSync(dbFile, { force: true });
