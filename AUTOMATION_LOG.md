# taskpulse — Automation Log

A chronological record of multi-phase Claude agent runs that have shaped
this repo. Newest first.

---

## 2026-05-18 — v2.5 + v2.6 (GitHub integration + embedded callgraph)

**Goal:** Land a full GitHub-integration phase (PAT storage, repo binding,
auto-sync, paste-URL flow, CLI subcommands, webhook) and an embedded
callmap engine for inline callgraphs on PR cards.

**Outcome:** v2.5.0 shipped end-to-end and verified live:

- PAT round-trip: bogus → 401; real → 200 with login + scopes
- Status endpoint returns live rate-limit (4986/5000 at test time)
- Link `framedeck` board → `sindresorhus/p-queue` imported 3 PRs + 2 issues
- Paste-URL `pull/245` → new card #65 in the GitHub column
- Webhook valid HMAC → 200, invalid → 401, missing secret → 404
- `tp gh status / sync / link / add` work end-to-end

v2.6.0 ships the lazy-loaded `CardCallgraphPanel` chunk with a stubbed
engine entry point. The vendoring + grammar copy ran via
`scripts/sync-callmap-engine.ps1`. Initial chunk stays at 209 KB gz (limit
350 KB). Callgraph chunk is 1.29 KB gz placeholder + per-grammar lazy
import.

**Highlights:**

- Zero new server-side runtime deps. GitHub client is hand-rolled with
  exp-backoff + rate-limit awareness.
- AES-256-GCM for PAT at rest; key from `PAT_ENCRYPTION_KEY` (required in
  prod) with a SHA-256(JWT_SECRET) dev fallback.
- Webhook mounted BEFORE `authMiddleware` AND BEFORE the JSON parser
  (uses `express.raw` so HMAC sees the raw body).
- Composite unique `(columnId, githubUrl)` on Card means repeated syncs
  upsert cleanly.

**Verification commands** (reproducible):

```
gh auth token  # used as the test PAT
node scripts/create-or-reset-account.mjs eugine8248@gmail.com testpw1234567890 'Eugin'
node server/dist/index.js  # from server/ so .env is read
# Then POST /api/auth/login, /api/github/pat, /api/boards/6/github/link, /api/webhooks/github
```

**Files produced:** V25_REPORT.md, V26_REPORT.md, server/src/lib/{encryption,github,github-url}.ts,
server/src/routes/github.ts, server/src/services/githubSync.ts,
client/src/components/board/CardCallgraphPanel.tsx,
client/src/lib/callmap-engine/*, scripts/sync-callmap-engine.ps1.

---

## 2026-05-18 — v2.0 chain (5 phases collapsed to 3 commits)

**Goal:** Land schema additions for pin/comments/activity/time/attachments/views/templates,
plus FTS5 search, then ship a `tp` CLI and a PWA shell.

**Outcome:** All 5 phases shipped. Three commits on `origin/main`:

- `v2.0.0 + v2.1.0 + v2.2.0` — schema + data-model API + web UI (combined
  because schema/route/event hooks are tightly woven)
- `v2.3.0` — `tp` CLI (Commander + chalk + cli-table3 + chrono-node)
- `v2.4.0` — PWA shell (vite-plugin-pwa, manifest, sw.js, icons)

**Highlights:**
- Pin cap enforced atomically in a Prisma transaction; 409 + typed error
  in CLI and inline banner in web UI
- FTS5 contentless virtual table rebuilt idempotently on boot, upserted on
  every Card/CardComment mutation
- Time tracking transactionally stops the previous open entry when starting
  a new one — no race window where two entries could be open
- CLI ships full command set + `--json` / `--quiet` / `NO_COLOR` support
- PWA precache 11 entries (731 KB), runtime-cache `/api/reports/today`
  network-first 60s

**Bootstrap snag:** Earlier session's leftover taskpulse server processes
(PIDs 24100 + 34764) had the prisma query-engine DLL locked, blocking
`prisma generate`. Identified via `Get-Process | foreach { Modules }`,
killed, generate succeeded. Now logged here so future sessions know to look
at running node processes before retrying schema operations.

**Schema apply path subtlety:** `DATABASE_URL=file:./data/taskpulse.db`
from repo root vs from `prisma/schema.prisma` resolve to different files
(Prisma resolves relative to the schema file). The first push landed in
`prisma/data/taskpulse.db` (wrong), then was redirected via an absolute
path. Final `.env` uses `file:../data/taskpulse.db` so a push from repo
root or from `server/` both target the same canonical file.

**Files produced:** see V2_REPORT.md for the full index.

**Verification:** `tsc --noEmit` clean across all 3 sub-projects; full
CLI e2e flow ran successfully against a local server (board → add → pin →
focus → comment → time → done → log → report).
