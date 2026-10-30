#!/usr/bin/env node
/**
 * Post-deploy smoke test. Read-only except for signing in.
 *
 *   node scripts/smoke.mjs https://returns.example.com admin@store.com 'password' store-slug
 */
const [base, email, password, slug] = process.argv.slice(2);
if (!base || !email || !password || !slug) {
  console.error("usage: node scripts/smoke.mjs <base-url> <admin-email> <password> <portal-slug>");
  process.exit(2);
}
let failed = 0;
const check = async (name, fn) => {
  const t0 = Date.now();
  try {
    const detail = await fn();
    console.log(`✓ ${name.padEnd(38)} ${String(Date.now() - t0).padStart(5)} ms ${detail ?? ""}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name.padEnd(38)} ${e.message}`);
  }
};
const expectOk = async (res) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
};

let cookie = "";
await check("API health", async () => (await (await expectOk(await fetch(`${base}/api/health`))).json()).ok && "ok");
await check("HTTPS + security headers", async () => {
  const res = await fetch(`${base}/api/health`);
  if (base.startsWith("https://") && !res.headers.get("strict-transport-security")) throw new Error("missing HSTS");
  if (res.headers.get("x-content-type-options") !== "nosniff") throw new Error("missing nosniff");
});
await check("Landing page", async () => { const t = await (await expectOk(await fetch(base))).text(); if (!t.includes('id="root"')) throw new Error("app shell missing"); });
await check("Customer portal config", async () => (await (await expectOk(await fetch(`${base}/api/portal/${slug}`))).json()).organization.name);
await check("Sign in", async () => {
  const res = await expectOk(await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error("no session cookie");
});
for (const [name, path] of [["Dashboard", "/api/dashboard"], ["Return queue", "/api/returns"], ["Orders", "/api/orders"], ["Analytics (30 days)", "/api/analytics?days=30"], ["Refund queue", "/api/work/refunds"], ["Inspection queue", "/api/work/inspections"], ["Risk patterns", "/api/work/risk"], ["Audit log", "/api/audit"]]) {
  await check(name, async () => { await expectOk(await fetch(`${base}${path}`, { headers: { cookie } })); });
}
await check("Unauthenticated access blocked", async () => { const r = await fetch(`${base}/api/returns`); if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`); });
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
