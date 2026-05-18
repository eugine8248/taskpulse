# Taskpulse — Self-host Deployment

A field guide for deploying the production build of taskpulse on your own
Linux server.

## 1. Server requirements

- Docker 24+ and Docker Compose v2 (`docker compose`, not the legacy
  `docker-compose`)
- ~1 GB RAM
- ~5 GB disk
- DNS A/AAAA record pointing at the server's public IP

## 2. Reverse proxy: Caddy (recommended)

Auto-HTTPS via Let's Encrypt. `/etc/caddy/Caddyfile`:

```
taskpulse.example.com {
  reverse_proxy 127.0.0.1:3001

  # Long-lived WebSocket for board updates
  @ws path /ws
  reverse_proxy @ws 127.0.0.1:3001 {
    transport http {
      versions h1
    }
  }

  encode gzip zstd
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

Reload Caddy (`sudo systemctl reload caddy`). HTTPS is live as soon as DNS
propagates.

## 3. First-deploy sequence

```sh
# 1. Get the code
git clone https://github.com/eugine8248/taskpulse.git
cd taskpulse

# 2. Env
cp .env.production.example .env.production
# REQUIRED in prod:
#   JWT_SECRET           — openssl rand -base64 48
#   PAT_ENCRYPTION_KEY   — node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#   DATABASE_URL         — usually file:./data/taskpulse.db
#   CLIENT_ORIGIN        — your front-end URL (comma-separated for multiple)
# OPTIONAL:
#   GITHUB_WEBHOOK_SECRET — enables /api/webhooks/github (32+ random chars)
nano .env.production

# 3. Build + start
docker compose --env-file .env.production up -d --build

# 4. Apply schema (idempotent)
docker compose exec taskpulse npx prisma db push --schema=./prisma/schema.prisma

# 5. Visit /setup in the browser to create the admin user.
#    The first user is the owner (id=1) and is the only one who can hit
#    /api/admin/audit-log.
```

## 4. Reports auto-update

The four daily cron buckets (stocks, tech-radar, dev-gig, morning) are
filesystem-watched. The Windows scheduled task `TaskpulsePullMorningReports`
drops files into `data/reports/<bucket>/YYYY-MM-DD-<category>.md` at 5:30 AM
KL. On Linux servers the equivalent cron should write to the same path
structure inside the bind-mounted `./data` directory.

- New file → API surface reflects it within ~1 sec.
- The `TodayPane` client component (route `/today`) auto-refreshes every
  60 sec.

## 5. Backups

```cron
# /etc/cron.d/taskpulse-backup — daily 03:30 UTC
30 3 * * * root docker compose -f /path/to/taskpulse/docker-compose.yml exec -T taskpulse /bin/sh /app/scripts/backup-sqlite.sh
```

Retention: 7 daily + 4 weekly.

### Restoring from backup

```sh
docker compose stop taskpulse
cp ./backups/taskpulse-2026-05-18T03-30-00Z.bak ./data/taskpulse.db
docker run --rm -v $(pwd)/data:/data alpine sh -c \
  "apk add --no-cache sqlite > /dev/null && sqlite3 /data/taskpulse.db 'PRAGMA integrity_check;'"
docker compose start taskpulse
```

## 6. Smoke test checklist

- [ ] `curl https://taskpulse.example.com/api/health` → `{ ok: true, ts }`
- [ ] Sign in via web UI; confirm board renders
- [ ] Drag a card; confirm reorder persists across reload
- [ ] Open `/today` — confirm the 4 buckets render with today's date
- [ ] Drop a fake `2026-XX-XX-test.md` into `data/reports/stocks/`;
      `/today` picks it up within 5 sec
- [ ] `curl -i -H "Authorization: Bearer bogus" https://.../api/auth/me`
      → 401 (proves algo pin + tokenVersion)
- [ ] 6th login from same IP within 15 min → 429

## 7. Upgrades

```sh
git pull
docker compose --env-file .env.production up -d --build
docker compose exec taskpulse npx prisma db push --schema=./prisma/schema.prisma
```

Graceful SIGTERM shutdown drains in-flight requests.

## 8. Common gotchas

- **Prisma "Datasource URL" trap**: `DATABASE_URL=file:./data/taskpulse.db`
  in `.env` resolves relative to the **schema file**, not the cwd. In the
  Docker image we use an absolute path (`file:/app/data/taskpulse.db`) to
  avoid this. Don't change the compose env unless you've thought it through.
- **CSP errors in browser console**: tighten or relax CSP in
  `server/src/index.ts`. Tailwind requires `'unsafe-inline'` in `styleSrc`.
- **CLIENT_ORIGIN in prod**: required for browsers loading from a different
  origin than the API. With Caddy fronting both, same-origin is automatic.
- **WebSocket idles**: Caddy keeps WS open; nginx defaults to 60s — add
  `proxy_read_timeout 3600s;` to the `/ws` location block if you use nginx.
