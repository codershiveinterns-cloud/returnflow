import request from "supertest";
import { describe, expect, it } from "vitest";
import { hmacSha256 } from "../src/lib/crypto.js";
import { evaluate } from "../src/returns/eligibility.js";
import { flushNotifications } from "../src/notify/index.js";
import { app, login } from "./helpers.js";

const policy = { returnWindowDays: 30, nonReturnableCategories: '["Innerwear"]', autoApproveMaxMinor: 500000, maxReturnsPer90Days: 3, requirePhotoForDamage: true, currency: "INR" };
const base = { value: 1899, valueMinor: 189900, reason: ["size_issue"], category: ["Apparel"], customer_returns_90d: 0, days_since_delivery: 5, payment_method: "prepaid", item_count: 1, resolution: "refund", has_photos: false, orderStatus: "delivered" };
const rule = (action: string, conditions: object[], extra = {}) => ({ id: action, name: action, match: "all", conditions: JSON.stringify(conditions), action, actionNote: null, ...extra });

describe("eligibility engine", () => {
  it("approves requests that pass every check", () => {
    expect(evaluate(policy, base, []).outcome).toBe("auto_approve");
  });
  it("rejects outside the window and restricted categories", () => {
    const late = evaluate(policy, { ...base, days_since_delivery: 31 }, []);
    expect(late.outcome).toBe("auto_reject");
    expect(late.reason).toBe("Outside the 30-day return window (31 days since delivery)");
    expect(evaluate(policy, { ...base, category: ["innerwear"] }, []).outcome).toBe("auto_reject");
    expect(evaluate(policy, { ...base, orderStatus: "cancelled" }, []).outcome).toBe("auto_reject");
  });
  it("sends soft failures to review and flags frequent returners", () => {
    expect(evaluate(policy, { ...base, valueMinor: 900000 }, []).outcome).toBe("review");
    expect(evaluate(policy, { ...base, reason: ["defective"] }, []).reason).toMatch(/without photos/);
    const frequent = evaluate(policy, { ...base, customer_returns_90d: 3 }, []);
    expect(frequent.outcome).toBe("review");
    expect(frequent.flags).toContain("Frequent returner");
  });
  it("applies rule precedence: reject > manager > flag > approve", () => {
    const high = [{ field: "value", op: "gt", value: 1000 }];
    expect(evaluate(policy, base, [rule("require_manager", high)])).toMatchObject({ outcome: "review", requiresManager: true });
    expect(evaluate(policy, base, [rule("require_manager", high), rule("auto_reject", high)]).outcome).toBe("auto_reject");
    expect(evaluate(policy, { ...base, valueMinor: 900000 }, [rule("auto_approve", high)]).outcome).toBe("auto_approve");
    expect(evaluate(policy, { ...base, days_since_delivery: 40 }, [rule("auto_approve", high)]).outcome).toBe("auto_reject"); // hard policy wins
    const held = evaluate(policy, base, [rule("hold_refund", high)]);
    expect(held).toMatchObject({ outcome: "auto_approve", holdRefund: true });
    expect(evaluate(policy, base, [rule("flag", [{ field: "reason", op: "is", value: "size_issue" }], { actionNote: "Size check" })]).flags).toContain("Size check");
  });
  it("matches multi-valued fields on any item, and is_not on none", () => {
    const ctx = { ...base, reason: ["size_issue", "defective"], has_photos: true };
    expect(evaluate(policy, ctx, [rule("flag", [{ field: "reason", op: "is", value: "defective" }])]).outcome).toBe("review");
    expect(evaluate(policy, ctx, [rule("flag", [{ field: "reason", op: "is_not", value: "defective" }])]).outcome).toBe("auto_approve");
  });
});

async function findReturn(agent: any, query: string) {
  const res = await agent.get(`/api/returns?${query}&pageSize=100`);
  return res.body.returns as any[];
}

describe("approval workflow", () => {
  it("enforces manager approval and records decisions", async () => {
    const support = await login("support@kaveri.test");
    const manager = await login("manager@kaveri.test");
    const escalated = (await findReturn(support, "queue=escalated"))[0];
    expect(escalated.requiresManager).toBe(true);

    const denied = await support.post(`/api/returns/${escalated.id}/approve`).send({});
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toMatch(/manager/);

    await manager.post(`/api/returns/${escalated.id}/approve`).send({ note: "Photos confirm wrong colour" }).expect(200);
    const detail = await manager.get(`/api/returns/${escalated.id}`);
    expect(detail.body.status).toBe("approved");
    expect(detail.body.decision).toMatchObject({ by: "Arjun Rao", reason: "Photos confirm wrong colour" });
    expect(detail.body.events.at(-1).message).toMatch(/Approved by Arjun Rao/);
  });

  it("rejects with a reason, escalates, and lets managers override", async () => {
    const support = await login("support@kaveri.test");
    const manager = await login("manager@kaveri.test");
    const pending = (await findReturn(support, "status=requested")).filter((r) => !r.requiresManager);
    expect(pending.length).toBeGreaterThanOrEqual(2);

    await support.post(`/api/returns/${pending[0].id}/reject`).send({ reason: "other" }).expect(400);
    await support.post(`/api/returns/${pending[0].id}/reject`).send({ reason: "used_or_damaged", note: "Worn" }).expect(200);
    await support.post(`/api/returns/${pending[0].id}/approve`).send({}).expect(403); // override is manager-only
    await manager.post(`/api/returns/${pending[0].id}/approve`).send({ note: "Goodwill" }).expect(200);
    const audit = await (await login("admin@kaveri.test")).get("/api/audit?action=return.override");
    expect(audit.body.entries[0].action).toBe("return.override_approved");

    await support.post(`/api/returns/${pending[1].id}/escalate`).send({ note: "Customer disputes policy" }).expect(200);
    await support.post(`/api/returns/${pending[1].id}/escalate`).send({}).expect(400);
    await support.post(`/api/returns/${pending[1].id}/approve`).send({}).expect(403);
  });

  it("blocks roles without decision rights", async () => {
    const finance = await login("finance@kaveri.test");
    const warehouse = await login("warehouse@kaveri.test");
    const any = (await findReturn(finance, "status=requested"))[0];
    await finance.post(`/api/returns/${any.id}/approve`).send({}).expect(403);
    await warehouse.post(`/api/returns/${any.id}/reject`).send({ reason: "duplicate" }).expect(403);
  });
});

describe("pickup & tracking", () => {
  it("schedules a pickup, tracks it manually and by courier webhook, and notifies the customer", async () => {
    const support = await login("support@kaveri.test");
    const warehouse = await login("warehouse@kaveri.test");
    const approved = (await findReturn(support, "status=approved"))[0];

    await support.post(`/api/returns/${approved.id}/tracking`).send({ status: "picked_up" }).expect(400); // no pickup yet
    await support.post(`/api/returns/${approved.id}/pickup`).send({ courier: "Delhivery", awb: "7751093244" }).expect(400); // AWB already used by seed
    await support.post(`/api/returns/${approved.id}/pickup`).send({ courier: "Delhivery", awb: "TEST-AWB-001", scheduledFor: "2026-10-05", pickupWindow: "10am – 2pm" }).expect(200);
    await support.post(`/api/returns/${approved.id}/pickup`).send({ courier: "Delhivery", awb: "TEST-AWB-002" }).expect(400); // already scheduled

    await warehouse.post(`/api/returns/${approved.id}/tracking`).send({ status: "picked_up", location: "Pune" }).expect(200);
    expect((await support.get(`/api/returns/${approved.id}`)).body.status).toBe("in_transit");

    const admin = await login("admin@kaveri.test");
    const { body } = await admin.post("/api/integrations/webhook/reveal");
    const sign = (raw: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${hmacSha256(body.secret, `${t}.${raw}`)}`;
    const send = (payload: object, sig?: string) => {
      const raw = JSON.stringify(payload);
      return request(app).post("/api/webhooks/courier/kaveri").set("Content-Type", "application/json").set("X-ReturnFlow-Signature", sig ?? sign(raw)).send(raw);
    };
    await send({ awb: "TEST-AWB-001", status: "DELIVERED" }, "t=1,v1=bad").expect(401);
    await send({ awb: "NOPE-0000", status: "delivered" }).expect(404);
    await send({ awb: "TEST-AWB-001", status: "teleported" }).expect(400);
    const ok = await send({ awb: "TEST-AWB-001", status: "DELIVERED", location: "Bhiwandi DC" });
    expect(ok.body).toEqual({ ok: true, status: "delivered" });

    const detail = await support.get(`/api/returns/${approved.id}`);
    expect(detail.body.status).toBe("received");
    expect(detail.body.shipment.checkpoints.map((c: any) => c.status)).toEqual(["delivered", "picked_up", "scheduled"]);

    await flushNotifications();
    const sent = (await support.get(`/api/returns/${approved.id}`)).body.notifications.map((n: any) => n.subject);
    expect(sent.some((s: string) => /Pickup scheduled/.test(s))).toBe(true);
    expect(sent.some((s: string) => /on its way/.test(s))).toBe(true);
    expect(sent.some((s: string) => /received your return/.test(s))).toBe(true);

    const pickups = await support.get("/api/pickups");
    expect(pickups.body.shipments.find((s: any) => s.awb === "TEST-AWB-001").status).toBe("delivered");
  });
});

describe("automation rules", () => {
  it("creates, previews and applies a rule to new portal requests", async () => {
    const admin = await login("admin@kaveri.test");
    const conditions = [{ field: "category", op: "is", value: "Apparel" }];
    const preview = await admin.post("/api/rules/preview").send({ match: "all", conditions });
    expect(preview.body.tested).toBeGreaterThan(5);
    expect(preview.body.matched).toBeGreaterThan(0);

    const created = await admin.post("/api/rules").send({ name: "Test: block apparel", priority: 1, conditions, action: "auto_reject", actionNote: "Apparel returns are paused" });
    expect(created.status).toBe(201);

    const look = await request(app).post("/api/portal/kaveri/lookup").send({ orderNumber: "1028", contact: "aditya.bhat@example.com" });
    const item = look.body.order.items.find((i: any) => i.returnableQuantity > 0);
    const res = await request(app)
      .post("/api/portal/kaveri/returns")
      .set("x-portal-token", look.body.token)
      .field("payload", JSON.stringify({ items: [{ orderItemId: item.id, quantity: 1, reason: "size_issue" }], resolution: "refund" }));
    expect(res.body).toMatchObject({ status: "rejected", decision: "Apparel returns are paused" });

    const list = await admin.get("/api/rules");
    expect(list.body.rules.find((r: any) => r.id === created.body.id).matchCount).toBe(1);
    await admin.patch(`/api/rules/${created.body.id}`).send({ enabled: false }).expect(200);
    await admin.delete(`/api/rules/${created.body.id}`).expect(204);
    await (await login("manager@kaveri.test")).get("/api/rules").expect(403);
    await admin.post("/api/rules").send({ name: "x", conditions: [], action: "flag" }).expect(422);
  });

  it("updates the return policy", async () => {
    const admin = await login("admin@kaveri.test");
    const res = await admin.put("/api/settings/policy").send({ returnWindowDays: 45, nonReturnableCategories: ["Innerwear", "Innerwear"], autoApproveMax: 6000, maxReturnsPer90Days: 4, requirePhotoForDamage: false });
    expect(res.body).toMatchObject({ returnWindowDays: 45, nonReturnableCategories: ["Innerwear"], autoApproveMax: 6000 });
    await admin.put("/api/settings/policy").send({ returnWindowDays: 30, nonReturnableCategories: [], autoApproveMax: 5000, maxReturnsPer90Days: 3, requirePhotoForDamage: true }).expect(200);
    await (await login("support@kaveri.test")).put("/api/settings/policy").send({}).expect(403);
  });
});

describe("notifications outbox", () => {
  it("records every customer email with its rendered body", async () => {
    await flushNotifications();
    const support = await login("support@kaveri.test");
    const list = await support.get("/api/notifications");
    expect(list.body.total).toBeGreaterThan(10);
    expect(list.body.notifications[0]).toMatchObject({ channel: "email", status: "logged" });
    const one = await support.get(`/api/notifications/${list.body.notifications[0].id}`);
    expect(one.body.html).toContain("Track your return");
    await (await login("finance@kaveri.test")).get("/api/notifications").expect(403);
  });
});
