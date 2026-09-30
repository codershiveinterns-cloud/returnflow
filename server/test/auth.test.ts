import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, login, PASSWORD } from "./helpers.js";

describe("authentication", () => {
  it("signs up a new business as an admin of a fresh, empty workspace", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/signup").send({ orgName: "Test Threads", name: "Tara Test", email: "tara@threads.test", password: "longenough1" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("admin");
    expect(res.body.organization.slug).toBe("test-threads");
    expect(res.body.permissions).toContain("integrations:manage");

    const orders = await agent.get("/api/orders");
    expect(orders.status).toBe(200);
    expect(orders.body.total).toBe(0);
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const dup = await request(app).post("/api/auth/signup").send({ orgName: "X", name: "Someone", email: "admin@kaveri.test", password: "longenough1" });
    expect(dup.status).toBe(422); // orgName too short → validation first
    const dup2 = await request(app).post("/api/auth/signup").send({ orgName: "Another", name: "Someone", email: "admin@kaveri.test", password: "longenough1" });
    expect(dup2.status).toBe(409);
    const weak = await request(app).post("/api/auth/signup").send({ orgName: "Another", name: "Someone", email: "new@x.test", password: "short" });
    expect(weak.status).toBe(422);
    expect(weak.body.error.fields[0].path).toBe("password");
  });

  it("logs in, reports the session, and logs out", async () => {
    const agent = await login("support@kaveri.test");
    const me = await agent.get("/api/auth/me");
    expect(me.body.user.email).toBe("support@kaveri.test");
    expect(me.body.role).toBe("support");
    expect(me.body.organization.name).toBe("Kaveri & Co.");
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
  });

  it("rejects a wrong password without revealing whether the email exists", async () => {
    const a = await request(app).post("/api/auth/login").send({ email: "admin@kaveri.test", password: "nope-nope" });
    const b = await request(app).post("/api/auth/login").send({ email: "ghost@kaveri.test", password: PASSWORD });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it("does not accept a forged session cookie", async () => {
    await request(app).get("/api/auth/me").set("Cookie", "rf_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad").expect(401);
  });
});
