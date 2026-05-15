# taskpulse — Architecture

**Date:** 2026-05-15
**Approval Mode:** Auto
**Phases:** Discovery → Design → Build → QA → Deploy
**Version:** v0.1.0

## Project overview

Kanban board for software project management. Two routes that matter:
`/` (the kanban board) and `/reports` (markdown audit reports surfaced from
sibling Claude Code projects). Single-user local-first, same npm-workspaces
shape as the stockpulse reference repo.

## Tech stack

| Layer    | Tools                                                                 |
|----------|-----------------------------------------------------------------------|
| Client   | React 18 · Vite 5 · TypeScript · Tailwind 3.4 (class-based dark mode) · react-router 6 · Zustand 5 · TanStack Query 5 · Recharts 2 · lucide-react · @dnd-kit (core + sortable + utilities) |
| Server   | Express 4 · TypeScript · Prisma 5 · SQLite · ws@8 · bcryptjs · jsonwebtoken · zod · helmet · cors · morgan |
| Build    | npm workspaces (`client/`, `server/`) · multi-stage Dockerfile · GitHub Actions `build.yml` + `release.yml` |

## UX flow + component map

See `design/ux-flow.md` and `design/component-map.md`.

## API endpoints

See README "API surface" section. All endpoints under `/api/*` (except
`/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/health`)
require a JWT via `Authorization: Bearer …` or the `NO_AUTH=true` dev bypass.

## DB schema

See `prisma/schema.prisma`. Models: `User`, `Board`, `Column`, `Card`,
`Label`, `CardLabel` (join), `AppSetting`. SQLite via Prisma 5.

## Build verification

| Check                            | Result |
|----------------------------------|--------|
| `npm install --workspaces`       | OK    (422 packages)         |
| `npx prisma migrate dev --name init` | OK (SQLite + migration applied) |
| `npm run build`                  | OK    (client 678 KB JS / 17.5 KB CSS · server tsc clean) |
| `node server/dist/index.js` boot | OK    (200 on `/api/health`)                              |
| `POST /api/auth/setup`           | 200 + token returned                                       |
| `GET /api/boards` (post-setup)   | 200 + default board with 5 columns auto-provisioned        |
| Card CRUD lifecycle smoke        | create → patch → move → label attach → column wipLimit → delete — all OK |
| `GET /api/reports`               | 200 + 4 seed reports listed                                 |
| `GET /api/reports/:p/:d/:c`      | 200 + parsed sections + headline counts                     |
| `NO_AUTH=true` in dev            | 401 bypassed, auto-creates `local@taskpulse.local` user     |
| `NO_AUTH=true NODE_ENV=production` | Auth STILL enforced; console warning emitted              |
| Production-mode static serve     | 200 on `/` returns built `index.html`                       |

## Bug-pre-emption — stockpulse v0.2.1 lessons baked in

| Lesson                                   | Implementation                                       |
|------------------------------------------|------------------------------------------------------|
| TopBar 320 px overflow                   | `gap-1 sm:gap-3 md:gap-4`, `px-3 sm:px-6 lg:px-8`, `shrink-0` on brand + status, `hidden md:inline` on secondary text |
| Touch targets ≥ 44 px                    | `min-h-11 min-w-11` on every interactive icon (TopBar, CardDetail close, filter chips, add-card, etc.) |
| Input font ≥ 16 px on mobile             | `text-base sm:text-sm` on every input / textarea     |
| viewport-fit=cover + safe-area           | Added to `client/index.html`; `safe-pt` / `safe-pb` classes in `index.css`; applied to TopBar + CardDetailPanel |
| Async handler try/catch + clean status   | Every Express handler wrapped; global error middleware as backstop; `process.on('unhandledRejection')` logs |
| NO_AUTH production guard                 | `noAuthActive()` returns false when `NODE_ENV=production`; warning logged once |
| README.md + .env.example                 | Both present at repo root                            |

## Outstanding (not v0.1 blockers)

- Within-column reorder via drag persists by appending to end-of-column
  rather than computing midpoint between siblings. dnd-kit animates
  correctly during the drag; the post-drop order is end-of-column. A v0.2
  improvement is to compute mid-order between neighbors on drop.
- `report.md` UI-Layout-flavored files render with all-zero counts because
  the UI Layout PM uses F/R/S finding codes not Critical/Important/Minor.
  The parser is documented as "tolerant" — empty counts don't break the
  render path.
- Client bundle is 678 KB (recharts is the largest contributor). No
  splitting in v0.1; consider lazy-loading the Reports route in v0.2.

## Phase log

- 2026-05-15 — Requirements + Design (Discovery, Design phases) merged into the brief
- 2026-05-15 — DB schema + Prisma migrate (Build phase: database)
- 2026-05-15 — Server routes + WS hub + report parser (Build phase: backend)
- 2026-05-15 — Client routes + DnD kanban + reports UI (Build phase: frontend)
- 2026-05-15 — Build green, curl smoke green (QA phase — inline)
- 2026-05-15 — Local git tag v0.1.0 (Deploy phase — local-only; master pushes to GitHub)
