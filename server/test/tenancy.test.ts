import { describe, expect, it } from "vitest";
import { login } from "./helpers.js";

describe("tenant isolation", () => {
  it("never shows one workspace's data to another", async () => {
    const kaveri = await login("admin@kaveri.test");
    const northwind = await login("admin@northwind.test");

    const kOrders = await kaveri.get("/api/orders?pageSize=100");
    const nOrders = await northwind.get("/api/orders?pageSize=100");
    expect(kOrders.body.total).toBeGreaterThan(40);
    expect(nOrders.body.total).toBeGreaterThanOrEqual(6);
    expect(nOrders.body.orders.every((o: any) => !o.customer.email.startsWith("ananya"))).toBe(true);
    const nNumbers = new Set(nOrders.body.orders.map((o: any) => o.orderNumber));
    expect(kOrders.body.orders.some((o: any) => nNumbers.has(o.orderNumber))).toBe(false);

    // Direct object access across tenants is a 404, not a leak
    const kOrderId = kOrders.body.orders[0].id;
    await northwind.get(`/api/orders/${kOrderId}`).expect(404);

    const kReturns = await kaveri.get("/api/returns");
    expect(kReturns.body.total).toBeGreaterThan(0);
    await northwind.get(`/api/returns/${kReturns.body.returns[0].id}`).expect(404);
    expect((await northwind.get("/api/returns")).body.total).toBe(0);

    // Audit trails are separate too
    const nAudit = await northwind.get("/api/audit?pageSize=100");
    expect(nAudit.body.entries.every((e: any) => e.organizationId !== kOrders.body.orders[0].organizationId)).toBe(true);
  });

  it("allows the same order number in two workspaces", async () => {
    const northwind = await login("admin@northwind.test");
    const csv = "order_number,placed_at,customer_email,sku,product_name,quantity,unit_price\n1001,2026-09-01,someone@nw.test,NW-1,Parka,1,5000\n";
    const res = await northwind.post("/api/orders/import").field("commit", "true").attach("file", Buffer.from(csv), "nw.csv");
    expect(res.body.created).toBe(1);
    const kaveri = await login("admin@kaveri.test");
    const k = await kaveri.get("/api/orders?q=1001");
    expect(k.body.orders.find((o: any) => o.orderNumber === "1001").customer.email).toBe("ananya.rao@example.com");
  });
});
