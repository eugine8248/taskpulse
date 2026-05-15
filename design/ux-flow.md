# UX Flow — taskpulse v0.1.0

## Boot flow

```
http://localhost:5173
     |
     v
GET /api/auth/status
     |
     +-- {hasUsers:false, noAuth:false} --> /setup   (one-time admin creation)
     |
     +-- {hasUsers:true,  noAuth:false, token:null} --> /login
     |
     +-- {hasUsers:true,  noAuth:false, token:ok}   --> /  (board)
     |
     +-- {noAuth:true}                              --> /  (auto-creates local user)
```

## Routes

| Path              | Page             | Notes                                                    |
|-------------------|------------------|----------------------------------------------------------|
| `/setup`          | `SetupPage`      | Only reachable if `hasUsers === false`.                  |
| `/login`          | `LoginPage`      | Only reachable if `hasUsers === true && !token`.         |
| `/`               | `BoardPage`      | Default board with 5 columns and drag-drop.              |
| `/reports`        | `ReportsPage`    | List + detail of seeded markdown reports.                |
| `/settings`       | `SettingsPage`   | Theme, board defaults, sign out.                         |
| `*`               | `<Navigate to="/" />` | Catch-all.                                          |

## Board interactions

1. **Add card** — click `+ Add card` at column bottom → inline textarea appears, focused. Enter creates the card with `priority='medium'`. Esc cancels.
2. **Open card detail** — click a card body (not the drag handle area). Side panel slides in from the right (`translate-x-full → translate-x-0`, 200 ms). On `<sm:` (640 px), panel becomes a bottom sheet covering the lower 80% of the viewport with rounded top corners.
3. **Edit field** — inline within the detail panel; debounce 600 ms then PATCH.
4. **Delete card** — red "Delete card" button at bottom of detail panel → confirm prompt → DELETE then close panel.
5. **Drag card** — pointer down on card → ghost follows; drop over another column or between cards in same column → optimistic update, then PATCH `/api/cards/:id/move`. Failure rolls back via TanStack Query refetch.
6. **Rename column** — double-click column title → input field appears → blur or Enter saves.
7. **Set WIP limit** — click `n/limit` badge in column header → input field appears with current limit (empty = none) → save persists to `Column.wipLimit`.
8. **Filter bar** — sticky just below TopBar:
   - Search input (`text-base sm:text-sm`)
   - Priority chips: Low · Med · High · Urgent — click to toggle
   - Label dropdown: multi-select
   - Clear-all button when any filter is active.

## Reports interactions

1. **Land on `/reports`** → fetch `/api/reports`. Auto-select all projects and all categories, no date range. Render list of all 4 seed reports.
2. **Toggle project / category / date** → list filters client-side (server returns all).
3. **Click a report row** → fetch parsed report; right pane (or full pane on mobile) shows H1 + each H2 as a collapsible card.
4. **Copy section** → per-section copy button copies that section's body to clipboard.
5. **Bar chart** at top of list → reactive to active filters, sums critical/important/minor across visible reports.

## Settings interactions

1. **Theme toggle** — radio (dark / light). Saves to `localStorage.taskpulse.theme` + applies `<html class="dark">` immediately.
2. **Default board name** — text input → Save Settings persists to `AppSetting('board_name')` and renames the existing board if any.
3. **Default WIP limits** — 5 numeric inputs (one per default column name) → Save persists per-column `wipLimit`.
4. **Sign out** → clears `localStorage.taskpulse.token` and navigates to `/login`.

## Mobile-first considerations (the bug-list)

| Constraint                         | Implementation                                                       |
|-----------------------------------|----------------------------------------------------------------------|
| TopBar no overflow at 320 px      | `gap-1 sm:gap-3 md:gap-4`, `px-3 sm:px-6 lg:px-8`, `shrink-0` on icon group, brand text `hidden xs:inline` |
| Touch targets ≥ 44×44 px          | All icon buttons: `min-h-11 min-w-11 inline-flex items-center justify-center` |
| Input font ≥ 16 px on mobile      | `text-base sm:text-sm` on every `<input>` and `<textarea>`           |
| Safe-area-aware                   | `viewport-fit=cover` in `index.html`; TopBar uses `pt-[env(safe-area-inset-top)]` |
| Card detail panel on mobile       | Bottom sheet 80vh; uses `pb-[env(safe-area-inset-bottom)]` for the close button row |
| Filter bar on mobile              | Horizontal scroll for priority chips; search input full-width        |
| Kanban board on mobile            | Horizontal scroll between columns (`overflow-x-auto`), each column `min-w-[280px]` |
