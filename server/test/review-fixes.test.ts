import http from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hmacSha256 } from "../src/lib/crypto.js";
import { __test, assertPublicUrl } from "../src/lib/netguard.js";
import { app, login } from "./helpers.js";

/** Mock Razorpay: configurable latency and response, counts refund calls. */
let mode: "ok" | "slow" | "error503" = "ok";
let refundCalls = 0;
let lastBody: any = null;
const gateway = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url?.startsWith("/v1/payments?")) return void res.end(JSON.stringify({ items: [] }));
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    refundCalls++;
    lastBody = JSON.parse(raw || "{}");
    if (mode === "error503") return void res.writeHead(503).end("{}");
    setTimeout(() => res.end(JSON.stringify({ id: `rfnd_REVIEW${refundCalls}`, status: "processed", amount: lastBody.amount })), mode === "slow" ? 150 : 0);
  });
});
beforeAll(() => new Promise<void>((r) => gateway.listen(47898, "127.0.0.1", r)));
afterAll(() => new Promise<void>((r) => gateway.close(() => r())));

let n = 0;
/** Creates an order via the API and a portal return for it; returns the return id + rma. */
async function makeReturn(admin: any, opts: { reason?: string; detail?: string; paymentId?: string; qty?: number } = {}) {
  n++;
  const key = (await admin.post("/api/integrations/api-keys").send({ name: `review-${n}` })).body.token;
  const orderNumber = `REV-${Date.now()}-${n}`;
  await request(app).post("/api/v1/orders").set("Authorization", `Bearer ${key}`).send({
    order_number: orderNumber, placed_at: new Date(Date.now() - 3 * 864e5).toISOString(), status: "delivered", payment_id: opts.paymentId,
    customer: { email: `review${n}@example.com`, name: `Review ${n}`, phone: "+91 98000 55555" },
    items: [{ sku: `REV-${n}`, name: "Review Scarf", quantity: opts.qty ?? 1, unit_price: 999 }],
  }).expect(201);
  const look = await request(app).post("/api/portal/kaveri/lookup").send({ orderNumber, contact: `review${n}@example.com` });
  const res = await request(app).post("/api/portal/kaveri/returns").set("x-portal-token", look.body.token)
    .field("payload", JSON.stringify({ items: [{ orderItemId: look.body.order.items[0].id, quantity: 1, reason: opts.reason ?? "size_issue", reasonDetail: opts.detail }], resolution: "refund" }));
  expect(res.status).toBe(201);
  const list = await admin.get(`/api/returns?q=${res.body.rma}`);
  return { id: list.body.returns[0].id as string, rma: res.body.rma as string, status: res.body.status as string, orderNumber, token: look.body.token, itemId: look.body.order.items[0].id };
}

async function toWarehouse(id: string, awb: string) {
  const support = await login("support@kaveri.test");
  const warehouse = await login("warehouse@kaveri.test");
  await support.post(`/api/returns/${id}/pickup`).send({ courier: "Delhivery", awb }).expect(200);
  await warehouse.post(`/api/returns/${id}/receive`).expect(200);
}

describe("review fixes", () => {
  it("never pays out twice when resolve is clicked twice at once", async () => {
    const admin = await login("admin@kaveri.test");
    const finance = await login("finance@kaveri.test");
    await admin.post("/api/integrations/razorpay").send({ mode: "live", keyId: "rzp_test_REVIEW1", keySecret: "secret_secret_secret" }).expect(201);
    const r = await makeReturn(admin, { paymentId: "pay_REVIEW001" });
    await toWarehouse(r.id, `RVW${Date.now()}`);
    mode = "slow";
    refundCalls = 0;
    const [a, b] = await Promise.all([
      finance.post(`/api/returns/${r.id}/resolve`).send({ kind: "refund", method: "razorpay" }),
      finance.post(`/api/returns/${r.id}/resolve`).send({ kind: "refund", method: "razorpay" }),
    ]);
    // Exactly one succeeds; the other is refused (409 if it hit the lock, 400 if the refund was already recorded).
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);
    expect(refundCalls).toBe(1);
    expect(lastBody.receipt).toBeTruthy();
    const detail = (await finance.get(`/api/returns/${r.id}`)).body;
    expect(detail.refunds).toHaveLength(1);
    expect(detail.status).toBe("refunded");
    mode = "ok";
  });

  it("treats a gateway outage as pending and blocks a blind retry", async () => {
    const admin = await login("admin@kaveri.test");
    const finance = await login("finance@kaveri.test");
    const r = await makeReturn(admin, { paymentId: "pay_REVIEW002" });
    await toWarehouse(r.id, `RVX${Date.now()}`);
    mode = "error503";
    const first = await finance.post(`/api/returns/${r.id}/resolve`).send({ kind: "refund", method: "razorpay" });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("processing");
    expect(first.body.error).toMatch(/didn't respond/);
    mode = "ok";
    await finance.post(`/api/returns/${r.id}/resolve`).send({ kind: "refund", method: "razorpay" }).expect(400);
    await admin.post("/api/integrations/razorpay").send({ mode: "sandbox" }).expect(201);
  });

  it("rejects mismatched resolution type and payout method", async () => {
    const finance = await login("finance@kaveri.test");
    const res = await finance.post(`/api/returns/anything/resolve`).send({ kind: "store_credit", method: "razorpay" });
    expect(res.status).toBe(422);
  });

  it("won't override a rejection when the units were returned again meanwhile", async () => {
    const admin = await login("admin@kaveri.test");
    const manager = await login("manager@kaveri.test");
    const rule = (await admin.post("/api/rules").send({ name: "Review: reject other", priority: 1, conditions: [{ field: "reason", op: "is", value: "other" }], action: "auto_reject", actionNote: "Not accepted" })).body;
    const first = await makeReturn(admin, { reason: "other", detail: "test" });
    expect(first.status).toBe("rejected");
    await admin.delete(`/api/rules/${rule.id}`).expect(204);
    // The same unit is returned again in a new request
    const again = await request(app).post("/api/portal/kaveri/returns").set("x-portal-token", first.token)
      .field("payload", JSON.stringify({ items: [{ orderItemId: first.itemId, quantity: 1, reason: "size_issue" }], resolution: "refund" }));
    expect(again.status).toBe(201);
    const res = await manager.post(`/api/returns/${first.id}/approve`).send({ note: "override" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/already covered by another return/);
  });

  it("keeps a rule's other settings when it's toggled", async () => {
    const admin = await login("admin@kaveri.test");
    const rule = (await admin.post("/api/rules").send({ name: "Review: any", priority: 7, match: "any", enabled: false, conditions: [{ field: "value", op: "gt", value: 99999 }], action: "flag" })).body;
    const toggled = (await admin.patch(`/api/rules/${rule.id}`).send({ enabled: true })).body;
    expect(toggled).toMatchObject({ enabled: true, priority: 7, match: "any" });
    const renamed = (await admin.patch(`/api/rules/${rule.id}`).send({ name: "Review: renamed" })).body;
    expect(renamed).toMatchObject({ enabled: true, priority: 7, match: "any", name: "Review: renamed" });
    const audit = await admin.get("/api/audit?action=rule.enabled");
    expect(audit.body.total).toBeGreaterThan(0);
    await admin.delete(`/api/rules/${rule.id}`).expect(204);
  });

  it("doesn't let finance re-sync stock, and never re-sends a synced restock", async () => {
    const finance = await login("finance@kaveri.test");
    const warehouse = await login("warehouse@kaveri.test");
    const synced = (await warehouse.get("/api/work/inventory")).body.movements.find((m: any) => m.syncStatus === "synced");
    await finance.post(`/api/work/inventory/${synced.id}/sync`).expect(403);
    const again = (await warehouse.post(`/api/work/inventory/${synced.id}/sync`)).body;
    expect(again.syncMessage).toBe(synced.syncMessage);
  });

  it("treats an RTO on a reverse pickup as a failed pickup", async () => {
    const admin = await login("admin@kaveri.test");
    const support = await login("support@kaveri.test");
    const r = await makeReturn(admin);
    const awb = `RTO${Date.now()}`;
    await support.post(`/api/returns/${r.id}/pickup`).send({ courier: "Delhivery", awb }).expect(200);
    const { secret } = (await admin.post("/api/integrations/webhook/reveal")).body;
    const raw = JSON.stringify({ awb, status: "RTO_DELIVERED" });
    const t = Math.floor(Date.now() / 1000);
    const res = await request(app).post("/api/webhooks/courier/kaveri").set("Content-Type", "application/json").set("X-ReturnFlow-Signature", `t=${t},v1=${hmacSha256(secret, `${t}.${raw}`)}`).send(raw);
    expect(res.body.status).toBe("failed");
    expect((await support.get(`/api/returns/${r.id}`)).body.status).toBe("pickup_scheduled");
  });

  it("blocks private network addresses for merchant webhooks in production", async () => {
    expect(__test.isPrivate("127.0.0.1")).toBe(true);
    expect(__test.isPrivate("10.1.2.3")).toBe(true);
    expect(__test.isPrivate("172.20.0.1")).toBe(true);
    expect(__test.isPrivate("192.168.1.10")).toBe(true);
    expect(__test.isPrivate("169.254.169.254")).toBe(true);
    expect(__test.isPrivate("::1")).toBe(true);
    expect(__test.isPrivate("8.8.8.8")).toBe(false);
    await expect(assertPublicUrl("https://127.0.0.1/hook", true)).rejects.toThrow(/private network/);
    await expect(assertPublicUrl("http://8.8.8.8/hook", true)).rejects.toThrow(/https/);
    await expect(assertPublicUrl("https://8.8.8.8/hook", true)).resolves.toBeUndefined();
  });
});
