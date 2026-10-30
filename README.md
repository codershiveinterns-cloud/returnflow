# ReturnFlow

Multi-tenant reverse-logistics SaaS: a branded customer return portal, order
sync from Shopify / API / CSV, and one operations console for support,
warehouse, managers and finance.

**Status: complete (Milestones 1–4).** See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and [`docs/HANDOVER.md`](docs/HANDOVER.md).

## Quick start

Requirements: Node 22+.

```bash
npm install
cp server/.env.example server/.env   # then set SESSION_SECRET and ENCRYPTION_KEY (openssl rand -hex 32)
npm run db:setup                     # migrate + load demo data
npm run dev                          # API on :4000, web on :5173
```

Open http://localhost:5173.

### Demo data (local / staging only)

Two isolated workspaces are seeded. Sign-ins and the shared demo password are
listed at the top of [`server/prisma/seed.ts`](server/prisma/seed.ts).

| Workspace | Portal | Users |
|---|---|---|
| Kaveri & Co. | `/r/kaveri` | one user per role (admin, manager, support, warehouse, finance) |
| Northwind Outfitters | `/r/northwind` | admin |

Portal test order: **#1029** with `neha.joshi@example.com` (or phone `98000 00009`).

`npm run db:reset` wipes and re-seeds the local database.

## Deploying to Vercel (demo mode)

`vercel.json` deploys two services on one domain: `web` (Vite) at `/` and
`server` (Express) at `/api/*`.

1. Import the repo in Vercel (root directory `./`).
2. Add two environment variables, each generated with `openssl rand -hex 32`:
   `SESSION_SECRET` and `ENCRYPTION_KEY`.
3. Deploy.

Demo mode bakes a seeded SQLite database into the server build and restores it
into `/tmp` on each instance. **Nothing created on the live site is durable** —
signups, returns and photos disappear when Vercel recycles an instance. For a
real deployment, move to PostgreSQL and object storage (see
`docs/ARCHITECTURE.md` → Production path).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) + web (Vite) together |
| `npm test` | API integration tests (Vitest + Supertest, isolated test DB) |
| `npm run typecheck` | TypeScript across both apps |
| `npm run build` | Compile API to `server/dist`, bundle web to `web/dist` |
| `npx tsx server/scripts/perf.ts` | Load test on 6,000 orders / 4,000 returns (target < 2 s) |
| `node scripts/smoke.mjs <url> <email> <password> <slug>` | Post-deploy smoke test |

## Layout

```
server/
  prisma/            schema, migrations, demo seed
  src/auth/          sessions, RBAC matrix, middleware
  src/orders/        canonical order schema, ingest, CSV, Shopify
  src/returns/       status graph, reasons
  src/routes/        HTTP routes (console, portal, v1 API, webhooks)
  test/              integration tests
web/
  src/components/ui  design system (buttons, fields, badges, drawer, modal…)
  src/layouts/       auth gate, app shell
  src/pages/app/     console pages
  src/pages/portal/  customer portal + tracking
docs/            ARCHITECTURE, DEPLOYMENT, HANDOVER, ci-workflow.yml
deploy/          nginx, PM2, backup script, production env template
scripts/         smoke test
```

## What's included

| Milestone | Delivered |
|---|---|
| 1 · Foundation | Multi-tenant model, auth & 5 roles, order sync (Shopify, REST API, signed webhook, CSV), branded customer portal with photos & tracking, console shell, landing page |
| 2 · Workflow | Eligibility engine, review queue (approve / reject / escalate / override), IF/THEN rules builder with preview, pickup & courier tracking (manual + signed webhook), customer email notifications |
| 3 · Resolution | Mobile inspection (checklist, photos, grade, disposition), refunds via Razorpay / bank-UPI / store credit / replacement, inventory & Shopify restock sync, AI reason & condition analysis, risk scoring & pattern detection |
| 4 · Go-live | Analytics dashboard, CSV/PDF reports, audit export, SMS/WhatsApp hook, security hardening, performance (paged queries, code-split UI), deployment configs, smoke test, handover docs |
