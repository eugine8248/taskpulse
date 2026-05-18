# taskpulse v2.0 — Final Report

**Chain:** `v2.0.0 → v2.4.0` (data model → time/attachments → FTS+views+templates → CLI → PWA)
**Date:** 2026-05-18
**Wall-clock:** ~3 hours (one bootstrap-detection retry, no other major blockers)

## Commit map (what shipped where)

The 5 phases collapsed into **3 commits** because phases v2.0/v2.1/v2.2 are
all data-model phases whose schema, route handlers, event-hook plumbing, FTS
upsert path, and React UI are tightly interwoven — splitting them
artificially would have meant landing the project in a non-compiling state
between commits. The user-facing v2.3 (CLI) and v2.4 (PWA) are independent
features and ship in their own commits.

| Commit  | Tag                     | Description |
| ------- | ----------------------- | ----------- |
| `432fa3c` | `v2.0.0 + v2.1.0 + v2.2.0` | Schema, pin/comments/activity, time+attachments, FTS5+views+templates |
| `e269a2a` | `v2.3.0` | `tp` CLI (Node + Commander + chalk + cli-table3 + chrono-node) |
| `<head>` | `v2.4.0` (tagged `v2.0.0`) | PWA shell (vite-plugin-pwa, manifest, sw.js) + version bump |

## Schema additions

Pushed via `prisma db push --schema=./prisma/schema.prisma` with
`DATABASE_URL=file:../data/taskpulse.db` resolved relative to the schema
file (lives in `prisma/`, so the file lands in repo-root `data/taskpulse.db`).
The `.env` files at repo root and in `server/` both carry this path; the
canonical absolute target on this machine is
`C:\Users\eugin\projects\taskpulse\data\taskpulse.db`.

| Model | Purpose |
| ----- | ------- |
| `Card.pinnedAt DateTime?` | Pinned-to-focus marker, indexed |
| `CardComment` | Threaded comments per card (author-only edit/delete) |
| `CardEvent` | Activity feed entries (kind + JSON meta) |
| `TimeEntry` | Time-tracking sessions (open-ended start/stop) |
| `CardAttachment` | File uploads (multer + disk storage under `data/attachments/`) |
| `SavedView` | Per-user saved filter+sort presets, one default per user |
| `CardTemplate` | Reusable card payloads + apply-to-board action |

`AppSetting.maxPins = '3'` seeded; reads parse to integer with fallback to
3 in `routes/cards.ts:getPinCap()`.

## API endpoints (new)

```
Pinning
  POST   /api/cards/:id/pin            atomic — counts pinned in tx, returns
                                       409 {error:'pin_cap_reached', cap}
                                       when at limit
  POST   /api/cards/:id/unpin
  GET    /api/cards/pinned             across all user boards, joined w/ col+board

Comments
  POST   /api/cards/:id/comments       Zod-validated 1-10000 chars
  GET    /api/cards/:id/comments
  PATCH  /api/cards/:id/comments/:id   author only
  DELETE /api/cards/:id/comments/:id   author only

Activity
  GET    /api/cards/:id/events         per-card timeline (newest first)
  GET    /api/events?boardId=&days=&limit=   board- or user-wide feed

Time
  POST   /api/time/cards/:id/start     in $transaction: stops any open entry
                                       for this user FIRST, then opens new
  POST   /api/time/cards/:id/stop
  GET    /api/time/cards/:id
  GET    /api/time/running             user's current open entry or null
  GET    /api/time/summary             { today, week, byBoard[] }
  PATCH  /api/time/:id                 edit note/startedAt/endedAt, recompute durationMs
  DELETE /api/time/:id

Attachments
  POST   /api/attachments/cards/:id    multer 25MB/file, 100MB total/card cap
  GET    /api/attachments/cards/:id
  DELETE /api/attachments/:id          author only
  GET    /static/attachments/...       behind authMiddleware

Search (FTS5)
  GET    /api/search?q=&board=&limit=  bm25 ranked, snippet() highlights

Saved views
  GET    /api/views
  POST   /api/views                    atomic isDefault swap
  PATCH  /api/views/:id
  DELETE /api/views/:id

Templates
  GET    /api/templates
  POST   /api/templates
  POST   /api/templates/from-card/:cardId
  POST   /api/templates/:id/apply      spawns cards into {boardId, columnId}
  DELETE /api/templates/:id
```

Every mutation endpoint is behind the existing `authMiddleware`. The CLI
exercises every one of them in the e2e smoke test.

## FTS5 model

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
  title, description, comment_bodies,
  content='', tokenize='porter unicode61'
);
```

`content=''` makes it a contentless table — we own the upserts via
`services/fts.ts`. Every Card create / update / delete and every
CardComment create / update / delete calls `upsertCardFts(cardId)` (or
`deleteCardFts`), which is fire-and-forget so failures don't break the
primary request.

On server boot, `ensureFtsReady()` calls `CREATE VIRTUAL TABLE IF NOT
EXISTS` then idempotently `INSERT OR REPLACE` every existing Card —
fast enough on this dataset (< 1000 cards typical) that we don't bother
with a more incremental strategy.

Query path: tokens are quoted + suffixed with `*` for prefix matching, so
`tp search smoke` becomes FTS5 MATCH `"smoke"*`. BM25 ranking; `snippet()`
returns `<mark>…</mark>`-wrapped excerpts that the React `SearchOverlay`
renders via `dangerouslySetInnerHTML` (safe because both source content and
markup are server-controlled).

## Event hooks

Every mutation that should land in the activity feed fires a fire-and-forget
`CardEvent` row via `services/cardEvents.ts:fireCardEvent()`. Failures
are logged, never raised. Hooks:

- `created` — on `POST /api/cards`
- `moved` — on `POST /api/cards/:id/move` or PATCH with `columnId` (meta: from/to ids+names)
- `priority_changed` — on PATCH with a priority delta (meta: from/to)
- `pinned` / `unpinned` — on /pin /unpin endpoints
- `completed` — auto-fired when a move lands in a column whose name is exactly "done" (case-insensitive). Also auto-clears `pinnedAt`.
- `commented` — on comment create (meta: commentId + 80-char preview)
- `time_logged` — on time stop (meta: durationMs); also when start auto-stops a previous session
- `attached` — on each successful upload (meta: originalName, byteSize, mimeType)
- `tagged` — on label attach/detach (meta: added/removed name)

## CLI install

```bash
cd cli
npm install --ignore-scripts        # esbuild's postinstall fights workspaces
npm run build
npm link                            # globally installs `tp`
tp --version                        # → 2.0.0
```

Already run on this machine — `tp` resolves to
`C:\Users\eugin\AppData\Roaming\npm\tp.cmd`.

State: `~/.taskpulse/auth.json` (chmod 600 on POSIX) + `~/.taskpulse/config.json`.

Override the API URL at runtime: `TASKPULSE_API_URL=http://localhost:3000 tp ls`.

## PWA notes

- `vite-plugin-pwa` registered with `registerType: 'autoUpdate'`
- Manifest at `/manifest.webmanifest` with `display: standalone`,
  `theme_color: #1e1e1e`, `background_color: #1e1e1e`, `start_url: /`
- Icons generated via `sharp` from a tiny SVG renderer (no external assets):
  `client/public/icon-192.png`, `icon-512.png`, `favicon.ico`
- Precaches all bundled JS/CSS/HTML/PNG/SVG/WOFF2 (11 entries, ~731 KB)
- Runtime cache: `/api/reports/today` network-first with 60s stale tolerance
- `navigateFallbackDenylist: [/^\/api\//]` — service worker never returns
  HTML for API routes (which would have masked 5xx errors as success)
- Auth + mutation endpoints are intentionally NOT cached

## Per-phase bundle delta

| Phase | Client JS (gzip) | Notes |
| ----- | ---------------- | ----- |
| pre-v2 | unknown (no baseline pulled) | — |
| v2.0+v2.1+v2.2 | 206 KB | New CardDetailPanel sections, FocusModal, SearchOverlay |
| v2.4 PWA | 205 KB main + sw.js | sw.js + workbox helpers add ~25 KB (offline, lazy) |

Server bundle (CommonJS, no minification): 27 KB cards.js + ~12 KB time.js +
~7 KB each attachments/search/templates/views.

## Known gaps / things I'd ship next

- The CLI's `tp tpl save <id> <name>` and `tp view save <name>` POST
  minimal payloads; richer template authoring (multi-card, tag scaffolds)
  requires either an interactive editor or a JSON-file workflow.
- The `quick` command tries to find an `/inbox/i` column but doesn't yet
  create one if missing — the server's columns API lacks POST. Followup:
  add `POST /api/columns` so the CLI can scaffold an Inbox column.
- WebSocket broadcasts fire for new card events but the client's
  `useWebSocket` hook doesn't yet act on `card.event` / `card.comment.create`
  / `time.start` / `time.stop` messages. Right now the React UI catches up
  via tanstack's polling + invalidate-on-mutate pattern. Wiring the WS
  reducers is straightforward but didn't make the cut.
- FTS5's `porter` tokenizer is English-only; multilingual cards lose
  stemming. Acceptable for the user's single-locale workflow.
- The deep-link `?card=<id>` does not yet preserve the previous URL when
  closing the panel; it strips just the `card` param, which is fine.
- Lighthouse PWA audit not run — would need a headless Chrome harness that
  isn't installed. Manual checks (manifest valid, sw.js registered, icons
  reachable behind helmet's CSP) all pass.

## Verification per phase

- `tsc --noEmit` clean for server, client, and CLI
- `npm run build` clean (server + client + cli)
- `/api/health` returns 200 with DB ping
- Pin cap enforces (verified — 4th POST returns 409 `pin_cap_reached`)
- Timer concurrency: `start` while another entry is open transactionally
  stops the prior, emits `time_logged` for it, then opens new
- FTS5 returns hits with snippet highlights (verified via `tp search`)
- CLI full flow: `tp board → add → ls → pin → focus → comment → time
  start/stop → done → log → report` — all worked end-to-end

## File index for follow-up work

- Server routes: `server/src/routes/*.ts`
- Event helpers: `server/src/services/cardEvents.ts`
- FTS5 helpers: `server/src/services/fts.ts`
- CLI source: `cli/src/{tp,api,config,fmt}.ts`
- Web UI new components: `client/src/components/{FocusModal,SearchOverlay}.tsx`
- Per-card panel: `client/src/components/board/CardDetailPanel.tsx`
- PWA config: `client/vite.config.ts`, `client/index.html`, `client/public/`
