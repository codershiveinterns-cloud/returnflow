# ReturnFlow — Deployment & go-live

Production runs as **one Node.js process behind Nginx** on a VPS (Hostinger VPS, DigitalOcean, AWS Lightsail…). The API serves the built web app from the same origin, so session cookies stay first-party and there is no CORS surface.

```
Internet ──HTTPS──▶ Nginx (SSL, gzip, 40 MB uploads) ──▶ Node (PM2) :4000
                                                          ├─ /api/*   REST API, webhooks, portal
                                                          ├─ /*       web app (web/dist)
                                                          ├─ prisma/prod.db   SQLite (WAL)
                                                          └─ storage/         private photos & logos
```

SQLite is a deliberate choice for a single-server pilot: zero-ops, fast, and backed up nightly. When the business outgrows one server, switch Prisma to PostgreSQL (see *Scaling* below) — no application changes are needed beyond the driver adapter.

---

## 1. Server prerequisites (Ubuntu 22.04/24.04, 1 vCPU / 1 GB RAM minimum, 2 GB recommended)

```bash
sudo apt update && sudo apt install -y nginx sqlite3 git build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2
sudo snap install --classic certbot && sudo ln -sf /snap/bin/certbot /usr/bin/certbot
```

## 2. Domain (DNS)

At the domain registrar / DNS host, point the chosen hostname at the server:

| Type | Name | Value |
|---|---|---|
| `A` | `returns` (or `@`) | server IPv4 |
| `AAAA` | `returns` (optional) | server IPv6 |

Or a `CNAME` to the host's provided name. Check with `dig +short returns.example.com` before requesting SSL.

## 3. Application

```bash
sudo mkdir -p /srv/returnflow && sudo chown $USER /srv/returnflow
git clone https://github.com/codershiveinterns-cloud/returnflow.git /srv/returnflow
cd /srv/returnflow
npm ci
cp deploy/.env.production.example server/.env   # then edit — see §4
npm run build                                    # API → server/dist, web → web/dist
cd server && npx prisma migrate deploy && cd ..
```

Create the first workspace through **Sign up** on the live site (the owner becomes Admin). Do **not** run the demo seed in production.

## 4. Environment & secrets (`server/.env`)

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` (enables secure cookies) |
| `DATABASE_URL` | `file:./prisma/prod.db` |
| `APP_URL`, `PUBLIC_API_URL` | `https://returns.example.com` (both the same origin) |
| `WEB_DIST` | `../web/dist` — the API serves the web app |
| `SESSION_SECRET` | `openssl rand -hex 32` — **unique per environment** |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` — encrypts stored API tokens & secrets. **Back it up**: without it, saved Shopify/Razorpay credentials can't be decrypted |
| `SMTP_URL`, `MAIL_FROM` | Customer emails. Until set, emails are recorded in *Notifications* but not delivered |
| `ANTHROPIC_API_KEY` | Optional — enables Claude photo & reason analysis |

Staging and production must use **different** secrets and databases. `chmod 600 server/.env`.

## 5. Process manager

```bash
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save && pm2 startup     # follow the printed command so it restarts on reboot
pm2 logs returnflow
```

## 6. Nginx + SSL

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/returnflow
sudo sed -i 's/returns.example.com/YOUR.DOMAIN/g' /etc/nginx/sites-available/returnflow
sudo ln -s /etc/nginx/sites-available/returnflow /etc/nginx/sites-enabled/
# First issue the certificate (temporarily comment out the 443 block if nginx -t complains)
sudo certbot --nginx -d YOUR.DOMAIN
sudo nginx -t && sudo systemctl reload nginx
```

Certbot installs a renewal timer; confirm with `sudo certbot renew --dry-run`.

## 7. Backups

```bash
chmod +x deploy/backup.sh
crontab -e
# 30 2 * * *  /srv/returnflow/deploy/backup.sh >> /var/log/returnflow-backup.log 2>&1
```

Nightly: an online-consistent copy of the database plus the private photo store, kept 14 days. Add `rclone` for off-site copies. **Restore drill:** `gunzip -c db-….sqlite.gz > server/prisma/prod.db && tar -xzf storage-….tar.gz -C server && pm2 restart returnflow`.

## 8. Integrations to connect after go-live

1. **Shopify** — *Integrations → Shopify*: custom app with `read_orders` + `write_inventory`, paste token & API secret, then add the shown webhook URL for `orders/create` and `orders/updated`.
2. **Razorpay** — *Integrations → Payments & AI*: live key ID & secret.
3. **Courier** — point the courier/aggregator status webhook at *Integrations → Courier tracking* URL.
4. **SMS / WhatsApp** — *Notifications → SMS & WhatsApp*: the relay URL; give the signing secret to whoever runs the relay.

## 9. Go-live checklist

- [ ] DNS resolves to the server; HTTPS loads with a valid certificate
- [ ] `server/.env` has production-only secrets; `NODE_ENV=production`
- [ ] `npx prisma migrate deploy` ran; PM2 shows `online`; survives `sudo reboot`
- [ ] Owner account created; team invited with the right roles
- [ ] Portal branding, return policy and rules configured
- [ ] Shopify / Razorpay / courier / SMTP connected and tested
- [ ] Backup cron installed and one manual run verified
- [ ] Smoke test passes (below)

## 10. Smoke test

```bash
node scripts/smoke.mjs https://YOUR.DOMAIN owner@store.com 'password' your-portal-slug
```

Checks health, HTTPS headers, landing page, portal, sign-in, every main console API, and that unauthenticated requests are refused.

## 11. Updating

```bash
cd /srv/returnflow && git pull && npm ci && npm run build
cd server && npx prisma migrate deploy && cd .. && pm2 reload returnflow
node scripts/smoke.mjs …
```

Roll back with `git checkout <previous tag>` and the same steps (migrations are additive).

## Scaling beyond one server

1. In `server/prisma/schema.prisma` set `provider = "postgresql"`; swap `@prisma/adapter-better-sqlite3` for `@prisma/adapter-pg` in `src/db.ts`; run `prisma migrate deploy` against the new database.
2. Move `src/lib/storage.ts` to S3/R2 with server-side encryption.
3. Move the in-memory rate limiter and login lockout to Redis, then raise PM2 `instances`.

## Vercel (demo only)

`vercel.json` deploys a **demo** with seeded data restored per instance; nothing created there persists. Use the VPS setup above for the client's production system.
