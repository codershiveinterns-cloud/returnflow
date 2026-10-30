# ReturnFlow — Handover guide

How the system is operated day to day, and where to look when something needs attention.

## The return lifecycle

```
Customer portal ─▶ Eligibility & rules ─▶ Review queue ─▶ Pickup ─▶ Warehouse ─▶ Inspection ─▶ Refund / credit / replacement ─▶ Restock
   (request)        auto-approve /         approve /       courier    received      checklist,      Razorpay, bank/UPI,             synced to
                    reject / review        reject /        + AWB                    photos, grade   credit code, replacement        the store
                                           escalate
```

Every step writes to the return's timeline (visible to the customer on the tracking page), the audit log, and — at key steps — emails the customer (and SMS/WhatsApp when connected).

## Who does what

| Role | Daily work | Main screens |
|---|---|---|
| **Support Agent** | Clears the review queue: approve, reject with a reason, or escalate. Books pickups. | Returns, Pickups, Notifications |
| **Manager** | Decides escalated and high-value returns, overrides rejections, watches analytics & risk. | Returns → Manager queue, Analytics, Risk |
| **Warehouse Staff** | Marks parcels received, inspects each item on a phone or tablet. | Inspection, Pickups, Inventory |
| **Finance** | Issues refunds, store credit and replacements; exports refund reports. | Refunds, Analytics, Audit log |
| **Admin** | Team & roles, return policy & rules, branding, integrations. | Rules & policy, Team & roles, Integrations, Portal & brand |

## Common admin tasks

- **Add a teammate** — *Team & roles → Add teammate*. Share the temporary password privately; they can change it from the menu under their name.
- **Change the return window or block a category** — *Rules & policy → Return policy*.
- **Add an automation rule** — *Rules & policy → New rule*. Use **Test on recent returns** before saving. Lower priority numbers run first.
- **Rebrand the portal** — *Portal & brand*: logo, colour, headline. The portal link is shown there for emails and the website footer.
- **Import historical orders** — *Integrations → CSV upload* (template downloadable on the page).
- **Export reports** — *Analytics → Returns CSV / Refunds CSV / PDF report*; *Audit log → Export CSV*.

## Integrations

| Integration | Where | What to check if it misbehaves |
|---|---|---|
| Shopify orders | Integrations → Shopify | Token scopes (`read_orders`), webhook topics, *Sync history* for row errors |
| Shopify restock | Inventory | Movement shows *Sync failed* → hover message; token needs `write_inventory`; **Retry** |
| REST API / order webhook | Integrations → REST API / Order webhook | Key not revoked; signature uses the current secret; timestamp within 5 minutes |
| Courier tracking | Integrations → Courier tracking | AWB on the return must match; status names listed on the page |
| Razorpay | Integrations → Payments & AI | Order must carry a `payment_id`; COD orders use bank/UPI refunds |
| Email | `SMTP_URL` on the server | *Notifications* shows *Failed* with the provider's error |
| SMS / WhatsApp | Notifications → SMS & WhatsApp | **Test** button; the relay must return HTTP 2xx |

## Security notes

- Each business's data is isolated server-side; staff only ever see their own workspace.
- Permissions are enforced on every API request. Disabling a teammate takes effect immediately.
- Changing a password signs that user out everywhere else; *Sign out everywhere* exists for lost devices.
- 8 failed sign-ins lock that email for 15 minutes.
- Store tokens, webhook and messaging secrets are encrypted at rest. Photos are private and served only to signed-in staff of that workspace.
- Every approval, rejection, override, refund, inventory change, rule change, export and sign-in is in the audit log.
- Dependency audit: the remaining advisories are inside the Prisma CLI's own tooling (`mysql2`, `deepmerge-ts`), which the running server never loads; re-check with `npm audit --omit=dev` after upgrades.

## Running locally

```bash
npm install
cp server/.env.example server/.env    # set SESSION_SECRET and ENCRYPTION_KEY
npm run db:setup                      # migrate + demo data
npm run dev                           # http://localhost:5173
npm test                              # API test suite
npx tsx server/scripts/perf.ts        # load test (6k orders / 4k returns)
```

Demo sign-ins are listed at the top of `server/prisma/seed.ts`.

## Where things live in the code

| Area | Path |
|---|---|
| Return workflow (create, approve, pickup, tracking) | `server/src/returns/service.ts` |
| Inspection, inventory, refunds | `server/src/returns/resolution.ts` |
| Eligibility engine & rules | `server/src/returns/eligibility.ts`, `rules.ts` |
| Risk scoring | `server/src/returns/risk.ts` |
| AI analysis (Claude + built-in fallback) | `server/src/ai/index.ts` |
| Notifications (email, SMS/WhatsApp hook) | `server/src/notify/` |
| Analytics & exports | `server/src/routes/analytics.ts` |
| Order sync (Shopify, CSV, API, webhooks) | `server/src/orders/` |
| Web console & portal | `web/src/pages/` |
