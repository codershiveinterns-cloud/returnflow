import { describe, expect, it } from "vitest";
import { login } from "./helpers.js";

describe("role-based access control", () => {
  const cases: [string, string, string, number][] = [
    ["warehouse@kaveri.test", "get", "/api/returns", 200],
    ["warehouse@kaveri.test", "get", "/api/orders", 403],
    ["warehouse@kaveri.test", "get", "/api/dashboard", 403],
    ["support@kaveri.test", "get", "/api/orders", 200],
    ["support@kaveri.test", "get", "/api/integrations", 403],
    ["support@kaveri.test", "get", "/api/audit", 403],
    ["support@kaveri.test", "get", "/api/team", 403],
    ["manager@kaveri.test", "get", "/api/audit", 200],
    ["manager@kaveri.test", "get", "/api/team", 200],
    ["manager@kaveri.test", "get", "/api/integrations", 403],
    ["finance@kaveri.test", "get", "/api/audit", 200],
    ["finance@kaveri.test", "get", "/api/team", 403],
    ["admin@kaveri.test", "get", "/api/integrations", 200],
  ];

  it.each(cases)("%s %s %s → %i", async (email, method, path, status) => {
    const agent = await login(email);
    const res = await (agent as any)[method](path);
    expect(res.status).toBe(status);
  });

  it("blocks non-admins from changing settings or the team", async () => {
    const manager = await login("manager@kaveri.test");
    await manager.patch("/api/settings/organization").send({ brandColor: "#000000" }).expect(403);
    await manager.post("/api/team").send({ name: "X Y", email: "x@y.test", role: "admin", password: "longenough1" }).expect(403);
  });

  it("exposes the permission list so the UI can shape navigation", async () => {
    const agent = await login("warehouse@kaveri.test");
    const me = await agent.get("/api/auth/me");
    expect(me.body.permissions).toEqual(["returns:view"]);
  });
});
