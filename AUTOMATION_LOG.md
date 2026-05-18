# taskpulse — Automation Log

A chronological record of multi-phase Claude agent runs that have shaped
this repo. Newest first.

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
