# ReturnFlow — Architecture (Milestone 1)

## Shape of the system

```
               ┌──────────────── web (React + Vite + Tailwind) ────────────────┐
 Staff  ─────▶ │  /app/*   operations console (session cookie)                 │
 Customer ───▶ │  /r/:slug branded return portal (no account, order-scoped)    │
               └───────────────────────────┬───────────────────────────────────┘
                                           │ /api (same origin in prod, Vite proxy in dev)
               ┌───────────────────────────▼───────────────────────────────────┐
               │ server (Express 5 + TypeScript + Prisma)                      │
               │  /api/auth        email+password, httpOnly JWT session        │
               │  /api/*           console API — requireAuth + requirePermission│
               │  /api/portal      public portal, short-lived order token      │
               │  /api/v1          REST API — per-tenant API keys              │
               │  /api/webhooks    Shopify HMAC · generic signed webhook       │
               │  /api/files       private photos, tenant-checked              │
               └──────────┬───────────────────────────────┬────────────────────┘
                          │                               │
                  SQLite (dev/staging)              private file storage
                  PostgreSQL (production)           (local disk → S3/R2 in prod)
```

## Multi-tenancy

* `Organization` is the tenant. Every business table carries `organizationId`.
* The tenant for a request is **never** taken from the client. It comes from:
  the session's membership (console), the API key (REST), the portal slug
  (portal), or the integration id / slug + signature (webhooks).
* Every query filters on that `organizationId`. Cross-tenant lookups return
  404, not 403, so ids can't be probed. `test/tenancy.test.ts` enforces this.
* Order numbers are unique **per tenant** (`@@unique([organizationId, orderNumber])`).
* Users are global; `Membership(userId, organizationId, role, status)` grants
  access, so one person can later belong to several businesses.

## Roles & permissions

Defined once in `server/src/auth/rbac.ts` and returned to the UI via
`/api/auth/me`. The UI uses them only to shape navigation; the server checks
them on every route. Membership is re-read on each request, so disabling a
teammate revokes access immediately, even for an open session.

| Permission | Admin | Manager | Support | Warehouse | Finance |
|---|:-:|:-:|:-:|:-:|:-:|
| dashboard:view | ✓ | ✓ | ✓ | | ✓ |
| orders:view | ✓ | ✓ | ✓ | | ✓ |
| orders:import | ✓ | | | | |
| returns:view | ✓ | ✓ | ✓ | ✓ | ✓ |
| integrations:manage | ✓ | | | | |
| team:view | ✓ | ✓ | | | |
| team:manage | ✓ | | | | |
| settings:manage | ✓ | | | | |
| audit:view | ✓ | ✓ | | | ✓ |

Milestones 2–3 add `returns:approve`, `returns:escalate`, `inspection:perform`,
`refunds:issue`, `rules:manage` to this table.

## Return status flow

```
requested ──▶ approved ──▶ pickup_scheduled ──▶ in_transit ──▶ received ──▶ inspected ──▶ refunded ─┐
    │             └───────────────────────────────────────────────────────────────────────▶ replaced ─┼─▶ closed
    └──▶ rejected ────────────────────────────────────────────────────────────────────────────────────┘
```

`server/src/returns/status.ts` holds the allowed transitions. In M1 returns are
created as `requested`; the M2 workflow moves them along this graph, writing a
`ReturnEvent` (customer-visible timeline) and an `AuditLog` row per change.

Colour language (UI): amber = needs review, blue = in progress,
red = rejected/flagged, green = refunded/replaced/closed.

## Order sync pipeline

All sources converge on one validated shape (`server/src/orders/schema.ts`)
and one idempotent upsert (`server/src/orders/ingest.ts`):

| Source | Endpoint | Auth |
|---|---|---|
| Shopify pull | `POST /api/integrations/shopify/sync` | Admin API token (encrypted at rest) |
| Shopify push | `POST /api/webhooks/shopify/:integrationId` | `X-Shopify-Hmac-Sha256` over raw body |
| REST API | `POST /api/v1/orders` | `Authorization: Bearer rf_…` (SHA-256 hashed at rest) |
| Signed webhook | `POST /api/webhooks/orders/:slug` | `X-ReturnFlow-Signature: t=…,v1=…`, 5-min replay window |
| CSV | `POST /api/orders/import` (preview, then `commit=true`) | Admin session |

* Orders match on `(organizationId, orderNumber)`; lines on an external line
  id or SKU. Re-syncs update instead of duplicating.
* Line items referenced by a return are never deleted by a later sync.
* Money is stored as integer minor units + ISO currency.
* Every run is recorded in `SyncRun` (counts + per-row errors) and shown in
  *Order sync → Sync history*.
* A **sandbox** Shopify mode generates realistic Shopify payloads through the
  same mapper, so the flow can be demoed before store credentials exist.

## Customer portal

1. `POST /api/portal/:slug/lookup` — order number + email **or** phone must
   match. Returns a 45-minute JWT scoped to that single order.
2. `POST /api/portal/:slug/returns` — multipart: `payload` JSON + photos as
   `photos_<orderItemId>` (≤ 4 per item, ≤ 8 MB, JPG/PNG/WEBP/HEIC). Server
   re-checks item ownership and returnable quantity inside the request.
3. `POST /api/portal/:slug/track` — RMA + email/phone.

Lookups are rate-limited. Cancelled / unshipped orders are blocked; the full
eligibility engine (window, categories, value, history) is Milestone 2.

## Security notes

* Passwords: bcrypt (cost 12). Login timing is constant whether or not the
  email exists.
* Session: HS256 JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in
  production), 12 h lifetime.
* Secrets (Shopify tokens, webhook secrets): AES-256-GCM with `ENCRYPTION_KEY`.
* Photos: stored outside any public directory; served only via
  `/api/files/photos/:id` after auth + permission + tenant checks.
* Helmet security headers; CORS locked to `APP_URL`.
* Audit log records sign-ins, imports, key/secret changes, team changes,
  settings changes and every return request, with actor and IP.

## Production path

* Switch Prisma to PostgreSQL: change `provider` in `schema.prisma`, swap the
  driver adapter in `src/db.ts` for `@prisma/adapter-pg`, run migrations.
* Swap `src/lib/storage.ts` for S3/R2 with server-side encryption.
* Move the in-memory rate limiter to Redis when running more than one node.
* Serve `web/dist` from the same origin as the API (or a CDN with `/api`
  routed to the server) so the session cookie stays first-party.
