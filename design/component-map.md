# Component Map — taskpulse v0.1.0

## Client tree

```
client/src/
├── main.tsx              # bootstraps React + Router + QueryClient
├── App.tsx               # auth-status routing, theme application
├── index.css             # Tailwind layers + scrollbar + safe-area helpers
├── api/
│   └── client.ts         # fetch wrapper, JWT injection, envelope unwrap
├── store/
│   └── index.ts          # Zustand: token, theme, connectionStatus, broadcast inbox
├── hooks/
│   ├── useAuth.ts        # login/setup/logout against /api/auth/*
│   └── useWebSocket.ts   # connects to /ws, dispatches card-mutation events
├── components/
│   ├── AppLayout.tsx     # TopBar + main + safe-area
│   ├── TopBar.tsx        # logo + nav links + theme toggle + sign out (overflow-safe)
│   ├── board/
│   │   ├── BoardView.tsx        # DndContext + columns + filter bar
│   │   ├── FilterBar.tsx        # search + priority chips + label multi-select
│   │   ├── Column.tsx           # column header (name, count/limit) + SortableContext + add input
│   │   ├── CardItem.tsx         # individual card (sortable wrapper)
│   │   ├── CardDetailPanel.tsx  # sliding side panel / bottom sheet
│   │   └── AddCardInput.tsx     # inline textarea at column bottom
│   └── reports/
│       ├── ReportsList.tsx      # filter rail + list of report rows + chart
│       ├── ReportRow.tsx        # one row: date · project · category + counts pill
│       ├── ReportDetail.tsx     # H1 + collapsible H2 sections
│       └── FindingsChart.tsx    # Recharts bar chart of summed counts
└── routes/
    ├── SetupPage.tsx
    ├── LoginPage.tsx
    ├── BoardPage.tsx     # thin wrapper, fetches /api/boards
    ├── ReportsPage.tsx
    └── SettingsPage.tsx
```

## Server tree

```
server/src/
├── index.ts              # Express bootstrap + WS + static client
├── lib/
│   └── prisma.ts         # PrismaClient singleton
├── middleware/
│   └── auth.ts           # authMiddleware (NO_AUTH guarded by NODE_ENV)
├── routes/
│   ├── auth.ts           # /status, /setup, /login, /me
│   ├── boards.ts         # GET/PATCH boards, default-board provisioning on first GET
│   ├── columns.ts        # PATCH column
│   ├── cards.ts          # CRUD + /move
│   ├── labels.ts         # CRUD + attach/detach to card
│   ├── settings.ts       # GET/PUT key-value AppSetting
│   └── reports.ts        # list + parsed + raw report endpoints
└── services/
    ├── wsHub.ts          # per-user broadcast hub
    └── reportParser.ts   # markdown → ParsedReport
```

## State ownership

| State                             | Owner                              |
|-----------------------------------|------------------------------------|
| `token`                           | Zustand (`localStorage.taskpulse.token`) |
| `theme`                           | Zustand (`localStorage.taskpulse.theme`) |
| `connectionStatus`                | Zustand (mutated by `useWebSocket`)|
| Board data (columns, cards)       | TanStack Query `['board']`         |
| Labels                            | TanStack Query `['labels']`        |
| Settings                          | TanStack Query `['settings']`      |
| Reports list                      | TanStack Query `['reports']`       |
| Active report                     | TanStack Query `['report', project, date, category]` |
| Open card detail (id)             | local `useState` in `BoardPage`    |
| Filter bar state                  | local `useState` in `BoardPage`    |

## Tailwind tokens (dark + light)

Same shape as stockpulse:

```js
colors: {
  bg:          { dark: '#0e1116', light: '#f7f8fa' },
  surface:     { dark: '#161a21', light: '#ffffff' },
  elevated:    { dark: '#1d222b', light: '#eef0f4' },
  border:      { dark: '#262c36', light: '#dde1e8' },
  text:        { dark: '#e6e9ef', light: '#1a1f29' },
  textMuted:   { dark: '#8b95a5', light: '#5e6877' },
  textFaint:   { dark: '#5a6374', light: '#8b95a5' },
  accent:      '#5b8def',     // shared
  accentHover: '#6d9bf7',
  warning:     '#e8a86a',     // WIP-limit-exceeded
  danger:      '#f0716a',
  success:     '#5fcf95',
},
```

Implemented as flat tokens (`bg-bg`, `bg-surface`, etc.) plus dark variants via `dark:bg-bg-dark` — same approach as stockpulse but with a light branch.

## Bug-pre-emption checklist (UI Layout + QA lessons baked in)

| Lesson                                  | Component(s) affected            |
|-----------------------------------------|----------------------------------|
| TopBar `gap-1 sm:gap-3` + `shrink-0`    | `TopBar.tsx`                     |
| Touch targets `min-h-11 min-w-11`        | `TopBar.tsx`, `Column.tsx` (+ button), `CardItem.tsx` (open detail), `CardDetailPanel.tsx` (delete) |
| Input `text-base sm:text-sm`             | `LoginPage`, `SetupPage`, `FilterBar`, `AddCardInput`, `CardDetailPanel`, `SettingsPage` |
| `viewport-fit=cover` + safe-area         | `client/index.html`, `AppLayout`, `TopBar`, `CardDetailPanel` (bottom sheet) |
| try/catch on every async handler         | every file in `server/src/routes/` |
| `README.md` + `.env.example` exist       | repo root                        |
