import http from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hmacSha256 } from "../src/lib/crypto.js";
import { app, login } from "./helpers.js";

describe("CSV import", () => {
  const good = [
    "Order Number,Placed At,Status,Customer Email,Customer Name,SKU,Product Name,Variant,Quantity,Unit Price",
    "#5001,2026-09-10,delivered,csv.one@example.com,Csv One,TEE-01,Cotton Tee,M,2,599",
    "#5001,2026-09-10,delivered,csv.one@example.com,Csv One,CAP-01,Cap,,1,399.50",
    "5002,2026-09-11,fulfilled,csv.two@example.com,,TEE-01,Cotton Tee,L,1,599",
    "5003,2026-09-11,fulfilled,not-an-email,,TEE-01,Cotton Tee,L,1,599",
    "5004,2026-09-11,fulfilled,csv.four@example.com,,TEE-01,Cotton Tee,L,zero,599",
  ].join("\n");

  it("previews without writing, then commits valid orders and reports row errors", async () => {
    const admin = await login("admin@kaveri.test");
    const preview = await admin.post("/api/orders/import").attach("file", Buffer.from(good), "orders.csv");
    expect(preview.status).toBe(200);
    expect(preview.body.orderCount).toBe(2);
    expect(preview.body.itemCount).toBe(3);
    expect(preview.body.errors).toHaveLength(2);
    expect(preview.body.errors[0].ref).toContain("row 5");
    expect((await admin.get("/api/orders?q=5001")).body.total).toBe(0);

    const commit = await admin.post("/api/orders/import").field("commit", "true").attach("file", Buffer.from(good), "orders.csv");
    expect(commit.body).toMatchObject({ created: 2, updated: 0, failed: 2 });

    const list = await admin.get("/api/orders?q=5001");
    const detail = await admin.get(`/api/orders/${list.body.orders[0].id}`);
    expect(detail.body.items).toHaveLength(2);
    expect(detail.body.totalMinor).toBe(2 * 59900 + 39950);
    expect(detail.body.source).toBe("csv");

    // Re-import is idempotent: same orders are updated, not duplicated
    const again = await admin.post("/api/orders/import").field("commit", "true").attach("file", Buffer.from(good), "orders.csv");
    expect(again.body).toMatchObject({ created: 0, updated: 2 });

    const runs = await admin.get("/api/integrations/sync-runs");
    expect(runs.body.runs[0]).toMatchObject({ source: "csv", status: "partial", label: "orders.csv" });
  });

  it("rejects files missing required columns", async () => {
    const admin = await login("admin@kaveri.test");
    const res = await admin.post("/api/orders/import").attach("file", Buffer.from("order_number,sku\n1,a\n"), "bad.csv");
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain("customer_email");
  });

  it("serves a template and only lets admins import", async () => {
    const support = await login("support@kaveri.test");
    const tpl = await support.get("/api/orders/import/template.csv");
    expect(tpl.status).toBe(200);
    expect(tpl.text.split("\n")[0]).toContain("order_number,placed_at");
    await support.post("/api/orders/import").attach("file", Buffer.from(good), "orders.csv").expect(403);
  });
});

describe("REST API with API keys", () => {
  it("creates, reads and rejects orders based on key validity", async () => {
    const admin = await login("admin@kaveri.test");
    const key = await admin.post("/api/integrations/api-keys").send({ name: "ERP" });
    expect(key.body.token).toMatch(/^rf_[a-z0-9]{8}_/);
    const bearer = `Bearer ${key.body.token}`;

    const order = {
      order_number: "API-77",
      placed_at: "2026-09-20T10:00:00Z",
      status: "delivered",
      customer: { email: "Api.Buyer@Example.com", name: "Api Buyer" },
      items: [{ sku: "MUG-1", name: "Stoneware Mug", quantity: 2, unit_price: 450 }],
    };
    const created = await request(app).post("/api/v1/orders").set("Authorization", bearer).send(order);
    expect(created.status).toBe(201);
    expect(created.body.created).toBe(1);

    const fetched = await request(app).get("/api/v1/orders/API-77").set("Authorization", bearer);
    expect(fetched.body.customer.email).toBe("api.buyer@example.com");
    expect(fetched.body.total_minor).toBe(90000);

    const invalid = await request(app).post("/api/v1/orders").set("Authorization", bearer).send({ order_number: "X", items: [] });
    expect(invalid.status).toBe(422);
    expect(invalid.body.errors[0].message).toContain("items");

    await request(app).post("/api/v1/orders").set("Authorization", "Bearer rf_aaaaaaaa_notarealkeynotarealkey").send(order).expect(401);
    await request(app).post("/api/v1/orders").send(order).expect(401);

    await admin.delete(`/api/integrations/api-keys/${key.body.id}`).expect(204);
    await request(app).get("/api/v1/orders/API-77").set("Authorization", bearer).expect(401);
  });
});

describe("signed order webhook", () => {
  it("accepts correctly signed payloads and rejects tampered or stale ones", async () => {
    const admin = await login("admin@kaveri.test");
    const { body } = await admin.post("/api/integrations/webhook/reveal");
    const secret = body.secret as string;
    const payload = JSON.stringify({ orders: [{ order_number: "WH-1", placed_at: "2026-09-21", customer: { email: "wh@example.com" }, items: [{ sku: "S1", name: "Scarf", quantity: 1, unit_price: 999 }] }] });
    const sign = (t: number, raw: string) => `t=${t},v1=${hmacSha256(secret, `${t}.${raw}`)}`;
    const now = Math.floor(Date.now() / 1000);

    const ok = await request(app).post("/api/webhooks/orders/kaveri").set("Content-Type", "application/json").set("X-ReturnFlow-Signature", sign(now, payload)).send(payload);
    expect(ok.status).toBe(200);
    expect(ok.body.created).toBe(1);

    const tampered = payload.replace("999", "1");
    await request(app).post("/api/webhooks/orders/kaveri").set("Content-Type", "application/json").set("X-ReturnFlow-Signature", sign(now, payload)).send(tampered).expect(401);
    await request(app).post("/api/webhooks/orders/kaveri").set("Content-Type", "application/json").set("X-ReturnFlow-Signature", sign(now - 3600, payload)).send(payload).expect(401);
    await request(app).post("/api/webhooks/orders/kaveri").set("Content-Type", "application/json").send(payload).expect(401);
  });
});

describe("Shopify", () => {
  const shopOrder = (id: number, name: string, extra: object = {}) => ({
    id,
    name,
    email: "shopper@example.com",
    created_at: "2026-09-15T08:00:00Z",
    currency: "INR",
    total_price: "3198.00",
    fulfillment_status: "fulfilled",
    payment_gateway_names: ["Cash on Delivery (COD)"],
    customer: { id: 44, first_name: "Shop", last_name: "Per" },
    line_items: [{ id: id * 10, sku: "TSHIRT-M", title: "Graphic Tee", variant_title: "M", quantity: 2, price: "1599.00" }],
    fulfillments: [{ shipment_status: "delivered", updated_at: "2026-09-18T08:00:00Z" }],
    ...extra,
  });

  let server: http.Server;
  let seenToken = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seenToken = String(req.headers["x-shopify-access-token"] ?? "");
      if (seenToken !== "shpat_valid_token_123") return void res.writeHead(401).end();
      res.setHeader("Content-Type", "application/json");
      if (req.url?.includes("/shop.json")) return void res.end(JSON.stringify({ shop: { name: "Mock Boutique", currency: "INR", myshopify_domain: "mock.myshopify.com" } }));
      if (req.url?.includes("page_info=p2")) return void res.end(JSON.stringify({ orders: [shopOrder(3, "#SH3")] }));
      if (req.url?.includes("/orders.json")) {
        res.setHeader("Link", `<http://127.0.0.1:47899/admin/api/2025-07/orders.json?page_info=p2>; rel="next"`);
        return void res.end(JSON.stringify({ orders: [shopOrder(1, "#SH1"), shopOrder(2, "#SH2", { cancelled_at: "2026-09-16T00:00:00Z" })] }));
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(47899, "127.0.0.1", r));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("verifies credentials on connect and pulls every page of orders", async () => {
    const admin = await login("admin@northwind.test");
    const bad = await admin.post("/api/integrations/shopify").send({ mode: "live", shopDomain: "mock", accessToken: "shpat_wrong_token", apiSecret: "secret_secret_1" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/rejected the access token/);

    const ok = await admin.post("/api/integrations/shopify").send({ mode: "live", shopDomain: "mock", accessToken: "shpat_valid_token_123", apiSecret: "secret_secret_1" });
    expect(ok.status).toBe(201);
    expect(ok.body.displayName).toBe("Mock Boutique");

    const sync = await admin.post("/api/integrations/shopify/sync");
    expect(sync.body).toMatchObject({ created: 3, failed: 0 });

    const list = await admin.get("/api/orders?source=shopify");
    const byNum = Object.fromEntries(list.body.orders.map((o: any) => [o.orderNumber, o]));
    expect(byNum.SH1).toMatchObject({ status: "delivered", paymentMethod: "cod", totalMinor: 319800 });
    expect(byNum.SH2.status).toBe("cancelled");

    const integrations = await admin.get("/api/integrations");
    expect(integrations.body.shopify.shopDomain).toBe("mock.myshopify.com");
    expect(JSON.stringify(integrations.body)).not.toContain("shpat_valid_token_123");
  });

  it("verifies Shopify webhook HMAC before ingesting", async () => {
    const admin = await login("admin@northwind.test");
    const { body } = await admin.get("/api/integrations");
    const url = new URL(body.shopify.webhookUrl).pathname;
    const raw = JSON.stringify(shopOrder(9, "#SH9", { fulfillment_status: null, fulfillments: [] }));

    await request(app).post(url).set("Content-Type", "application/json").set("X-Shopify-Topic", "orders/create").set("X-Shopify-Hmac-Sha256", "bogus").send(raw).expect(401);

    const ok = await request(app)
      .post(url)
      .set("Content-Type", "application/json")
      .set("X-Shopify-Topic", "orders/create")
      .set("X-Shopify-Hmac-Sha256", hmacSha256("secret_secret_1", raw, "base64"))
      .send(raw);
    expect(ok.status).toBe(200);
    expect(ok.body.created).toBe(1);
    const o = await admin.get("/api/orders?q=SH9");
    expect(o.body.orders[0].status).toBe("pending");
  });

  it("sandbox mode produces orders through the same pipeline", async () => {
    const admin = await login("admin@kaveri.test");
    const before = (await admin.get("/api/orders?source=shopify")).body.total;
    const sync = await admin.post("/api/integrations/shopify/sync");
    expect(sync.status).toBe(200);
    expect(sync.body.created).toBeGreaterThan(0);
    expect((await admin.get("/api/orders?source=shopify")).body.total).toBe(before + sync.body.created);
  });
});
