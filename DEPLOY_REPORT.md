# Taskpulse Deploy Hardening Report — 2026-05-18

Hardening sweep + auto-update wiring + production deploy prep landed in three
commits.

## Deliverable A — Auto-update from daily cron reports

**Added**
- `server/src/services/reportWatcher.ts` — chokidar watcher on
  `data/reports/` recursive (depth=2). Per-bucket cache so `/api/reports/today`
  is O(1) instead of doing a full fs scan on every request. Emits
  `report:added`, `report:changed`, `report:removed` events on a process-local
  `reportEvents` EventEmitter (hook for future SSE/WS push).
- `server/src/routes/reports.ts` — new endpoint `GET /api/reports/today`
  returns the most-recent report per known bucket (`stocks`, `tech-radar`,
  `dev-gig`, `morning`) keyed by bucket name. Includes a 600-char preview
  and the parsed counts so the TodayPane can render without a second
  round-trip. `REPORTS_DIR` is now exported so `index.ts` can pass it to the
  watcher.
- `client/src/components/TodayPane.tsx` — new component rendering the four
  buckets as a responsive grid. Auto-refreshes every 60 sec via react-query
  (`refetchInterval: 60_000`). Each card links to the dedicated detail page
  at `/reports/<bucket>/<date>/<category>`.
- `client/src/App.tsx` — new `/today` route mounted.
- `client/src/components/TopBar.tsx` — Sunrise icon link to `/today` between
  Projects and Reports.

**Already in place**
- `server/src/routes/reports.ts` reads `data/reports/<project>/...` and
  parses via `services/reportParser.ts`. No changes needed there beyond the
  new endpoint.
- Filename convention `YYYY-MM-DD-<category>.md` was already supported.

**New deps**
- `chokidar@4.x`

## Deliverable B — Security hardening

| Item | Status | Notes |
|---|---|---|
| 1. JWT algo pin + tokenVersion | Done | `verifyTokenSafe` is now async, pins `algorithms: ['HS256']`, looks up `User.tokenVersion` via a 30-second cache, rejects on version mismatch. `signToken(userId, tv)` embeds version. `bumpTokenVersion(userId)` exported and wired to new `POST /api/auth/logout-everywhere`. WS hub updated to `await verifyTokenSafe(...)`. |
| 2. Rate limits on auth | Done | `loginLimiter` 5 / 15min, `registerLimiter` 3 / 1hr, `forgotPasswordLimiter` 3 / 1hr exported from `lib/rateLimit.ts`. Applied to `/api/auth/login` + `/api/auth/setup`. Forgot-password route doesn't exist yet — limiter is ready for when it lands. |
| 3. Helmet hardening | Done | CSP enabled with directives appropriate for Vite + Tailwind + lucide. `referrerPolicy: 'strict-origin-when-cross-origin'`, `hsts` enabled, `crossOriginEmbedderPolicy: false`. |
| 4. Zod on every body route | Done — already universal | `auth`, `boards`, `cards`, `columns`, `labels`, `settings` were already using Zod safeParse. Verified each. Reports + admin are GET-only. |
| 5. Env validation on boot | Done | `lib/envValidation.ts` fails fast in prod when `JWT_SECRET` is missing / <32 chars / a known dev default, or `DATABASE_URL` is missing. Also warns when `NO_AUTH=true` is set in prod (the middleware already refuses to honour it, but the warning is louder). |
| 6. Audit log | Done | New `AuditLog` Prisma model (applied via `db push`). `lib/auditLog.ts` fire-and-forget writer. `/login` (success + failure), `/setup` (register), `/logout-everywhere` all emit events. New `/api/admin/audit-log` owner-only (user id 1) endpoint. |
| 7. Secure cookies in prod | N/A | Taskpulse uses Bearer-token auth exclusively — no `res.cookie(...)` call sites. |
| 8. Health endpoint with DB ping | Done | `/api/health` runs `SELECT 1` and returns 503 on failure. |
| 9. Graceful shutdown | Done | SIGTERM + SIGINT handlers close the HTTP server, stop the report watcher, disconnect Prisma. 1.5s grace for in-flight requests. |

**Already in place (carried forward, no duplication)**
- `NO_AUTH` was already gated behind `NODE_ENV !== 'production'` from a
  prior commit (carried over from the stockpulse v0.2 incident). Verified.
- `unhandledRejection` global handler was already present. Kept.
- Global express error handler middleware was already present. Kept.

**DB schema additions**
- `User.tokenVersion Int @default(0)`
- `User.auditLogs AuditLog[]` (back-relation)
- `AuditLog` model + three indexes (userId, action, createdAt)

**New / extended endpoints**
- `POST /api/auth/logout-everywhere`
- `GET /api/admin/audit-log` (owner-only)
- `GET /api/reports/today`

**New deps**
- `express-rate-limit@8.x`

## Deliverable C — Production deploy prep

**Added / rewritten**
- `Dockerfile` — multi-stage with `tini` PID-1, `apk add sqlite` for in-image
  backups, `npm prune --omit=dev`, in-image `HEALTHCHECK` via wget on
  `/api/health`, separate `/app/backups` volume.
- `docker-compose.yml` — port mapping now `3001:3000`. Full env block with
  `JWT_SECRET:?` (compose refuses to start without it), `CLIENT_ORIGIN`,
  `REPORTS_DIR=/app/data/reports`, `NO_AUTH=false`. In-compose healthcheck.
- `scripts/backup-sqlite.sh` — atomic `sqlite3 .backup` + 7-daily-4-weekly
  rotation. Lives alongside the existing `scripts/pull-morning-reports.ps1`.
- `.env.production.example` — env template with required / recommended /
  optional sectioning.
- `DEPLOY.md` — server requirements, Caddyfile, first-deploy sequence,
  watcher mount setup, backup/restore, smoke test checklist, upgrade path,
  Prisma file-URL trap warning.

## Verification matrix

| Test | Result |
|---|---|
| `tsc --noEmit` (server) | clean |
| `tsc --noEmit` (client) | clean |
| `npm run build` (server) | clean |
| `npm run build` (client) | clean — `dist/index.html` + `dist/assets/` produced |
| Boot in dev with NO_AUTH=true | clean; watcher attaches recursive depth=2 |
| `GET /api/health` | `{ ok: true, ts }` |
| `GET /api/reports/today` | all 4 buckets populated with 2026-05-18 dates |
| `GET /api/reports/today` after writing `stocks/2026-05-19-test-watcher.md` | stocks bucket switches to 2026-05-19 within 4 sec |
| `GET /api/reports/today` after `rm` of test file | stocks bucket reverts to 2026-05-18 next call |
| `prisma db push` after schema change | clean — User.tokenVersion + AuditLog created |
| Bogus body on `/api/auth/setup` (after first user exists) | 409 (setup-already-complete short-circuit fires before Zod). Verified Zod path on a clean DB hits 400 with parsed.error. |
| `docker compose build` | not run on this host (no docker locally) |

## Known gaps

- **docker compose build not exercised** locally (Windows dev box, no
  Docker installed). The Dockerfile is a tightened version of the prior
  shipping one + tini + npm prune + healthcheck.
- **SSE / WebSocket push for report events not wired.** Hook is in place
  (`reportEvents` EventEmitter) but the TodayPane still uses 60s polling.
  Wiring SSE is a follow-up.
- **Email-keyed login throttling not implemented** — only IP-keyed
  (the brief allowed deferring the email share).

## Bundle delta

- Server `node_modules` (post `npm prune --omit=dev`): +148 KB for chokidar
  + +14 KB for express-rate-limit = +162 KB raw.
- Client: +~3 KB for the TodayPane component + a new Sunrise icon import.
