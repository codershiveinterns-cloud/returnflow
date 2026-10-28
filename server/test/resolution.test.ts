import http from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyReason, analyzeCondition } from "../src/ai/index.js";
import { restockOnShopify } from "../src/inventory/shopifySync.js";
import { flushNotifications } from "../src/notify/index.js";
import { scoreRisk } from "../src/returns/risk.js";
import { app, login, PNG } from "./helpers.js";

const base = { valueMinor: 189900, returns90d: 0, claimed90dMinor: 0, changedMind90d: 0, reasons: ["size_issue"], hasPhotos: false, paymentMethod: "prepaid", daysSinceDelivery: 5, windowDays: 30, orderToReturnRatio: 0.5 };

describe("risk scoring", () => {
  it("scores a first, ordinary return as low risk", () => {
    expect(scoreRisk(base)).toMatchObject({ score: 0, level: "low" });
  });
  it("adds up history, value and evidence factors", () => {
    const r = scoreRisk({ ...base, returns90d: 3, valueMinor: 1_249_900, claimed90dMinor: 2_500_000, reasons: ["defective"], paymentMethod: "cod" });
    expect(r.level).toBe("high");
    expect(r.factors.map((f) => f.label)).toEqual(expect.arrayContaining(["3 earlier returns in 90 days", "Return value above ₹10,000", "Damage claimed without photos", "Cash-on-delivery order"]));
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("AI-assisted analysis (rules engine when no API key)", () => {
  it("classifies free-text reasons", async () => {
    expect((await classifyReason("Received a blue saree instead of mulberry", "size_issue", "Saree")).reason).toBe("wrong_item");
    expect((await classifyReason("Strap stitching came loose", "changed_mind", "Tote")).reason).toBe("defective");
    expect((await classifyReason("Shoulders are too narrow", "other", "Kurta")).source).toBe("rules");
  });
  it("suggests a grade and flags reason mismatches", async () => {
    const clean = await analyzeCondition({ product: "Kurta", claimedReason: "defective", checklist: { packaging: "pass", tags: "pass", damage: "pass", usage: "pass" }, photos: [] });
    expect(clean).toMatchObject({ grade: "A", disposition: "restock", mismatch: true });
    const worn = await analyzeCondition({ product: "Kurta", claimedReason: "size_issue", checklist: { packaging: "fail", tags: "fail", damage: "fail", usage: "fail" }, photos: [] });
    expect(worn).toMatchObject({ grade: "D", disposition: "dispose", mismatch: true });
  });
});

async function returns(agent: any, status: string) {
  return (await agent.get(`/api/returns?status=${status}&pageSize=100`)).body.returns as any[];
}

describe("receive → inspect → resolve", () => {
  let gateway: http.Server;
  let lastRefund: any = null;
  beforeAll(async () => {
    gateway = http.createServer((req, res) => {
      const auth = Buffer.from(String(req.headers.authorization ?? "").replace("Basic ", ""), "base64").toString();
      if (auth !== "rzp_test_ABC123:secret_secret_secret") return void res.writeHead(401).end(JSON.stringify({ error: { description: "Authentication failed" } }));
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/v1/payments?")) return void res.end(JSON.stringify({ items: [] }));
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        lastRefund = { url: req.url, body: JSON.parse(raw || "{}") };
        res.end(JSON.stringify({ id: "rfnd_LIVEMOCK001", status: "processed", amount: lastRefund.body.amount }));
      });
    });
    await new Promise<void>((r) => gateway.listen(47898, "127.0.0.1", r));
  });
  afterAll(() => new Promise<void>((r) => gateway.close(() => r())));

  it("lets the warehouse receive and inspect, with photos, AI suggestion and inventory", async () => {
    const warehouse = await login("warehouse@kaveri.test");
    const support = await login("support@kaveri.test");
    const inTransit = (await returns(warehouse, "in_transit"))[0];
    await support.post(`/api/returns/${inTransit.id}/receive`).expect(403);
    await warehouse.post(`/api/returns/${inTransit.id}/receive`).expect(200);

    const detail = (await warehouse.get(`/api/returns/${inTransit.id}`)).body;
    expect(detail.status).toBe("received");
    const item = detail.items[0];
    const checklist = { packaging: "pass", tags: "fail", damage: "fail", usage: "fail" };
    const suggestion = (await warehouse.post(`/api/returns/${inTransit.id}/items/${item.id}/analyze`).send({ checklist })).body;
    expect(suggestion).toMatchObject({ source: "rules", mismatch: true });

    const inspect = await warehouse
      .post(`/api/returns/${inTransit.id}/items/${item.id}/inspect`)
      .field("payload", JSON.stringify({ checklist, grade: "C", disposition: "damaged", notes: "Sweat marks on collar", aiSuggestion: suggestion }))
      .attach("photos", PNG, { filename: "collar.png", contentType: "image/png" });
    expect(inspect.body).toEqual({ complete: true });
    await warehouse.post(`/api/returns/${inTransit.id}/items/${item.id}/inspect`).field("payload", JSON.stringify({ checklist, grade: "C", disposition: "damaged" })).expect(400);

    const after = (await warehouse.get(`/api/returns/${inTransit.id}`)).body;
    expect(after.status).toBe("inspected");
    expect(after.items[0].inspection).toMatchObject({ grade: "C", disposition: "damaged", mismatch: true, inspectorName: "Ravi Kumar" });
    expect(after.items[0].inspectionPhotos).toHaveLength(1);
    expect(after.inventory[0]).toMatchObject({ disposition: "damaged", syncStatus: "not_required" });
  });

  it("holds risky refunds until inspection and blocks the wrong roles", async () => {
    const finance = await login("finance@kaveri.test");
    const held = (await returns(finance, "received")).find((r: any) => r.id);
    const res = await finance.post(`/api/returns/${held.id}/resolve`).send({ kind: "refund", method: "razorpay" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/on hold until the items are inspected/);
    await (await login("warehouse@kaveri.test")).post(`/api/returns/${held.id}/resolve`).send({ kind: "refund", method: "manual", reference: "x" }).expect(403);
  });

  it("issues refunds manually, through live Razorpay keys, and in test mode", async () => {
    const finance = await login("finance@kaveri.test");
    const admin = await login("admin@kaveri.test");
    const warehouse = await login("warehouse@kaveri.test");
    const queue = (await finance.get("/api/work/refunds")).body;
    const cod = queue.ready.find((r: any) => !r.hasPaymentRef);
    const prepaid = queue.ready.find((r: any) => r.hasPaymentRef);
    expect(cod && prepaid).toBeTruthy();

    // COD → manual refund with a bank/UPI reference; gateway refused
    await finance.post(`/api/returns/${cod.id}/resolve`).send({ kind: "refund", method: "razorpay" }).expect(400);
    await finance.post(`/api/returns/${cod.id}/resolve`).send({ kind: "refund", method: "manual" }).expect(400);
    await finance.post(`/api/returns/${cod.id}/resolve`).send({ kind: "refund", method: "manual", amount: 999999, reference: "UTR1" }).expect(400);
    const manual = await finance.post(`/api/returns/${cod.id}/resolve`).send({ kind: "refund", method: "manual", amount: cod.valueMinor / 100 / 2, reference: "UPI/4471029", note: "Partial: grade C" });
    expect(manual.body).toMatchObject({ status: "succeeded", method: "manual", amountMinor: cod.valueMinor / 2, reference: "UPI/4471029" });
    await finance.post(`/api/returns/${cod.id}/resolve`).send({ kind: "refund", method: "manual", reference: "UTR2" }).expect(400); // already resolved

    // Live keys against the mock gateway
    await admin.post("/api/integrations/razorpay").send({ mode: "live", keyId: "rzp_test_WRONG", keySecret: "nope-nope-nope" }).expect(400);
    await admin.post("/api/integrations/razorpay").send({ mode: "live", keyId: "rzp_test_ABC123", keySecret: "secret_secret_secret" }).expect(201);
    const live = await finance.post(`/api/returns/${prepaid.id}/resolve`).send({ kind: "refund", method: "razorpay" });
    expect(live.body).toMatchObject({ reference: "rfnd_LIVEMOCK001", gatewayMode: "live", status: "succeeded" });
    expect(lastRefund.url).toMatch(/^\/v1\/payments\/pay_.+\/refund$/);
    expect(lastRefund.body).toMatchObject({ amount: prepaid.valueMinor, speed: "normal" });
    expect(JSON.stringify((await admin.get("/api/integrations")).body)).not.toContain("secret_secret_secret");
    expect((await finance.get(`/api/returns/${prepaid.id}`)).body.status).toBe("refunded");

    // Test mode on the held return once it has been inspected
    await admin.post("/api/integrations/razorpay").send({ mode: "sandbox" }).expect(201);
    const held = (await finance.get("/api/work/refunds")).body.onHold[0];
    const heldDetail = (await warehouse.get(`/api/returns/${held.id}`)).body;
    for (const it of heldDetail.items) {
      await warehouse.post(`/api/returns/${held.id}/items/${it.id}/inspect`).field("payload", JSON.stringify({ checklist: { packaging: "pass", tags: "pass", damage: "pass", usage: "pass" }, grade: "A", disposition: "restock" })).expect(200);
    }
    const test = await finance.post(`/api/returns/${held.id}/resolve`).send({ kind: "refund", method: "razorpay" });
    expect(test.body).toMatchObject({ status: "succeeded", gatewayMode: "test" });
    expect(test.body.reference).toMatch(/^rfnd_test_/);

    await flushNotifications();
    const sent = (await finance.get(`/api/returns/${prepaid.id}`)).body.notifications.map((n: any) => n.subject);
    expect(sent.some((x: string) => /Refund issued/.test(x))).toBe(true);
    const audit = await admin.get("/api/audit?action=refund.");
    expect(audit.body.entries.map((e: any) => e.action)).toContain("refund.issued");
  });

  it("shows inventory and risk patterns", async () => {
    const manager = await login("manager@kaveri.test");
    const inv = (await manager.get("/api/work/inventory")).body;
    expect(inv.movements.find((m: any) => m.disposition === "restock")).toMatchObject({ syncStatus: "synced" });
    const risk = (await manager.get("/api/work/risk")).body;
    expect(risk.serialReturners[0]).toMatchObject({ name: "Farah Siddiqui" });
    expect(risk.serialReturners[0].count).toBeGreaterThanOrEqual(3);
    expect(risk.highRisk.some((r: any) => r.level === "high")).toBe(true);
    await (await login("warehouse@kaveri.test")).get("/api/work/risk").expect(403);
  });
});

describe("Shopify restock sync", () => {
  let shop: http.Server;
  const calls: any[] = [];
  beforeAll(async () => {
    shop = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw);
        calls.push(body);
        res.setHeader("Content-Type", "application/json");
        if (body.query.includes("productVariants")) {
          const found = body.variables.q === "sku:KNOWN-SKU";
          return void res.end(JSON.stringify({ data: { productVariants: { nodes: found ? [{ inventoryItem: { id: "gid://shopify/InventoryItem/1" } }] : [] }, locations: { nodes: [{ id: "gid://shopify/Location/9", name: "Bhiwandi" }] } } }));
        }
        res.end(JSON.stringify({ data: { inventoryAdjustQuantities: { userErrors: [] } } }));
      });
    });
    await new Promise<void>((r) => shop.listen(47899, "127.0.0.1", r));
  });
  afterAll(() => new Promise<void>((r) => shop.close(() => r())));

  it("adjusts available stock at the primary location", async () => {
    const cfg = { shopDomain: "mock.myshopify.com", accessToken: "shpat_x", apiSecret: "s" };
    expect(await restockOnShopify(cfg, "KNOWN-SKU", 2)).toBe("+2 at Bhiwandi");
    expect(calls.at(-1).variables.input).toEqual({ reason: "restock", name: "available", changes: [{ delta: 2, inventoryItemId: "gid://shopify/InventoryItem/1", locationId: "gid://shopify/Location/9" }] });
    await expect(restockOnShopify(cfg, "MISSING", 1)).rejects.toThrow(/not found/);
  });
});

describe("portal returns carry risk", () => {
  it("scores new requests", async () => {
    const look = await request(app).post("/api/portal/kaveri/lookup").send({ orderNumber: "1026", contact: "imran.q@example.com" });
    const item = look.body.order.items[0];
    const res = await request(app).post("/api/portal/kaveri/returns").set("x-portal-token", look.body.token).field("payload", JSON.stringify({ items: [{ orderItemId: item.id, quantity: 1, reason: "defective", reasonDetail: "Torn hem" }], resolution: "refund" }));
    expect(res.status).toBe(201);
    const admin = await login("admin@kaveri.test");
    const list = await admin.get(`/api/returns?q=${res.body.rma}`);
    expect(list.body.returns[0].riskScore).toBeGreaterThan(0);
  });
});
