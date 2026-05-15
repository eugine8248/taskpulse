# taskpulse

Kanban board for software project management with built-in viewing of
agent-generated audit reports.

A single-tenant local app — runs on your laptop or a home server. Tracks tasks
across five columns with drag-drop, optional WIP limits, label colors, and
priorities. Built primarily to surface markdown reports produced by Claude
Code's multi-agent system (`code-quality`, `ui-layout`, `qa`) so you can
read them next to the work that triggered them.

## Features

- **Kanban board** — five default columns (Backlog, Todo, In Progress, Review,
  Done), all user-renameable. Drag cards across columns or reorder within a
  column via `@dnd-kit/sortable`. Optimistic UI, server persists on drop.
- **Card detail panel** — sliding right-side panel on desktop, bottom-sheet on
  mobile (`<sm:`). Inline-edit title, description (markdown plain-text),
  priority, due date, and labels. Debounced PATCH on every change.
- **WIP limits** — per-column. Empty means no limit. When `count > limit` the
  column header turns orange as a soft warning.
- **Filter bar** — free-text search across `title + description`, priority
  chips, and multi-select label filter.
- **Labels** — color-coded by deterministic hash, so the same label name
  always renders the same color without persisting palette state in the DB.
- **Realtime (multi-tab)** — WebSocket hub at `/ws` broadcasts card mutations
  to other tabs of the same user. No cross-user collab in v0.1.
- **Reports page** — `/reports` reads markdown files from
  `data/reports/<project>/<YYYY-MM-DD>-<category>.md` and renders them as
  collapsible H2 sections with copy-section buttons. A Recharts bar chart
  sums Critical / Important / Minor findings across the active filter set.
  Seeded with 4 verbatim examples from `stockpulse` and `framedeck`.

## Stack

- **Client** — React 18 · Vite 5 · TypeScript · Tailwind 3.4 (`darkMode:
  'class'`) · react-router 6 · Zustand 5 · TanStack Query 5 · Recharts 2 ·
  lucide-react · `@dnd-kit/core` + `@dnd-kit/sortable`.
- **Server** — Express 4 · TypeScript · Prisma 5 · **SQLite** · `ws@8` for
  WebSockets · bcryptjs + jsonwebtoken (with optional `NO_AUTH=true` bypass
  that is hard-gated behind `NODE_ENV !== 'production'`).
- **Layout** — npm-workspaces monorepo (`client/`, `server/`) packaged into a
  single multi-stage Docker image.

## Quick start

```bash
# 1. Install workspaces + generate Prisma client + run migrations
npm install --include-workspace-root --workspaces
npm run prisma:dev    # creates the SQLite DB + applies migrations

# 2. Optional — copy env defaults
cp .env.example .env

# 3. Run client + server together
npm run dev           # Express on :3000, Vite on :5173 (proxies /api and /ws)
```

Open <http://localhost:5173>. On first launch you'll be redirected to
`/setup` to create the admin user (or set `NO_AUTH=true` in `.env` to skip
auth entirely for single-user local use).

## Configuration

All env vars are optional — defaults work for a localhost single-user setup.
See `.env.example` for the full list with comments. The two you're most
likely to touch:

- `NO_AUTH` — set to `true` to bypass login entirely. **Ignored when
  `NODE_ENV=production`** — production always requires auth. This is the
  fix for the foot-gun stockpulse v0.2 shipped.
- `JWT_SECRET` — change for any deployment beyond localhost.

## Build

```bash
npm run build         # tsc -b client + vite build; tsc -p server/tsconfig.json
npm start             # node server/dist/index.js (serves built client static)
```

Production deploy is via the `Dockerfile` (multi-stage) or the
`docker-compose.yml` at the repo root.

## Reports feature — where the files live

```
data/reports/
├── stockpulse/
│   ├── 2026-05-15-code-quality.md
│   ├── 2026-05-15-ui-layout.md
│   └── 2026-05-15-qa.md
└── framedeck/
    └── 2026-05-14-code-quality.md
```

Filename convention: `<YYYY-MM-DD>-<category>.md` where category is one of
`code-quality | ui-layout | qa`. Drop a new file in any project folder; the
server picks it up on the next list request — no DB write needed.

The parser is intentionally tolerant — it recognises H1 + H2 sections and
extracts headline counts of **Critical / Important / Minor** via permissive
regex over the document text. Missing markers return zero rather than
throwing.

Override the directory with `REPORTS_DIR=/path/to/your/reports` if you want
to point at a different location (e.g. mounting a shared `~/.claude/reports`
volume).

## Project layout

```
client/        # Vite + React SPA
  src/
    components/
      board/   # KanbanView, Column, CardItem, CardDetailPanel, FilterBar
      reports/ # FindingsChart
    routes/    # SetupPage, LoginPage, BoardPage, ReportsPage, SettingsPage
    hooks/     # useAuth, useWebSocket
    store/     # Zustand: token, theme, connection status
    api/       # fetch wrapper that unwraps {success,data,error}
server/        # Express + Prisma + WebSocket hub
  src/
    routes/    # auth, boards, columns, cards, labels, settings, reports
    services/  # wsHub, reportParser
    middleware/auth.ts  # JWT + NO_AUTH (guarded behind NODE_ENV !== 'production')
prisma/        # Schema + migrations (SQLite)
data/          # SQLite DB + reports/<project>/<date>-<category>.md (committed reports only)
```

## API surface

```
GET    /api/health
GET    /api/auth/status
POST   /api/auth/setup
POST   /api/auth/login
GET    /api/auth/me
GET    /api/boards                              # default board with nested columns + cards
PATCH  /api/boards/:id                          # rename
PATCH  /api/columns/:id                         # rename + wipLimit
POST   /api/cards
PATCH  /api/cards/:id
DELETE /api/cards/:id
POST   /api/cards/:id/move                      # move (and reorder)
POST   /api/cards/:id/labels                    # attach
DELETE /api/cards/:id/labels/:labelId           # detach
GET    /api/labels
POST   /api/labels
DELETE /api/labels/:id
GET    /api/settings
PUT    /api/settings
GET    /api/reports                             # list w/ headline counts
GET    /api/reports/:project/:date/:category    # parsed report
GET    /api/reports/:project/:date/:category/raw  # raw markdown
WS     /ws                                       # send {type:'auth', token} first
```

## Roadmap (post v0.1)

- **v0.2** — multi-board, board picker, board archive.
- **v0.2** — Reports Option A: scan configured project paths under
  `~/projects/*/.agent-context/{code-quality,ui-layout,qa}/report.md` and
  aggregate — current v0.1 ships repo-local seed data only.
- **v0.2** — Cross-user collab (Yjs / WebSocket OT) for shared boards.
- **v0.2** — Card markdown rendered through a real markdown engine (not
  preformatted), with mention / link autodetection.

## License

Personal project — no license file. All rights reserved. Open an issue if
you'd like to discuss reuse.
