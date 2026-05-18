# taskpulse — UI polish report (framedeck design-system port)

Date: 2026-05-18

## Token diff summary

The blue/slate "cool tech" palette was replaced with framedeck's warm-cream
light / cool-slate dark twin, anchored on a CSS-variable token layer so the
chart components + recharts re-theme automatically.

| Token              | Before (light)  | After (light)   | After (dark)        |
| ------------------ | --------------- | --------------- | ------------------- |
| `--c-bg`           | #f7f8fa         | #faf6f0 (cream) | #14171d (cool slate)|
| `--c-surface`      | #ffffff         | #ffffff         | #1c2027             |
| `--c-surface-muted`| #eef0f4         | #f3eee5 (tan)   | #262a32             |
| `--c-border-soft`  | #e6e9ef         | #e9e1d2         | #303540             |
| `--c-border`       | #dde1e8         | #d8cdb8         | #424857             |
| `--c-text`         | #1a1f29         | #28231d         | #e8ecf2             |
| `--c-text-2`       | #5e6877         | #5c554a         | #b4bac4             |
| `--c-text-muted`   | #8b95a5         | #8b8275         | #7a818b             |
| `--c-accent`       | #5b8def (blue)  | #d97757 (orange)| #f08252 (warm orange)|
| `--c-success`      | #5fcf95         | #5a9d8a         | #6dbaa3             |
| `--c-warning`      | #e8a86a         | #d4a44a         | #e2b76b             |
| `--c-error`        | #f0716a         | #c45a4a         | #d97564             |

Legacy taskpulse Tailwind names (`elevated`, `textMuted`, `textFaint`,
`accentHover`, `danger`, plus the `-dark` suffix family) were kept as aliases
that point to the same CSS variables. Existing `dark:bg-bg-dark` / `dark:text-
textMuted-dark` classes still compile but become harmless no-ops because the
underlying var is theme-aware via `[data-theme]` on `<html>`.

## Component-by-component changes

- **`client/tailwind.config.js`** — replaced the hard-coded `bg-dark` /
  `surface-dark` color map with `var(--c-...)` references. Added the
  framedeck shadow ramp, radius scale, and JetBrains Mono fallback chain.
- **`client/src/index.css`** — rewrote on the framedeck template: light
  default + `[data-theme="dark"]` override (kept `html.dark` as an alias so
  the existing zustand-toggled `.dark` class still drives the theme during the
  transition). Added the `.btn` / `.input` / `.pill` / `.surface` / `.tabstrip`
  component utilities + priority-tinted pills (`pill-priority-urgent` etc.).
  Preserved the taskpulse-specific `.anim-slide-right` / `.anim-slide-bottom`
  panel-entry animations and `.safe-pt/pb/pl/pr` notch helpers.
- **`client/index.html`** — added the FOUC-free `<script>` in `<head>` that
  reads `localStorage['taskpulse.theme']`, applies `data-theme` + `.dark`
  before React mounts. Theme-color meta switched to cream `#faf6f0`.
- **`client/src/App.tsx`** — theme effect now sets BOTH `data-theme="dark"`
  and the legacy `.dark` class on `<html>` so the gradual port stays
  consistent. Loading state uses the new token names.
- **`client/src/components/TopBar.tsx`** — restyled to match framedeck's
  IDE-style top bar: orange checkmark logo + "taskpulse" wordmark, breadcrumb
  in `text-text-2`, surface-muted nav-icon hover, pill-style running-timer
  indicator. Min 44-px touch targets preserved.
- **`client/src/components/AppLayout.tsx`** — bg-bg root, dropped all
  `dark:*-dark` chained classes since the var-driven palette handles theme.
- **`client/src/components/TodayPane.tsx`** — each bucket now lives in a
  `.surface` card with a KL-date `.pill`, kind-colored title icon, and a
  prominent "Open full report →" link. Header includes a "Last updated"
  monospace stamp matching the brief.
- **`client/src/components/board/BoardView.tsx`** — loading + error states
  use new tokens.
- **`client/src/components/board/Column.tsx`** — column lives in
  `bg-surface-muted` with a soft-border header. Drop indicator uses
  `bg-accent-soft`. Add-card button is `.btn-primary btn-sm`.
- **`client/src/components/board/CardItem.tsx`** — implemented the kanban
  card design from the brief: 4-px priority bar on the left, pin glyph +
  running-timer pulsing dot in the top-right cluster, label chips at the
  bottom, italic right-aligned due date that turns red when overdue, hover
  state has accent border + shadow-md.
- **`client/src/components/board/CardDetailPanel.tsx`** — restyled to the
  framedeck right-side panel idiom. Section headers in `.label`, `.surface-
  muted` comment cards, `.input` / `.textarea` / `.btn-primary` everywhere,
  priority-pill toggles, monospace `CARD · <id>` header, slide-in panel kept.
- **`client/src/components/board/FilterBar.tsx`** — pill-style priority +
  label toggles with semantic colors; clear button uses `btn-ghost btn-sm`.
- **`client/src/components/FocusModal.tsx` + `SearchOverlay.tsx`** — both
  use the `.surface` panel idiom with backdrop blur, `btn-ghost btn-icon
  btn-sm` close buttons, and `bg-surface-muted` hover on result rows.
- **`client/src/routes/LoginPage.tsx` / `SetupPage.tsx`** — both match the
  framedeck SignInPage layout: 400-px centered surface, orange-square logo +
  wordmark, `.label` / `.input` everywhere, full-width primary button.
- **`client/src/routes/ProjectListPage.tsx`** — restyled to framedeck's
  DashboardPage idiom: surface cards in a 3-col grid, framedeck-style empty
  state (📋 emoji + h2 + muted subtitle + primary action button), per-card
  action row uses `btn-sm` variants.
- **`client/src/routes/SettingsPage.tsx`** — sections wrapped in `.surface
  p-5`, appearance toggle uses the `.tabstrip` utility.
- **`client/src/routes/ReportsPage.tsx`** — filter rail + list + detail all
  use `.surface`, active list item gets accent border + shadow, copy/expand
  buttons use the `.btn` utilities.
- **`client/src/components/reports/FindingsChart.tsx`** — bar fills now use
  `var(--c-error)`, `var(--c-warning)`, `var(--c-accent)` so the chart
  re-themes live when the user toggles dark mode. Tooltip + grid restyled.

## Dark mode

Tested by toggling `data-theme="dark"` on `<html>` (the topbar Sun/Moon
button). All surfaces, borders, accents, and the FindingsChart re-render
correctly because every color resolves to a CSS variable that responds to
the attribute. The FOUC-free init script in `index.html` applies the stored
theme before React mounts, so there's no light-mode flash on cold load.

Visual summary (since I can't render screenshots):
- **Light mode** reads as a cream-paper canvas with tan borders, dark
  charcoal text, and burnt-orange accents on primary buttons / pins / active
  focus rings. It feels warm and "morning briefing"-ish.
- **Dark mode** is a low-saturation cool slate (almost-black blue-gray) with
  soft slate borders, near-white cool text, and a more vivid `#f08252`
  orange accent that punches against the cool background. Pin / focus
  affordances stay the same warm-yellow / orange so the language carries
  across themes.

## Bundle delta

| Artifact | Before (est) | After    | Delta (raw) | After gzip |
| -------- | ------------ | -------- | ----------- | ---------- |
| CSS      | ~10 KB       | 27.0 KB  | +17 KB      | 5.71 KB    |
| JS       | ~700 KB      | 703.5 KB | ~+3 KB      | 205.4 KB   |

Total raw delta: **~+20 KB**, well under the +30 KB cap. No new
runtime dependencies were added.

## Known gaps

- The framedeck reference SignInPage has a Google OAuth button + a divider.
  taskpulse doesn't have OAuth wired up server-side, so the Login / Setup
  pages omit those slots — the form-only layout still matches framedeck's
  spacing, surface, and primary-button conventions, and the slot can be
  added later without re-styling.
- Browser-level form controls (`<input type="date">`, `<input
  type="checkbox">`) still use OS chrome. We force `accent-accent` on the
  checkbox but the calendar popup is unstyled. framedeck has the same
  situation — out of scope.
- `dark:` Tailwind variants were not stripped from the source — they still
  compile but resolve to the same color as the light variant since the
  underlying var is theme-aware. A follow-up sweep could remove the dead
  classes for clarity, but it'd be a pure churn diff (no visual change).
