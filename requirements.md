# taskpulse — Requirements (v0.1.0)

**One-liner:** Kanban board for software project management with built-in viewing of agent-generated audit reports.

**Audience:** Single-user local-first developer using Claude Code multi-agent system. Same `*-pulse` family as `stockpulse`.

---

## Functional scope (v0.1.0)

### 1. Auth (minimal, single-user)
- First-launch `/setup` flow creates the admin user.
- After setup, `/login` page used for subsequent access.
- Optional `NO_AUTH=true` env bypass (only honored when `NODE_ENV !== 'production'` — avoid stockpulse's production-bypass foot-gun).
- JWT stored in `localStorage` under key `taskpulse.token` (acknowledged XSS trade-off — same as stockpulse).
- `authMiddleware` applied to all `/api/*` except `/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/health`.

### 2. Kanban board (core feature)
- Single default board for v0.1 (multi-board deferred to v0.2).
- 5 default columns, user-renameable: **Backlog · Todo · In Progress · Review · Done**.
- Card fields:
  - `title` (required, inline-editable)
  - `description` (markdown-OK, rendered as preformatted text — no react-markdown dep)
  - `priority` (`low` | `medium` | `high` | `urgent`)
  - `labels` (string array, color-coded — color derived deterministically from label name hash)
  - `dueDate` (optional ISO date)
  - `order` (Float for drag-sort within column)
- **Drag-drop:** cards across columns AND reorder within a column, via `@dnd-kit/sortable`. Pattern: clone framedeck's `KanbanView.tsx` approach. Optimistic UI; PATCH to server on `onDragEnd`.
- **WIP limits** per column: settable, displayed as `n/limit` in column header, soft-warn turns header orange when `count > limit`. `limit = null` means no limit.
- **Filter bar** (top of board):
  - Free-text search across `title + description`
  - Multi-select labels filter
  - Priority filter chips (toggleable)
- **Card detail side panel:** click card opens right-side sliding panel (NOT screen-eating modal). On `<sm:` (mobile) it becomes a bottom sheet covering the lower 80% of the viewport. Edit all fields inline. Delete with a confirm prompt.
- **Add card:** `+` button at the bottom of each column. Inline input that creates the card on enter / blur, with `priority='medium'` defaults.
- **Realtime:** WebSocket `/ws` broadcasts card mutations to other tabs of the same user (multi-tab same-user sync). No cross-user collab in v0.1.

### 3. Reports feature (the user's specific ask)

**Architecture (chosen: Option B from brief — repo-local seed data).**

- File layout: `data/reports/<project>/<YYYY-MM-DD>-<category>.md`.
- Seed with 4 verbatim copies of real reports from sibling repos:
  - `data/reports/stockpulse/2026-05-15-code-quality.md` — from `stockpulse/.agent-context/code-quality/report.md`
  - `data/reports/stockpulse/2026-05-15-ui-layout.md`    — from `stockpulse/.agent-context/ui-layout/report.md`
  - `data/reports/stockpulse/2026-05-15-qa.md`           — from `stockpulse/.agent-context/qa/report.md`
  - `data/reports/framedeck/2026-05-14-code-quality.md`  — from `framedeck/.agent-context/code-quality/report.md`
- Server endpoint surface:
  - `GET /api/reports`                                    — list `{project, date, category, headlineCounts}` across all reports
  - `GET /api/reports/:project/:date/:category`           — parsed report `{markdown, sections, counts}`
  - `GET /api/reports/:project/:date/:category/raw`       — raw markdown (text/markdown)
- Server-side parser (`server/src/services/reportParser.ts`): generic — recognizes H2 sections, extracts counts of **Critical / Important / Minor** findings via regex over the bullet list bodies. Returns:
  ```ts
  interface ParsedReport {
    project: string;
    date: string;          // ISO YYYY-MM-DD
    category: string;      // 'code-quality' | 'ui-layout' | 'qa'
    title: string;         // H1
    sections: { heading: string; body: string }[];
    counts: { critical: number; important: number; minor: number };
    rawMarkdown: string;
  }
  ```
- **UI for `/reports` page:**
  - Left rail (collapses to top sheet on `<md:`):
    - Project picker (Stockpulse, Framedeck) — multi-select
    - Category filter (Code Quality, UI Layout, QA) — multi-select
    - Date range picker (from / to, ISO dates)
  - Main list pane: shows matching reports with `date · project · category` and headline pill: `C: n · I: n · M: n`. Click → opens the full report on the right (or full-width on `<md:`).
  - Small Recharts bar chart at top of list: sum of `critical / important / minor` findings across currently-filtered reports.
  - Report detail view: rendered as `<pre>` for the raw markdown (no react-markdown dep — preformatted). Each H2 section rendered as a collapsible card with copy-section button.

### 4. Settings page
- Theme toggle (light / dark — same Zustand + Tailwind `darkMode: 'class'` pattern as stockpulse)
- Default board name (editable, persisted to `AppSetting` table)
- Default WIP limits per column (numeric inputs for 5 columns)
- Sign out button

---

## Non-functional requirements

- **Touch targets** — every interactive control 44×44 px minimum (`min-h-11 min-w-11`). This is a v0.1.0 acceptance gate — stockpulse missed it.
- **TopBar mobile fit** — at 320 px no horizontal overflow. Use `gap-1 sm:gap-3 md:gap-4`, `shrink-0` on icon clusters, `hidden md:inline` on secondary text. Acceptance: `scrollWidth === clientWidth === 320` on `/`, `/reports`, `/settings`.
- **Input font ≥ 16 px on mobile** — all `<input>` elements use `text-base` by default, `text-sm` only at `sm:` and above. Prevents iOS Safari focus-zoom.
- **Safe-area-aware** — `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />` plus `env(safe-area-inset-*)` on TopBar and any fixed positions.
- **Async route error handling** — every Express async handler wrapped in try/catch returning a clean status code + `{success:false, error:'...'}` envelope. No unhandled rejections (this killed stockpulse's server on Yahoo 401).
- **Release-blocking artifacts** — `README.md` and `.env.example` MUST exist at repo root before tagging. Without these the release.yml tar step fails.

## Tech stack

- **Client:** React 18 + Vite 5 + TypeScript + Tailwind 3.4 (`darkMode: 'class'`) + react-router 6 + Zustand 5 + TanStack Query 5 + Recharts 2 + lucide-react + `@dnd-kit/core` + `@dnd-kit/sortable`.
- **Server:** Express 4 + TypeScript + Prisma 5 + SQLite + `ws@8` + bcryptjs + jsonwebtoken + zod.
- **Build:** npm-workspaces monorepo, multi-stage Dockerfile, GitHub Actions for build + release.
- **Tests:** none for v0.1 (mirrors stockpulse).

## Data model (preview — Database Engineer to formalize)

- `User` — id, email, passwordHash, name, createdAt
- `Board` — id, userId, name, createdAt
- `Column` — id, boardId, name, order, wipLimit (nullable)
- `Card` — id, columnId, title, description, priority, dueDate, order, createdAt, updatedAt
- `Label` — id, userId, name (color derived deterministically client-side)
- `CardLabel` — cardId, labelId (composite PK)
- `AppSetting` — key, value

## API surface (preview — Backend to formalize)

- `GET    /api/auth/status`
- `POST   /api/auth/setup`
- `POST   /api/auth/login`
- `GET    /api/auth/me`
- `GET    /api/boards`                     → default board with nested columns
- `PATCH  /api/boards/:id`                 → rename
- `PATCH  /api/columns/:id`                → rename + wipLimit
- `POST   /api/cards`                      → { columnId, title }
- `PATCH  /api/cards/:id`                  → partial update
- `DELETE /api/cards/:id`
- `POST   /api/cards/:id/move`             → { toColumnId, toOrder }
- `GET    /api/labels`                     → user's labels
- `POST   /api/labels`                     → { name }
- `DELETE /api/labels/:id`
- `POST   /api/cards/:id/labels`           → { labelId }
- `DELETE /api/cards/:id/labels/:labelId`
- `GET    /api/settings`
- `PUT    /api/settings`
- `GET    /api/reports`
- `GET    /api/reports/:project/:date/:category`
- `GET    /api/reports/:project/:date/:category/raw`
- `GET    /api/health`

## Acceptance criteria for v0.1.0

1. Fresh clone → `npm install` → `npm run prisma:dev` → `npm run dev` boots client + server without errors.
2. Visiting `/` on a fresh DB redirects to `/setup`; creating the admin user logs you in and shows the default board with 5 empty columns.
3. Adding a card via the `+` button persists across reload.
4. Dragging a card across columns updates the column on reload.
5. Visiting `/reports` shows 4 seeded reports; clicking one renders its markdown; the bar chart sums findings across the visible set.
6. Theme toggle persists across reload.
7. `NO_AUTH=true` in dev bypasses login; `NO_AUTH=true` in `NODE_ENV=production` does NOT (logged warning, still requires auth).
8. At 320 px width: no horizontal overflow on `/`, `/reports`, `/settings`.
9. `npm run build` succeeds end-to-end. `README.md` and `.env.example` present at repo root.
