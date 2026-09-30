import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, login } from "./helpers.js";

describe("team management", () => {
  it("adds a teammate who can then sign in with their role", async () => {
    const admin = await login("admin@kaveri.test");
    const res = await admin.post("/api/team").send({ name: "New Picker", email: "picker@kaveri.test", role: "warehouse", password: "TempPass123" });
    expect(res.status).toBe(201);
    const picker = await login("picker@kaveri.test", "TempPass123");
    expect((await picker.get("/api/auth/me")).body.role).toBe("warehouse");

    // Disabling revokes access immediately, even for an existing session
    await admin.patch(`/api/team/${res.body.id}`).send({ status: "disabled" }).expect(200);
    await picker.get("/api/returns").expect(403);
    await request(app).post("/api/auth/login").send({ email: "picker@kaveri.test", password: "TempPass123" }).expect(403);
  });

  it("keeps at least one active admin", async () => {
    const admin = await login("admin@northwind.test");
    const team = await admin.get("/api/team");
    const me = team.body.members.find((m: any) => m.isYou);
    const res = await admin.patch(`/api/team/${me.id}`).send({ role: "support" });
    expect(res.status).toBe(400);
  });

  it("cannot modify members of another workspace", async () => {
    const kaveri = await login("admin@kaveri.test");
    const northwind = await login("admin@northwind.test");
    const nMember = (await northwind.get("/api/team")).body.members[0];
    await kaveri.patch(`/api/team/${nMember.id}`).send({ status: "disabled" }).expect(404);
  });
});
