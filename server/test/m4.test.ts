import http from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hmacSha256 } from "../src/lib/crypto.js";
import { flushNotifications } from "../src/notify/index.js";
import { app, login, PASSWORD } from "./helpers.js";

const binary = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("analytics & reports", () => {
  it("computes return KPIs, reasons, products and stage timings", async () => {
    const manager = await login("manager@kaveri.test");
    const res = await manager.get("/api/analytics?days=90");
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d.kpis.returns).toBeGreaterThan(10);
    expect(d.kpis.returnRate).toBeGreaterThan(0);
    expect(d.kpis.returnRate).toBeLessThanOrEqual(1);
    expect(d.reasons[0]).toHaveProperty("label");
    expect(d.products[0]).toMatchObject({ sku: expect.any(String), returned: expect.any(Number) });
    expect(d.stages.map((s: any) => s.key)).toEqual(["decision", "pickup", "transit", "resolution"]);
    expect(d.series.length).toBeGreaterThan(5);
    expect(d.bucket).toBe("week");
    await manager.get("/api/analytics?days=12").expect(422);
    await (await login("support@kaveri.test")).get("/api/analytics").expect(403);
  });

  it("exports returns and refunds as CSV without spreadsheet formula injection", async () => {
    // A customer name starting with "=" must not become a formula
    const admin = await login("admin@kaveri.test");
    const key = (await admin.post("/api/integrations/api-keys").send({ name: "csv-test" })).body.token;
    await request(app).post("/api/v1/orders").set("Authorization", `Bearer ${key}`).send({ order_number: "CSV-INJ-1", placed_at: new Date().toISOString(), status: "delivered", customer: { email: "inj@example.com", name: '=HYPERLINK("http://x")' }, items: [{ sku: "INJ-1", name: "Scarf", quantity: 1, unit_price: 500 }] }).expect(201);
    const look = await request(app).post("/api/portal/kaveri/lookup").send({ orderNumber: "CSV-INJ-1", contact: "inj@example.com" });
    await request(app).post("/api/portal/kaveri/returns").set("x-portal-token", look.body.token).field("payload", JSON.stringify({ items: [{ orderItemId: look.body.order.items[0].id, quantity: 1, reason: "size_issue" }], resolution: "refund" })).expect(201);

    const finance = await login("finance@kaveri.test");
    const csv = await finance.get("/api/analytics/export/returns.csv?days=30");
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.headers["content-disposition"]).toMatch(/returns-last-30-days\.csv/);
    expect(csv.text.split("\n")[0]).toContain("rma,created_at,status");
    expect(csv.text).toContain(`"'=HYPERLINK(""http://x"")"`);
    const refunds = await finance.get("/api/analytics/export/refunds.csv?days=365");
    expect(refunds.text.split("\n")[0]).toContain("created_at,rma,order_number");
  });

  it("generates a PDF summary report and audits every export", async () => {
    const manager = await login("manager@kaveri.test");
    const pdf = await manager.get("/api/analytics/report.pdf?days=30").buffer(true).parse(binary);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect((pdf.body as Buffer).length).toBeGreaterThan(2000);
    const audit = await manager.get("/api/audit?action=report.");
    expect(audit.body.entries.map((e: any) => e.meta.report)).toEqual(expect.arrayContaining(["summary.pdf", "returns.csv", "refunds.csv"]));
    const auditCsv = await manager.get("/api/audit/export.csv?days=30");
    expect(auditCsv.text.split("\n")[0]).toBe("﻿time,actor_type,actor,action,entity,entity_id,details,ip");
  });
});

describe("SMS / WhatsApp hook", () => {
  let hook: http.Server;
  const received: { sig: string; body: string }[] = [];
  beforeAll(async () => {
    hook = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        received.push({ sig: String(req.headers["x-returnflow-signature"]), body: raw });
        res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((r) => hook.listen(47897, "127.0.0.1", r));
  });
  afterAll(() => new Promise<void>((r) => hook.close(() => r())));

  it("sends signed messages per channel on status changes", async () => {
    const admin = await login("admin@kaveri.test");
    await admin.put("/api/settings/messaging").send({ url: "not a url", channels: ["sms"] }).expect(422);
    const saved = await admin.put("/api/settings/messaging").send({ url: "http://127.0.0.1:47897/hook", channels: ["sms", "whatsapp"] });
    expect(saved.body).toMatchObject({ url: "http://127.0.0.1:47897/hook", channels: ["sms", "whatsapp"] });
    const { secret } = (await admin.post("/api/settings/messaging/reveal")).body;

    const test = await admin.post("/api/settings/messaging/test").send({ phone: "+91 98000 11111" });
    expect(test.body.results).toEqual([{ channel: "sms", status: "sent" }, { channel: "whatsapp", status: "sent" }]);

    // A real status change → both channels
    const support = await login("support@kaveri.test");
    const pending = (await support.get("/api/returns?status=requested&pageSize=100")).body.returns.find((r: any) => !r.requiresManager);
    received.length = 0;
    await support.post(`/api/returns/${pending.id}/approve`).send({}).expect(200);
    await flushNotifications();
    expect(received.map((r) => JSON.parse(r.body).channel).sort()).toEqual(["sms", "whatsapp"]);
    const msg = received[0];
    const [, t, v1] = /t=(\d+),v1=([a-f0-9]+)/.exec(msg.sig)!;
    expect(hmacSha256(secret, `${t}.${msg.body}`)).toBe(v1);
    expect(JSON.parse(msg.body)).toMatchObject({ type: "notification", template: "approved", rma: pending.rma, to: expect.stringMatching(/\+91/) });

    const log = await support.get("/api/notifications");
    expect(log.body.notifications.some((n: any) => n.channel === "whatsapp" && n.status === "sent")).toBe(true);
    await admin.put("/api/settings/messaging").send({ url: "", channels: [] }).expect(200);
  });
});

describe("security hardening", () => {
  it("signs out other sessions when the password changes", async () => {
    const first = request.agent(app);
    await first.post("/api/auth/signup").send({ orgName: "Session Co", name: "Sam Session", email: "sam@session.test", password: "firstpass1" }).expect(201);
    const second = await login("sam@session.test", "firstpass1");
    await second.post("/api/auth/password").send({ current: "wrong-one", next: "secondpass2" }).expect(400);
    await second.post("/api/auth/password").send({ current: "firstpass1", next: "short" }).expect(422);
    await second.post("/api/auth/password").send({ current: "firstpass1", next: "secondpass2" }).expect(200);
    await second.get("/api/auth/me").expect(200); // the device that changed it stays signed in
    const stale = await first.get("/api/auth/me");
    expect(stale.status).toBe(401);
    await request(app).post("/api/auth/login").send({ email: "sam@session.test", password: "firstpass1" }).expect(401);
    const again = await login("sam@session.test", "secondpass2");
    await again.post("/api/auth/sign-out-everywhere").expect(204);
    await second.get("/api/auth/me").expect(401);
  });

  it("locks an account after repeated failed sign-ins", async () => {
    await request(app).post("/api/auth/signup").send({ orgName: "Lock Co", name: "Lou Lock", email: "lou@lock.test", password: "rightpass1" }).expect(201);
    for (let i = 0; i < 8; i++) await request(app).post("/api/auth/login").send({ email: "lou@lock.test", password: "wrongpass" }).expect(401);
    const locked = await request(app).post("/api/auth/login").send({ email: "lou@lock.test", password: "rightpass1" });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("locked_out");
  });

  it("rejects files that only pretend to be images", async () => {
    const look = await request(app).post("/api/portal/kaveri/lookup").send({ orderNumber: "1031", contact: "ananya.rao@example.com" });
    const item = look.body.order.items[0];
    const res = await request(app)
      .post("/api/portal/kaveri/returns")
      .set("x-portal-token", look.body.token)
      .field("payload", JSON.stringify({ items: [{ orderItemId: item.id, quantity: 1, reason: "defective", reasonDetail: "x" }], resolution: "refund" }))
      .attach(`photos_${item.id}`, Buffer.from("<html><script>alert(1)</script></html>"), { filename: "evil.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/valid image/);
  });

  it("sends strict security headers", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("public contact form", () => {
  it("stores valid messages and rejects invalid or bot submissions", async () => {
    const ok = await request(app).post("/api/public/contact").send({ name: "Asha Kumar", email: "Asha@Store.in", company: "Asha Store", topic: "sales", message: "We process about 400 returns a month and want a demo." });
    expect(ok.status).toBe(201);
    const bad = await request(app).post("/api/public/contact").send({ name: "A", email: "nope", topic: "sales", message: "short" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.map((f: any) => f.path)).toEqual(expect.arrayContaining(["name", "email", "message"]));
    const bot = await request(app).post("/api/public/contact").send({ name: "Bot Bot", email: "bot@spam.test", topic: "other", message: "Buy cheap followers now!!", website: "http://spam" });
    expect(bot.status).toBe(422);
  });
});
