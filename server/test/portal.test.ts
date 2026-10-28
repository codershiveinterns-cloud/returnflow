import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, login, PNG } from "./helpers.js";

async function lookup(orderNumber: string, contact: string) {
  return request(app).post("/api/portal/kaveri/lookup").send({ orderNumber, contact });
}

describe("customer return portal", () => {
  it("exposes branding for the portal page and 404s for unknown stores", async () => {
    const res = await request(app).get("/api/portal/kaveri");
    expect(res.body.organization).toMatchObject({ name: "Kaveri & Co.", brandColor: "#8a3b12" });
    expect(res.body.reasons.length).toBeGreaterThan(4);
    expect(res.body).not.toHaveProperty("organization.webhookSecretEnc");
    await request(app).get("/api/portal/nope").expect(404);
  });

  it("only finds an order with a matching email or phone", async () => {
    expect((await lookup("1029", "someone@else.com")).status).toBe(404);
    expect((await lookup("9999", "neha.joshi@example.com")).status).toBe(404);
    const byEmail = await lookup("#1029", "NEHA.JOSHI@example.com");
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.token).toBeTruthy();
    const byPhone = await lookup("1029", "98000 00009");
    expect(byPhone.status).toBe(200);
    // Other tenants' orders are not reachable through this portal
    expect((await lookup("9001", "nw.ananya.rao@example.com")).status).toBe(404);
  });

  it("submits a return with photos end to end and staff can see it", async () => {
    const { body } = await lookup("1029", "neha.joshi@example.com");
    const item = body.order.items[0];
    expect(item.returnableQuantity).toBe(item.quantity);

    const payload = { items: [{ orderItemId: item.id, quantity: 1, reason: "defective", reasonDetail: "Seam came apart" }], resolution: "refund", note: "Evening pickup please" };
    const res = await request(app)
      .post("/api/portal/kaveri/returns")
      .set("x-portal-token", body.token)
      .field("payload", JSON.stringify(payload))
      .attach(`photos_${item.id}`, PNG, { filename: "damage.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.rma).toMatch(/^RF-\d+$/);
    expect(res.body.valueMinor).toBe(item.unitPriceMinor);

    // Returnable quantity drops, so the same unit can't be returned twice
    const again = await lookup("1029", "neha.joshi@example.com");
    const updated = again.body.order.items.find((i: any) => i.id === item.id);
    expect(updated.returnableQuantity).toBe(item.quantity - 1);
    expect(again.body.order.existingReturns[0].rma).toBe(res.body.rma);

    const support = await login("support@kaveri.test");
    const list = await support.get(`/api/returns?q=${res.body.rma}`);
    expect(list.body.total).toBe(1); // an RMA search must not also match order numbers
    // Within policy, photo attached, under the auto-approve limit → approved automatically
    expect(res.body.status).toBe("approved");
    expect(list.body.returns[0]).toMatchObject({ rma: res.body.rma, status: "approved", photoCount: 1, reasons: ["defective"] });
    const detail = await support.get(`/api/returns/${list.body.returns[0].id}`);
    expect(detail.body.customerNote).toBe("Evening pickup please");
    expect(detail.body.events[0]).toMatchObject({ status: "requested", actorType: "customer" });
    expect(detail.body.eligibility.outcome).toBe("auto_approve");

    const photoUrl = detail.body.items[0].photos[0];
    const photo = await support.get(photoUrl);
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/png");
    await request(app).get(photoUrl).expect(401);
    const other = await login("admin@northwind.test");
    await other.get(photoUrl).expect(404);

    // Customer tracking
    const track = await request(app).post("/api/portal/kaveri/track").send({ rma: res.body.rma.toLowerCase(), contact: "neha.joshi@example.com" });
    expect(track.status).toBe(200);
    expect(track.body.timeline.map((t: any) => t.status)).toEqual(["requested", "approved"]);
    expect((await request(app).post("/api/portal/kaveri/track").send({ rma: res.body.rma, contact: "wrong@example.com" })).status).toBe(404);

    const audit = await (await login("admin@kaveri.test")).get("/api/audit?action=return.requested");
    expect(audit.body.entries[0]).toMatchObject({ action: "return.requested", actorType: "customer" });
  });

  it("validates quantities, reasons, photo types and the token", async () => {
    const { body } = await lookup("1029", "neha.joshi@example.com");
    const item = body.order.items[0];
    const post = (payload: object, token = body.token) => request(app).post("/api/portal/kaveri/returns").set("x-portal-token", token).field("payload", JSON.stringify(payload));

    expect((await post({ items: [{ orderItemId: item.id, quantity: 99, reason: "size_issue" }], resolution: "refund" })).status).toBe(400);
    expect((await post({ items: [{ orderItemId: item.id, quantity: 1, reason: "other" }], resolution: "refund" })).status).toBe(400);
    expect((await post({ items: [], resolution: "refund" })).status).toBe(422);
    expect((await post({ items: [{ orderItemId: item.id, quantity: 1, reason: "size_issue" }], resolution: "cash" })).status).toBe(422);
    expect((await post({ items: [{ orderItemId: "someone-elses", quantity: 1, reason: "size_issue" }], resolution: "refund" })).status).toBe(400);
    expect((await post({ items: [{ orderItemId: item.id, quantity: 1, reason: "size_issue" }], resolution: "refund" }, "garbage")).status).toBe(401);

    const pdf = await request(app)
      .post("/api/portal/kaveri/returns")
      .set("x-portal-token", body.token)
      .field("payload", JSON.stringify({ items: [{ orderItemId: item.id, quantity: 1, reason: "size_issue" }], resolution: "refund" }))
      .attach(`photos_${item.id}`, Buffer.from("%PDF-1.4"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(pdf.status).toBe(400);
  });

  it("blocks returns on cancelled and unshipped orders", async () => {
    const cancelled = await lookup("1006", "imran.q@example.com");
    expect(cancelled.body.order.blockedReason).toMatch(/cancelled/);
    const item = cancelled.body.order.items[0];
    const res = await request(app)
      .post("/api/portal/kaveri/returns")
      .set("x-portal-token", cancelled.body.token)
      .field("payload", JSON.stringify({ items: [{ orderItemId: item.id, quantity: 1, reason: "size_issue" }], resolution: "refund" }));
    expect(res.status).toBe(400);
  });
});
