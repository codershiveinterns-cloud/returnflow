# ReturnFlow

Multi-tenant reverse-logistics SaaS: a branded customer return portal, order
sync from Shopify / API / CSV, and one operations console for support,
warehouse, managers and finance.

**Status: Milestone 1 (foundation)** — auth & roles, multi-tenant data model,
order sync (Shopify, REST API, signed webhook, CSV), customer return portal,
and the console UI shell. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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

Portal test order: **#1001** with `ananya.rao@example.com` (or phone `98000 00001`).

`npm run db:reset` wipes and re-seeds the local database.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) + web (Vite) together |
| `npm test` | API integration tests (Vitest + Supertest, isolated test DB) |
| `npm run typecheck` | TypeScript across both apps |
| `npm run build` | Compile API to `server/dist`, bundle web to `web/dist` |

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
docs/ARCHITECTURE.md
```

## Milestone 1 checklist

- [x] Architecture: multi-tenant model, schema, return status flow (`docs/ARCHITECTURE.md`)
- [x] Scaffolding: monorepo, TypeScript, CI workflow (`.github/workflows/ci.yml`)
- [x] Email/password auth, 5 staff roles, server-enforced permissions
- [x] Order sync: Shopify (pull + HMAC webhooks, sandbox mode), REST API with keys, signed webhook, CSV with preview
- [x] Customer portal: order lookup, item & quantity selection, reason, photo upload, refund / store credit / replacement, confirmation and tracking
- [x] Console shell & design system: overview, returns queue + detail, orders, order sync, team & roles, portal branding, audit log

Next (Milestone 2): eligibility rules engine, approve/reject/escalate workflow,
automation rules builder, pickup & courier tracking, email notifications.
