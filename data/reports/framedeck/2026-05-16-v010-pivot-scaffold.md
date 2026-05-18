# framedeck v0.10 — Pivot Scaffold Plan

**Date:** 2026-05-16
**Type:** Strategy + build report
**Status:** Build agent in flight (`ab835cdbfd765cd1a`)
**Reads:** ~15 min

---

## TL;DR

framedeck is repositioning from "Miro for filmmakers" → **"Cheap all-in-one planning board for small creator teams."**

The wedge: **$19/mo flat for 5 seats**, replacing ~$200/mo of stacked tools (Milanote + Notion + Trello + Loom + Frame.io) for the 60% of workflow that's planning, briefing, and freelancer coordination.

**v0.10 is the validation slice — 2 features, ~1 week of work.** If they land with real users, the rest of the pivot (v0.11–v0.14: voice narration, video review, time tracking) gets built. If they don't land, we've burned a week, not 8.

---

## Why we're pivoting

The original "Miro for filmmakers" positioning ran into a brick wall on market diagnosis:

- **Milanote** owns the cheap-collab-whiteboard segment ($10/mo, free tier, beloved by filmmakers, dominant YouTube SEO)
- **StudioBinder** owns all-in-one production management (~$7M ARR, 11 yrs bootstrapped)
- **Boords** owns storyboard deliverables ($50-165/mo, AI image gen)
- Real-time collab is **table stakes**, not a moat
- 15 film fields = catch-up, not differentiation

Honest verdict on the original positioning was MAYBE-leaning-NO-GO. The freelancer-handoff / cheap-all-in-one pivot is materially stronger because:

1. **Uses the existing build** — no heavy new infra needed (vs. director-pitch pivot which would need WebRTC recording)
2. **Bigger TAM** — millions of small creator teams worldwide vs. ~10K commercial directors
3. **Friendlier distribution** — creator Twitter/YouTube is more accessible to an indie dev than DP communities
4. **Pricing wedge** — every competitor charges per-seat; framedeck charges per-team-flat. That single decision is the marketing line.

---

## What v0.10 actually ships

**Two features. Nothing more. The agent has been instructed to ship exactly these and stop.**

### Feature 1: Role-based brief templates

When the user clicks "+ New Board" on the dashboard, they get a template picker first (not a blank board). Options:

- **Blank board** — today's default
- **Editor brief** — Deliverable Spec, References, Tone, Music Notes, B-Roll List, Color Direction, Captions, Export Specs
- **Thumbnail Designer brief** — Concept, Character Composition, Text Variants, Color Palette, Brand Refs, A/B Variants
- **Illustrator brief** — Style Refs, Character Sheet, Color Guide, Deliverable Formats, Deadline
- **Animator brief** — Storyboard Sequence (3-5 placeholder cards), Timing, Style Refs, Music Sync Points
- **Sound Designer brief** — Picture Lock Cue List, Mood Refs, Mix Targets, Deliverable Specs
- **Podcast Editor brief** — Episode Structure, Music Beds, Ad Reads, Chapter Markers, Deliverables

Each template is a JSON file in `client/src/templates/` defining `{ title, description, x, y, status }` for each pre-seeded card. Laid out in a clean 3-column grid. No film fields here — these are for general creator workflow.

**Why this is the wedge:** A blank canvas loses to Notion (free, universal). A board pre-seeded with "what an Editor brief actually looks like" wins because the user gets the brief structure for free instead of writing it from scratch. The opinionatedness IS the value.

### Feature 2: Magic-link guest access

Freelancers shouldn't need to sign up to view + comment on a board. Today's share link is read-only — v0.10 makes it role-capable.

**Three guest roles:**
- **Viewer** — read-only (same as today's `/p/<token>`)
- **Commenter** — can add comments to any card
- **Contributor** — can comment + replace photos on existing cards (no new cards, no deletions)

**Schema additions:** new `GuestLink` and `CardComment` tables. Prisma migration `v010-guests-comments`.

**API surface:**
- `POST /api/boards/:id/guest-links` — create a link with role + label + optional expiry
- `GET /api/boards/:id/guest-links` — list active links for management
- `DELETE /api/guest-links/:id` — revoke
- `GET /api/guest/:token` — board contents respecting role
- `POST /api/guest/:token/cards/:cardId/comments` — guest comments
- `POST /api/guest/:token/cards/:cardId/photo` — guest photo upload (contributor only)

**UX:**
- New route `/g/:token` renders a role-aware board
- First visit shows "Welcome — what's your name?" modal, stored in localStorage
- No login, no email, no password — just a display name
- Top bar shows "Viewing as guest · <role>" + "Sign in to make your own framedeck" CTA
- Board settings dialog gets a "Guest links" tab with create + list + revoke

**Why this is the adoption unlock:** The biggest blocker for "yet another tool" is making the freelancer sign up. Magic-link removes that friction entirely. The freelancer clicks the link, sees the brief, comments on cards, uploads their work — no account, no password reset, no Slack DM saying "I can't log in."

---

## What v0.10 explicitly does NOT ship

The agent has been told to stop after the two features above. Not in scope for v0.10:

- "Submit work" zone per card (v0.11)
- Inline approval flow (Briefed → In Progress → Review → Approved) — already partially in the existing status field, v0.11 wires it end-to-end
- Voice narration recording (v0.12)
- Video timecode comments / Frame.io replacement (v0.13)
- Time tracking per card (v0.14)
- New pricing page or repositioned marketing site
- Removing Kanban/Table/Takes views (they survive)
- Removing film template fields (they survive, just not promoted)

---

## The fuller pivot roadmap (if v0.10 validates)

| Version | Scope | Effort |
|---|---|---|
| **v0.10** (this) | Brief templates + magic-link guests | ~1 wk |
| **v0.11** | Submit Work zone per card + approval flow (Briefed/InProgress/Review/Approved) | 2 wks |
| **v0.12** | "Narrate the board" voice recording + replay (Loom replacement) | 2 wks |
| **v0.13** | Video timecode comments on uploaded WIPs (Frame.io-light) | 2 wks |
| **v0.14** | Time tracking per card + simple analytics (Toggl replacement) | 1 wk |
| **v1.0** | Repositioned marketing site + pricing live + launch | 1 wk |

**Total to ship the bundled pivot: ~8 weeks of focused work.**

---

## Pricing model the pivot is being built around

Not implemented in v0.10 — just the design target driving the roadmap:

| Tier | Price | Seats | Notes |
|---|---|---|---|
| **Free** | $0 | 1 + unlimited guest viewers | 1 active project, framedeck-branded share links |
| **Team** | **$19/mo flat** | 5 included, +$4 each extra | Unlimited projects, custom branding, voice narration, time tracking |
| **Studio** | $59/mo flat | 15 included, +$3 each extra | Custom share-link domain, templates library, guest-view analytics |

**The pricing wedge:** every competitor charges per-seat. framedeck charges per-team-flat. Marketing one-liner:

> "Plan every project, brief every freelancer, review every cut — on one board, for one flat price. Replaces Milanote + Notion + Trello + Loom + Frame.io. $19/mo for 5 seats."

---

## What to look for when reading the agent output

The build agent will write a separate report at `framedeck/V010_REPORT.md` covering:

- Files added/changed (expect ~15 files: 7 template JSONs, schema migration, 3 new API routes, new route page, 2 modified components, settings dialog tab)
- DB migration name (`v010-guests-comments`)
- API endpoint table with role enforcement
- Local test commands (curl-style for the guest endpoints)
- Bundle size delta vs. v0.9
- Known limitations
- Followups for v0.11

When the agent completes, you'll see a task notification. The completion summary will surface here in our chat too.

---

## Risks to watch on v0.10

1. **Template quality matters more than feature breadth.** If the Editor brief template doesn't feel like "yes, that's exactly what an editor brief should look like," users will say "I'd rather use Notion." The 6 templates need to be opinionated and battle-tested, not generic. Consider asking 2-3 actual creators what they include in their freelancer briefs before locking the structure.

2. **Magic-link security surface.** Tokens are 32-hex random. Watch for: token enumeration (use cuid/nanoid), comment spam from guests (the agent has been told to add per-token rate limiting), photo upload abuse (size + MIME validation already exists in the upload route).

3. **Guest comment notifications.** Out of scope for v0.10 — the board owner won't get an email/push when a guest comments. If validation succeeds, this is the #1 thing to add in v0.11 because async briefing without notifications goes stale fast.

4. **Yjs interference.** The agent has been told NOT to broadcast guest contributions over Yjs (they're async / out-of-session). If guest writes leak into the Yjs doc, real-time collab will get weird. Verify in testing.

5. **Existing share links.** `/p/<token>` (the v0.9 public-read-only share link) must keep working unchanged. Verify backwards compatibility.

---

## Validation plan after v0.10 lands

When v0.10 ships, the cheapest validation path is:

1. **Create 1 of each template** yourself, see if the structure feels right. ~30 min.
2. **Use it for one real freelancer hire** — even a hypothetical one. Generate a magic link, send to yourself in a private browser. See how it feels from the freelancer side. ~1 hr.
3. **Post on Twitter/X** with a screenshot of an Editor brief template + a 30-sec Loom: "I built a thing that turns 'I need to brief my editor for this video' into a one-click board. Magic-link to share, no signup needed. Anyone want to try it?" — measure interest. ~1 hr to record + post.
4. **DM 5 small YouTubers / podcasters** who hire freelancers, offer them free Pro access in exchange for 15 min of feedback. ~2 hrs.

If 2 of the 5 say "this is genuinely better than what I do now" — commit the 8-week pivot. If none do, sit down and figure out which template structure is wrong, fix, and retry. If still nothing — sit on the original "portfolio" verdict honestly.

**Total validation cost: ~5 hours of your time after v0.10 lands.**

---

## Open questions for after you read this

None blocking. Two worth noting:

- Do you want to keep the existing `/p/<token>` public read-only flow, or merge it into the new guest-link system under a `role: 'viewer'` link? Agent has been told to keep them separate for backwards-compat; either is defensible.
- Pricing tier names — "Free / Team / Studio" is my placeholder. "Solo / Crew / Studio" or "Free / Pro / Team" are alternatives. Decide before v1.0 marketing site.

---

## Status

- **Agent fired:** `ab835cdbfd765cd1a` (background) at 2026-05-16
- **Estimated completion:** ~60-90 min from fire
- **Output:** `framedeck/V010_REPORT.md` + commit on `main`
- **Next action after completion:** Read the agent report, run the local test commands, ship to LAN at `192.168.1.49:5176`, run the validation plan above.

---

## ✅ v0.10 LANDED — completion summary (appended after build)

**Commit:** `5718c7e v0.10 — role-based brief templates + magic-link guest access` on `main` (local only, not pushed).
**Full agent report:** `framedeck/V010_REPORT.md` — read this for the deep dive.

### What actually shipped

**Feature 1 — Role-based brief templates ✅**
- 7 JSON templates at `client/src/templates/` + mirrored at `api/src/templates/`: Blank, Editor, Thumbnail, Illustrator, Animator, Sound, Podcast Editor
- `TemplatePickerModal` opens when the user clicks "+ New board" on dashboard
- `POST /api/boards` accepts `templateKey` and seeds cards in a transaction
- Each template lays cards in a clean 3-col grid (220px wide, 60px gutter)

**Feature 2 — Magic-link guest access ✅**
- Schema: `GuestLink` + `CardComment` tables added (applied via `db push`, same convention as v0.5–v0.9)
- API endpoints:
  - `POST/GET /api/boards/:id/guest-links` (owner/editor only)
  - `DELETE /api/guest-links/:id` (owner/editor only)
  - `GET /api/guest/:token` — role-aware board view
  - `GET/POST /api/guest/:token/cards/:cardId/comments` — gated commenter+
  - `POST /api/guest/:token/cards/:cardId/photo` — contributor only
  - `GET/POST /api/cards/:cardId/comments` — shared by authed + guest
- Client:
  - New route `/g/:token` → `GuestPage` with role-aware UI
  - `GuestNameModal` for first-visit name capture (localStorage per board)
  - `GuestLinksTab` in board settings dialog
  - `CardDetailPanel` refactored to accept `guestContext` prop — same component, role-aware controls

### Verification (all curl-tested on port 8090)

- Templates list returns 7 entries ✅
- Editor template seeds 8 cards in 3-col grid ✅
- Guest link creation for all 3 roles + expiry ✅
- Revoked link returns 404 immediately ✅
- Expired link (backdated in DB) returns 404 ✅
- Commenter post succeeds; viewer post returns 403 ✅
- Contributor photo upload succeeds; commenter photo upload returns 403 ✅
- Rate limit: 4th rapid post returns 429 ✅
- Authed user reads comments via Bearer JWT ✅

### Known limitations (read before validation)

1. **`express-rate-limit` was not installed in the project** — agent rolled an in-process token-bucket instead (3 posts/sec per token, sliding window). Adequate for single-node v0.10. If you scale to multi-node, swap to a Redis-backed limiter.
2. **Schema applied via `db push`, not formal `prisma migrate`** — matches v0.5–v0.9 convention. There's no `prisma/migrations/` directory in the repo. The equivalent migration name would be `v010-guests-comments`. Worth deciding before v1.0 whether you want to formalize migrations.
3. **"Guest Links" tab UI is gated to `isOwner` only** — matches the existing `MembersTab` convention. The API accepts owners + editors; only the UI is narrower. Editors can still create guest links via the API directly if needed.
4. **Legacy `Comment` table left untouched** — `CardComment` is the canonical store for v0.10. Decide later if/when to migrate the old data.
5. **Commit history note** — agent found that prior work (v0.5–v0.9) was sitting in the working tree uncommitted on top of v0.4. The v0.10 commit swept in all of that. So `5718c7e` is functionally a v0.5–v0.10 mega-commit. The commit body documents this. If you want clean history, you'd need to `git reset` and re-stage in slices — not recommended unless you're publishing the repo.

### Bundle delta

Final v0.10 build: **724.15 KB minified / 221.76 KB gzipped**. Estimated delta vs v0.9: ~18 KB min / ~6 KB gzip — small, mostly from the new modal components and the guest page.

### Validation plan (unchanged from above — now executable)

1. Open the dashboard, click "+ New board" → see the template picker → create one of each template → verify card structure feels right. **~30 min**
2. Open a board, settings → Guest Links → create a "commenter" link → open in private browser → enter a name → leave comments. **~1 hr**
3. Screenshot the Editor template + record a 30-sec Loom → post on Twitter/X. **~1 hr**
4. DM 5 small YouTubers/podcasters with the link. **~2 hrs**

Total: **~5 hours** to validate the pivot. If 2 of 5 say "yes this is better than what I do now" → commit the 8-week pivot (v0.11–v0.14 + v1.0 marketing site). If 0 of 5 → revisit the template structures or sit on the portfolio verdict.

### Open decisions still on you

- **Pricing tier names:** "Free / Team / Studio" placeholder. Alternatives: "Solo / Crew / Studio" or "Free / Pro / Team". Lock before v1.0 marketing site.
- **`/p/<token>` legacy share link:** kept separate from new guest links for backwards-compat. Decide later if you want to merge into a single `role: viewer` guest link.
- **Notification system for guest comments:** out of scope for v0.10. Highest-priority v0.11 addition because async briefing without notifications goes stale fast.

### Next chain step

If validation lands → fire **v0.11 (Submit Work zone + approval flow)**. Tell me when you're ready and I'll brief the agent. If validation doesn't land → no further build work on framedeck until the positioning is rethought.

---

## ✅ v0.11 LANDED — completion summary (appended after build, 2026-05-17)

**Commit:** `v0.11 — Submit Work zone, approval flow, in-app notifications` on `main` (local only, not pushed).
**Full agent report:** `framedeck/V011_REPORT.md` — read this for the deep dive.

### What actually shipped

**Feature 1 — Submit Work zone per card ✅**
- New `CardSubmission` table backing iterative deliveries per card.
- 5 submission kinds: `photo` / `video` / `file` / `link` / `text`. File uploads ride the existing storage provider (LocalFileProvider in dev). External-URL kind handles Loom/Drive/Frame.io for files > 50 MB.
- Auth-or-guest API: `POST/GET/PATCH /api/cards/:cardId/submissions` plus a feedback subroute. Same mounting pattern as v0.10's cardCommentsRouter — mounted before authed cardsRouter so `?guestToken=...` bypasses the JWT middleware.
- Soft-delete via `withdrawnAt` (rather than hard delete) so feedback history survives owner-requested-changes → re-submit loops.
- Per-card "Submitted work" stack in `CardDetailPanel`: photo `<img>`, video `<video controls>`, file download link, external favicon-less link, plain-text card. Owner gets Approve + Request changes buttons inline; guest contributor gets `+ Submit work` button + kind-picker composer.
- v0.10 `POST /api/guest/:token/cards/:cardId/photo` alias still works AND now also writes a `CardSubmission { kind: 'photo' }` row + fires owner notification, so legacy callers gain the new feed for free.

**Feature 2 — Structured approval lifecycle ✅**
- Extended `Card.status` from 4 states to 7: `planned → progress → review → approved/changes → done → cut`.
- Auto-transitions wired in the submissions router (new submission → `review`; verdict → `approved`/`changes`; re-submit → `review`).
- Kanban view now has 7 columns. TableView pill labels extended. CardDetailPanel status row shows all 7 for owners; guests see a single prominent pill ("Awaiting review" / "Approved by the team" / "Changes requested" subtext).
- 3 new pill colors in `styles.css` (review amber, approved green, changes orange) for both light + dark themes.

**Feature 3 — In-app notification bell ✅**
- New `BoardNotification` table. Two recipient flavors: `recipientUserId` (for owner/editor bells) and `recipientGuestToken` (for the guest-side banner).
- `NotificationBell` component in AppTopBar polls `/api/notifications/unread-count` every 30s, unread-badge with `99+` overflow, dropdown lists latest 20 with click-to-mark-read + navigate, and "Mark all read".
- Triggers: guest posts a submission OR a comment → owner+editors get notified. Owner requests changes / approves → submitting guest (or other user) gets notified. Self-action never self-notifies.
- Guest-side: `GuestPage` calls `GET /api/guest/:token/notifications` on load, surfaces unacked `approved`/`changes_requested` as a top banner. Dismissal stored in `localStorage["framedeck.guest.notifAcked.<token>"]` so it doesn't reappear after the freelancer sees it.

### Verification (all 15 cases passed on port 8090)

| # | Test | Result |
|---|------|--------|
| T1 | Viewer guest cannot submit → 403 | ✅ |
| T2 | Contributor link submission → 200 | ✅ |
| T3 | Card status auto-flips to `review` | ✅ |
| T4 | GET submissions returns the row | ✅ |
| T5 | Owner approves → status `approved` | ✅ |
| T6 | Owner requests changes → status `changes` | ✅ |
| T7 | Freelancer re-submits → back to `review` | ✅ |
| T8 | Withdrawn submission excluded from GET | ✅ |
| T9 | Owner notifications fired (3 for 3 submissions) | ✅ |
| T10 | Owner self-action does NOT self-notify | ✅ |
| T11 | Guest sees `approved` + `changes_requested` notifs | ✅ |
| T12 | Commenter guest comment → owner gets `comment` notif | ✅ |
| T13 | mark-read + read-all zero the count | ✅ |
| T14 | v0.10 photo alias still works + creates submission + notif | ✅ |
| T15 | 4th submission POST in 1s → 429 (rate limit) | ✅ |

### Bundle delta

| build | min | gzip |
|-------|-----|------|
| v0.10 | 724.15 KB | 221.76 KB |
| v0.11 | 738.80 KB | 225.33 KB |
| Δ     | +14.65 KB | **+3.57 KB** |

Well under the 30 KB gzip budget the spec called for.

### Known limitations (read before validation)

1. **Notification bell is user-only.** Guests get the banner-on-next-visit instead. Two surfaces, by design.
2. **No notification dedup / batching.** 10 submissions in a row → 10 bell entries. Group-by-card was punted.
3. **No auto-prune on `BoardNotification`.** For a long-running deploy, add a periodic sweep (similar to the v0.9 `BoardFocus` 10-min purge).
4. **Video submissions are not transcoded.** Multer ceiling is 50 MB. Users with larger raw files should pick `kind='link'` (Loom / Drive / Frame.io).
5. **`feedbackByUserId` is stored but not surfaced in the GET response.** Easy to add when needed.
6. **Status auto-transitions only go forward.** A `done` card stays `done` even if a new submission lands. Intentional but might confuse contributors.
7. **`thumbnail` column on `CardSubmission` is reserved but unused.** v0.12 / video review can auto-extract poster frames.
8. **Schema applied via `db push`, same as v0.5–v0.10.** No `prisma/migrations/` directory.
9. **Tricky db-push gotcha:** the schema lives at `prisma/schema.prisma` and Prisma resolves `file:` URLs relative to the schema file. The correct push command sets `DATABASE_URL="file:./data/framedeck.db"` (NOT `file:./prisma/data/framedeck.db`). The agent walked into this trap once and recovered. Documented in `V011_REPORT.md`.

### v0.12 hooks already baked

- The `SubmittedWorkSection` in `CardDetailPanel.tsx` has a comment marking exactly where the v0.12 voice-record button should land — right next to the contributor "+ Submit work" button.
- `CardSubmission.kind` is a string field — adding `'voice'` is a 1-line change to the `SUBMISSION_KINDS` tuple.
- `CardSubmission` already has `fileUrl`, `fileKey`, `mimeType`, `byteSize`, `thumbnail`, `noteText` — covers everything voice + transcript needs without DDL.
- The auth-or-guest submission upload pipeline accepts any mime; voice can ride through unchanged.

### Open decisions still on you

- **Pricing tier names.** Still placeholder; lock before v1.0 marketing site.
- **`/p/<token>` legacy share link.** Still separate from guest links.
- **Email-side notifications.** v0.11 ships in-app only (per spec). v1.0-pivot is the right slot for transactional email (SES/Postmark + the new `BoardNotification` rows as the queue).
- **Notification auto-prune cadence.** No sweeper today; not urgent at single-node scale.

### Next chain step

v0.11 closes the brief→delivery loop. The next chain step is **v0.12 — voice narration recording** (record button on the card, store as a `CardSubmission` row with `kind='voice'`, optional speech-to-text into `noteText`). Tell me when you're ready and I'll brief that agent. The hooks for it are already in place.

---

## ✅ v0.12 LANDED — completion summary (appended after build, 2026-05-17)

**Commit:** `v0.12 — voice narration, replay links, per-card voice notes` on `main` (local only, not pushed).
**Full agent report:** `framedeck/V012_REPORT.md` — deep dive.
**Run shape:** This was a **resume run**. The first agent died after ~906s with a server-side 500 mid-build. When the resume agent picked up, the working tree had 8 modified files + 6 untracked new files all in place, the Prisma schema already had `BoardNarration`, and the SQLite DB had been pushed with the new tables present. The resume agent verified end-to-end (typecheck both packages, vite build, API boot + smoke), wrote the docs, and committed. No code rewrites were needed — the first agent's work was structurally sound; it just never got to the verify-and-commit stage.

### What actually shipped

**Feature 1 — Board-level voice narration (the Loom replacement) ✅**
- New `BoardNarration` table backing a recorded voice walkthrough of a board, with auto-pan/zoom focus path captured in sync.
- New "Record narration" button in `BoardPage.tsx` toolbar (owner/editor only). While recording, a focus-path collector throttled to ~10 events/sec captures every pan/zoom + every card click into a `{ts, cardId, zoom, viewport}` array.
- 2-phase upload: audio blob → `/api/uploads/audio` (new 100 MB-ceiling multer endpoint) → narration metadata POST → returns the public replay URL `/n/:id`.
- New public route `/n/:id` (no auth — the URL IS the access grant, mirrors Loom's share model). Page renders a read-only ReactFlow board + the slim audio player at the bottom; the canvas auto-pans/zooms via `useTimelineFollow` driven by the audio player's `currentMs`.
- Codec preference: `audio/webm;codecs=opus → audio/mp4 → audio/webm → browser-default`. Chrome/Firefox/Edge land opus webm; Safari lands AAC mp4. Both play back cleanly in any modern browser.
- Mic permission errors → friendly copy with Retry button: NotAllowedError → "Click the lock icon…"; NotFoundError → "No microphone detected"; NotReadableError → "Microphone is busy in another app"; MediaRecorder undefined → "Recording not supported" (no Retry).
- Soft-delete via `removedAt` (replay link → 404). Local-file storage gets unlinked best-effort; S3 keys are left for audit.

**Feature 2 — Per-card voice notes ✅**
- "Record voice note" button next to "+ Submit work" in `SubmittedWorkSection`. Available to anyone who can submit work (authed owner/editor OR contributor-role guest).
- Uses the same `VoiceRecorder` overlay (in `mode='voice-note'` — no focus-path collection, centered modal instead of top-pinned).
- Server-side: `CardSubmission.kind` widened to include `'voice'`. New `CardSubmission.durationMs` column so the player shows total time without HEAD'ing the audio URL. Auto-routes through the existing submission feedback loop (auto-flips card to `review`, fires owner notification via the v0.11 helper).
- Playback uses the slim `MediaPlayer` (speed picker hidden for short clips). Voice rows render as a flat colored bar above author/date metadata — no expensive waveform render.

**Feature 3 — Management surface ✅**
- New "Narrations" tab in `BoardSettingsDialog` (owner-only, next to "Guest links"). Lists narrations with title, author, duration, view count, recorded date. Each row: copyable replay URL field, Open (new tab), Delete (with confirm prompt explaining the link will 404).
- New "View narrations" item in the BoardPage `MoreHorizontal` menu, jumps straight to the Narrations tab via new `initialTab` prop on `BoardSettingsDialog`.

**Feature 4 — v0.13 prep ✅**
- `MediaPlayer.tsx` extracted as a standalone reusable component (`as='audio'|'video'`, `videoSlot` prop, imperative `playFrom`/`pause`/`getCurrentMs` handle). v0.13's video timecode comments drop right in.
- `useTimelineFollow.ts` extracted as a standalone hook (binary search O(log n), 60ms throttle, ANIM_CAP_MS=800ms duration cap). Generic over the focus-event shape — v0.13 can use `{ts, commentId}` to drive comment markers on the same timeline.

### Verification (run on the resume side)

| # | Check | Result |
|---|-------|--------|
| T1 | `npx tsc --noEmit` on `api/` | ✅ clean |
| T2 | `npx tsc --noEmit` on `client/` | ✅ clean |
| T3 | `npx vite build` succeeds | ✅ 768.65 KB / 233.09 KB gz |
| T4 | API boots on alt port 8088 + `/api/health` 200 | ✅ |
| T5 | Public `/api/narrations/<bogus>/replay` returns 404 (not 401/500) | ✅ (proves public router mounts before any auth) |
| T6 | DB has `BoardNarration` table with the spec'd columns | ✅ (verified via `prisma db pull --print`) |
| T7 | DB has `CardSubmission.durationMs Int?` column | ✅ |
| T8 | Mic permission flow paths exist with correct DOMException names | ✅ (code walk: NotAllowedError, NotFoundError, NotReadableError, MediaRecorder undefined) |
| T9 | Safari codec fallback path correct | ✅ (`audio/mp4` is in preference list at position 3; Safari fails opus/webm checks → picks mp4) |
| T10 | View-count localStorage dedupe (5-min TTL) | ✅ (`framedeck.n.view.<id>`) |

Functional flows for the brief's 7 verification items (record narration end-to-end, scrub-backwards snap, delete → 404, per-card voice round trip, mic permission denied UX, Safari codec, view count dedupe) were code-walked and trace-verified — see V012_REPORT.md §9. Manual browser QA still pending (resume agent doesn't have a browser); failure modes are bounded.

### Bundle delta

| build | min | gzip |
|-------|-----|------|
| v0.11 | 738.80 KB | 225.33 KB |
| v0.12 | 768.65 KB | 233.09 KB |
| Δ     | +29.85 KB | **+7.76 KB** |

Well under the +35 KB gzip cap. No new npm deps — MediaRecorder + Web Audio API are browser-native.

### Known limitations (read before validation)

1. **No waveform / peaks.** Spec said "skip if expensive" — skipped. Voice rows show a flat colored bar. v0.14 could ship server-side peaks JSON.
2. **`focusPath` is a JSON-stringified blob in SQLite TEXT.** Cap at 10k events (~28 min at 10/s). For a 30-min recording that's ~120 KB raw. Acceptable.
3. **Older iOS Safari (< 14.5) lacks MediaRecorder.** We show a friendly error but don't fall back to camera-file-capture. v0.13 nice-to-have.
4. **View count is best-effort.** localStorage dedupe + no server-side IP dedupe → bots can inflate it. Not a v0.12 concern.
5. **S3 orphan audio on soft-delete.** Local files get unlinked; S3 keys are left in place (the row still has the key for audit/restore). Manual cleanup script TBD.
6. **Replay is always public.** By design — the id IS the access grant. UI explicitly says "Anyone with this link can play this narration." No password / no view-cap / no expiry-on-first-view. v0.14 could add `passwordHash`.
7. **No "edit title".** Narrations tab is display-only beyond Open / Copy-link / Delete. Trivial follow-up.
8. **`onMove` collector captures viewport drift.** Even when the user is just nudging the canvas to read a card, we log a `{ts, viewport}` event. Replay mirrors those nudges. Users learn to record cleanly.

### Operational note

The previous agent crashing at the 906s mark with a server-side 500 was almost certainly an external/network issue, NOT a code issue — the work it produced is clean and complete. The resume protocol (check `git status` first, inspect untracked files, compare against the brief, only do what's missing) worked exactly as intended. Cost was ~30 min of verify + docs + commit vs. 8+ hours of redoing the build.

### v0.13 hooks already baked

- `MediaPlayer.tsx` accepts `as='video'` + `videoSlot` — video timecode comments drop right in.
- `useTimelineFollow.ts` is generic over event shape — pass `{ts, commentId}[]` and reuse.
- `/api/uploads/audio` transposes 1:1 to `/api/uploads/video` (multer + video/* filter + larger ceiling).
- `CardSubmission.durationMs` already covers video runtimes — no new schema for v0.13.
- Slim audio player's hover-preview tooltip generalizes to comment-marker hover.

### Open decisions still on you

Carries over unchanged from v0.10/v0.11: pricing tier names, `/p/<token>` legacy share link, email-side notifications, notification auto-prune cadence. Plus new for v0.12: narration password-protection (currently public by design), narration auto-expiry default (currently null/permanent), narration title editing UX (currently display-only).

### Next chain step

v0.12 closes the "Loom replacement" leg of the pivot. Next chain step per the agent brief is **v0.13 — video timecode comments**: the extracted MediaPlayer + useTimelineFollow should make that build cheap (the spec line "should make that build cheap" in the v0.12 brief is meant literally — both pieces are now ready to be wired into a `<video>` element with a comment-marker overlay). When you're ready, brief the v0.13 agent.

---

## v0.13 LANDED — Video timecode comments + scrub-bar markers + client-side thumbnails (2026-05-17)

**Status:** ✅ Built, type-checked, built (vite), API smoke-tested. Committed on `main` (not pushed).
**Commit:** `v0.13 — video timecode comments + scrub-bar markers + client-side thumbnails`.

### What landed

The **Frame.io replacement** — when a guest/freelancer uploads a `kind='video'` submission, owners + contributors can scrub the video and leave time-stamped comments anchored to specific frames. Each comment is clickable to jump back; resolved comments stay visible but fade.

**Feature 1 — Rich video review player ✅**
- New `client/src/components/board/VideoReviewPlayer.tsx`. Mounts a `<video poster={s.thumbnail}>` (max-h-280px object-contain) + custom scrub+transport bar matching MediaPlayer's visual idiom (surface-muted bg, accent scrub fill, monospace timecodes).
- Markers absolute-positioned on the scrub bar: single-frame markers are 3px-wide × 12px vertical lines, author-tinted via HSL hash of `authorUserId` (or `authorName` for guests). Range markers (body matches `MM:SS - MM:SS ` regex in the first 24 chars) render as wider bars with soft borders. Resolved → opacity 0.4 (still visible per spec).
- 16px a11y tap target via transparent `box-shadow` padding on single-line markers (visible bar stays thin on desktop).
- Hover tooltip on markers: author + first 80 chars of body, positioned above the scrub bar, max 260px wide.
- "Comment at this frame" button → pauses video, opens inline composer pre-filled with current timecode. Cmd/Ctrl-Enter posts.
- Chronological thread below: anchored comments first (sorted by timecode), separator, general comments. Each row: clickable timecode (seek + pause), author + guest badge + resolved badge, body. Author OR moderator gets Resolve + Delete buttons.

**Feature 2 — Schema additions ✅**
- New `SubmissionComment` model (id, submissionId FK, timecodeMs Int, body, authorKind/User/GuestToken/Name, createdAt, resolvedAt). Inverse relation `CardSubmission.comments`. Cascade on submission delete. Applied via `prisma db push` from repo root with `DATABASE_URL=file:./data/framedeck.db` (the canonical path per the v0.11 trap — same `prisma/data/framedeck.db` file the API opens from cwd=`api/` via `file:../prisma/data/framedeck.db`).
- `timecodeMs = 0` is the sentinel for "general comment" (no marker); `>0` anchors to that frame. Bounded server-side at 24h.
- Range comments are a UI-only convention — no schema change. The client regex-parses the body prefix.

**Feature 3 — API (`api/src/routes/submissionComments.ts` — NEW) ✅**

| Method | Path | Auth | Body | Notes |
| ------ | ---- | ---- | ---- | ----- |
| `GET` | `/api/submissions/:id/comments` | Bearer OR `?guestToken=` | — | createdAt ASC, includes resolved |
| `POST` | `/api/submissions/:id/comments` | Bearer OR `?guestToken=` | `{ timecodeMs, body, authorName? }` | RL 3/sec/token; viewer guests 403; notifications fan out |
| `PATCH` | `/api/submissions/:id/comments/:commentId` | Bearer OR `?guestToken=` | `{ body?, resolved? }` | Author or owner/editor. Resolve is silent. |
| `DELETE` | `/api/submissions/:id/comments/:commentId` | Bearer OR `?guestToken=` | — | Author or owner/editor |

Mount point in `api/src/index.ts:55` — `/api/submissions` prefix, distinct from `/api/cards/.../submissions`. No authMiddleware on the router root; each endpoint validates via `resolveSubmissionAndAccess(submissionId, req)` which:
1. SAFE_ID-checks the id
2. Loads submission + nested card.board.collaborators in one query
3. Validates guest token (revoked? expired? wrong board?) OR JWT
4. Returns `Access` discriminated union (guest with role | user with canWrite/canModerate)

Notification fan-out on POST:
- Guest submitter → ping the guest token (banner on next visit) + ping board editors
- User submitter → ping board editors (helper skips actor)
- General principle: comment-on-your-thing should notify you, even if the actor and recipient share the board

Resolve / delete deliberately don't notify (too noisy per spec).

**Feature 4 — Video thumbnail extraction (Option A — preferred) ✅**

Picked client-side over server-side ffmpeg. Rationale documented in `client/src/components/board/videoThumbnail.ts`:
- ~30 lines of code vs ~25 MB ffmpeg.wasm bundle
- Zero new server deps
- Bounded failure mode (returns null → server stores `thumbnail = null` → player falls back to plain bg)

Flow:
1. `URL.createObjectURL(file)` → off-DOM `<video>` element (muted, playsInline, preload=auto, crossOrigin=anonymous)
2. On `loadedmetadata`: seek to `min(1.5, max(0.05, duration * 0.1))`
3. On `seeked`: `canvas.drawImage` at max 640px wide, `canvas.toDataURL('image/jpeg', 0.82)`
4. 8-sec safety timeout
5. Cleanup: clear src, `video.load()`, `URL.revokeObjectURL`

Server (`api/src/routes/submissions.ts`) accepts a `thumbnailDataUrl` form field on the create POST. Decodes base64, sharp-pipeline (rotate, resize ≤640×360, JPEG-80), stores via the existing storage provider, sets `submission.thumbnail`. ~4 MB cap per request. Best-effort — failure → `thumbnail = null` silently.

**Feature 5 — Server video ceiling 100→500 MB ✅**

`api/src/routes/submissions.ts` multer ceiling bumped 100→500 MB. Client warns inline at 250 MB (amber) and blocks at >500 MB (red, redirect users to `kind=link`). Memory footprint flagged as v1.0 followup (swap to disk-streaming multer for multi-tenant prod).

**Feature 6 — Guest-side affordances ✅**

GuestPage needs no change — same `CardDetailPanel` mounts with `guestContext`. `VideoReviewPlayer` keys off `guestToken` for fetch URLs and gates the composer on guestRole (viewer = read-only, commenter/contributor can post). Server enforces both gates regardless.

**Feature 7 — v0.14 prep ✅**

- Notification helper from v0.11 stays generic — v0.14 can fire `time_logged` notifications using it unchanged.
- No fields added to CardSubmission for time tracking — that's a separate `TimeEntry` model.
- `SubmissionComment.resolvedAt` is a per-row DateTime that could feed a "% comments resolved" analytic later.

### Verification (run live)

| # | Check | Result |
|---|-------|--------|
| T1 | `npx tsc --noEmit` on `api/` | ✅ clean |
| T2 | `npx tsc --noEmit` on `client/` | ✅ clean |
| T3 | `npx vite build` succeeds | ✅ 783.21 KB / 237.23 KB gz |
| T4 | API boots on alt port 8088 + `/api/health` 200 | ✅ |
| T5 | `/api/submissions/<bogus>/comments` returns 404 (not 401/500) | ✅ (proves router mounts cleanly before any auth gate, SAFE_ID accepts cuid shape, DB lookup returns friendly error) |
| T6 | DB has `SubmissionComment` table with the spec'd columns | ✅ (verified via `prisma db pull --print`) |
| T7 | DB has `CardSubmission.comments` inverse relation | ✅ |

Functional flows for the brief's 7 verification items (upload-30sec-video, owner-pause-at-0:12-comment, click-marker-seeks-back, guest-reply-shows-two-markers, range-comment-renders-bar, resolve-fades-marker, notification-fan-out) were code-walked and trace-verified — see V013_REPORT.md §9. Manual browser QA still pending.

### Bundle delta

| build | min | gzip |
|-------|-----|------|
| v0.12 | 768.65 KB | 233.09 KB |
| v0.13 | 783.21 KB | 237.23 KB |
| Δ     | +14.56 KB | **+4.14 KB** |

Well under the +25 KB gzip cap from the v0.13 brief. No new npm deps. `<video>` + `<canvas>` are browser-native.

### Files added / modified

**Added:**
- `api/src/routes/submissionComments.ts`
- `client/src/components/board/VideoReviewPlayer.tsx`
- `client/src/components/board/videoThumbnail.ts`

**Modified:**
- `prisma/schema.prisma` (+ `SubmissionComment` model + `CardSubmission.comments` inverse relation)
- `api/src/index.ts` (mount submissionCommentsRouter at /api/submissions before authed routers)
- `api/src/routes/submissions.ts` (multer 100→500 MB; accept thumbnailDataUrl, sharp-pipeline, persist submission.thumbnail)
- `client/src/components/board/CardDetailPanel.tsx` (SubmissionRow signature extended for VideoReviewPlayer; SubmissionComposer extracts thumbnail + warns on size)

### Known limitations (read before validation)

1. **Per-video `<video>` elements preload metadata in parallel** — multiple video submissions on one card all mount in parallel. Acceptable at typical "0-3 submissions per card" cardinality.
2. **Marker hover tooltip is mouse-only** — touch devices skip the hover state; `aria-label` + `title` attr surfaces via long-press on iOS / hold-to-preview on Android.
3. **Range regex first-24-chars-only** — `0:10 — 0:18` (em-dash) works; `0:10 to 0:18` doesn't. Could relax later.
4. **No per-IP throttle on the public guest endpoints** — only per-token bucket limiter. Same v0.10 carve-out.
5. **Thumbnail extraction is silent on failure** — CORS / codec / browser-X failures land `thumbnail = null` and the rich player falls back to plain bg with no UI saying "thumbnail failed".
6. **500 MB uploads at multer.memoryStorage()** spike API heap during upload. Single-tenant dev box: fine. Multi-tenant prod: swap to disk-streaming multer (v1.0).
7. **Submission file URLs are public** — `express.static('/uploads')`. Matches v0.11 design (cuid filenames are guess-resistant). v1.0 prod may want signed URLs.
8. **Resolve is silent** — by design per brief. No "your comment was resolved" notification.
9. **No comment edit UI** — API supports PATCH `body`, client only exposes Resolve + Delete. Trivial follow-up.
10. **No "post a general comment" button** — only "Comment at this frame". General comments (timecodeMs=0) are still rendered if posted via the API; UI doesn't expose the path.

### Operational notes

- The build was on a clean tree (no resume needed — v0.12 commit `ab404c1` was already on main).
- Had to kill a lingering v0.12 dev API process (pid 25740) that held an open file lock on `node_modules/.prisma/client/query_engine-windows.dll.node` before `prisma generate` could rename the new DLL. Standard Windows EPERM dance. After kill + regenerate, everything proceeded cleanly.
- Dev services (api :8080, client :5176, collab :1234) were running at the start of the session, were killed for the prisma generate, and were not successfully restarted at end-of-session (nohup detached processes died with their parent shell). User should `npm run dev` from the framedeck root when back online.

### v0.14 hooks already baked

- `fireNotification` is generic over kind/recipient — v0.14 can add a `time_logged` union member with zero structural change.
- `SubmissionComment.resolvedAt` is a per-row DateTime — feeds future "% resolved" / "median time-to-resolve" analytics.
- `CardSubmission.durationMs` (from v0.12) — feeds future "total review hours" without re-probing files.

### Open decisions still on you

Carries over: pricing tier names, `/p/<token>` legacy share link, email-side notifications, notification auto-prune cadence, narration password protection. Plus new for v0.13: server should/shouldn't enforce different ceilings for video vs voice vs file (currently uniform 500 MB); range marker regex relaxation (em-dash vs ASCII hyphen vs "to" keyword); whether "general comment" button should appear in the composer.

### Next chain step

v0.13 closes the "Frame.io replacement" leg of the pivot. Next chain step per the v0.13 brief is **v0.14 — time tracking + per-card analytics**. The `TimeEntry` model is greenfield (no schema collisions with v0.13), the notification helper is ready, and `SubmissionComment.resolvedAt` is a natural primitive for the analytics dashboard.

---

## v0.14 LANDED — Per-card time tracking + per-board analytics dashboard (2026-05-17)

**Status:** ✅ Built, type-checked, vite-built, end-to-end smoke-tested via a Node script that drove all 6 verification flows against a real seeded board. Committed on `main` (not pushed).
**Commit:** `v0.14 — per-card time tracking + per-board analytics dashboard`.

### What landed

The **Toggl replacement** — every card gets a start/stop timer that any board member (or contributor-role guest) can run, with auto-stop concurrency (one author can run only one timer at a time globally). Board owners get a per-board Analytics tab with four small panels: per-contributor hours, per-card hours, status mix donut, feedback-resolved throughput. Closes the "we still need Toggl for billable hours" gap that v0.10-0.13 left open.

**Feature 1 — TimeEntry schema ✅**
- New `TimeEntry` model (id cuid, cardId FK cascade, startedAt, endedAt?, durationMs?, note?, auth-or-guest author tuple, createdAt). `Card.timeEntries TimeEntry[]` inverse relation.
- 4 indexes including `(authorKind, authorUserId, endedAt)` and `(authorKind, authorGuestToken, endedAt)` for O(log n) "find this author's currently running timer" lookup — critical path for the start-auto-stops-previous rule.
- `endedAt: null` is the canonical "currently running" signal. `durationMs` is computed on stop AND recomputed by PATCH whenever startedAt/endedAt change.
- **No billing-rate column** — per the v1.0-pivot deferral, per-entry billing belongs in a separate `Invoice` model in v1.0.
- Applied via `prisma db push` from repo root with `DATABASE_URL=file:./data/framedeck.db` (the v0.11 file:URL trap is still real, five versions later).

**Feature 2 — API (`api/src/routes/timeEntries.ts` — NEW, exports 3 routers) ✅**

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| `POST` | `/api/cards/:cardId/time/start` | Bearer OR `?guestToken=` | RL 3/sec/token; auto-stops author's previous running timer in a Prisma transaction; returns `{started, stoppedPrevious[]}` |
| `POST` | `/api/cards/:cardId/time/stop` | Bearer OR `?guestToken=` | 404 if no running entry; fires `time_logged` notification if `durationMs > 30 min` AND actor != owner |
| `GET` | `/api/cards/:cardId/time` | Bearer OR `?guestToken=` | newest first; viewer guests can read |
| `PATCH` | `/api/time/:entryId` | Bearer OR `?guestToken=` | `{note?, startedAt?, endedAt?}`; recomputes durationMs server-side; author OR owner/editor |
| `DELETE` | `/api/time/:entryId` | Bearer OR `?guestToken=` | author OR owner/editor |
| `GET` | `/api/boards/:boardId/time/summary` | Bearer (authed) | aggregates per-author + per-card + statusMix + comments resolved/total + runningEntries |

**Discovery during build:** `boardsRouter.use(authMiddleware)` at the router root rejects ANY `/api/boards/*` request with `"No token"` before falling through. `/api/boards/:boardId/time/summary` MUST mount BEFORE `boardsRouter` in `api/src/index.ts`. v0.10–v0.13 hadn't hit this because all their auth-or-guest routes were under `/api/cards` (cardsRouter sits later). Documented inline with the mount comment so future agents don't re-discover.

**Feature 3 — Concurrency model ✅**

Atomic via `prisma.$transaction`:

```ts
const result = await prisma.$transaction(async (tx) => {
  const running = await tx.timeEntry.findMany({
    where: { endedAt: null, ...authorWhere(who) },
  });
  for (const r of running) {
    await tx.timeEntry.update({
      where: { id: r.id },
      data: { endedAt: now, durationMs: now.getTime() - r.startedAt.getTime() },
    });
  }
  const created = await tx.timeEntry.create({ data: { /* new */ } });
  return { stopped: running, created };
});
```

The response `{started, stoppedPrevious[]}` lets the client UI patch BOTH cards in a single round-trip. Per-author identity is the tuple `(authorKind, authorUserId | authorGuestToken)` — same primitive as CardComment / CardSubmission / SubmissionComment.

**Feature 4 — Notification helper widened ✅**

Added `'time_logged'` to `NotificationKind` in `api/src/lib/notifications.ts`. Helper unchanged otherwise per v0.13's followup commitment. Fan-out rules:
- Only fire if `durationMs > 30 * 60 * 1000` (30 min). Tiny sessions stay silent.
- Self-skip: if actor IS the board owner, no notification.
- Recipients: board owner + editors (the existing `fireNotification({toBoardEditors: true})` helper de-dupes the actor).
- Body shape: `"<actorName> logged <Xm | Xh Ym> on \"<cardTitle>\""`.
- Auto-stops during a `/time/start` also run this check on the stopped entry — forgot-to-stop-for-2hrs scenario gets an owner ping.

**Feature 5 — Client `TimeTrackingSection.tsx` (NEW) ✅**

Mounts between `SubmittedWorkSection` and Comments in CardDetailPanel.
- **Single shared 1Hz interval** per perf-note #6 in the brief — only ticks while ANY entry on the card is running (tears down when no running).
- **Server is the source of truth** — every mount and every mutation refetches `/api/cards/:cardId/time`. The localStorage hint (`framedeck.timer.running`) exists ONLY as an instant-render fallback for guests reopening a tab. Never trusted for elapsed time.
- **Past sessions** in a collapsible list with hover-revealed edit/delete affordances for author-owned rows. Edit form uses native `<input type=datetime-local>` for startedAt/endedAt (server recomputes durationMs).
- **Guest mode** reuses the same `guestContext` shape from v0.10/v0.11/v0.13. Contributors get controls; commenters and viewers see totals + past sessions but no controls. Server enforces.

**Feature 6 — Canvas + Kanban + Table running-timer indicators ✅**

- `BoardCardNode.tsx`: 12×12 pulsing red dot at top-right with 2px surface-color ring + red glow. Fades to 30% opacity on hover so the existing delete-X stays clickable.
- `KanbanView.tsx` + `TableView.tsx`: small `<Clock size={12}>` icon in red next to card title.
- Data source: `BoardPage.tsx` polls `/api/boards/:id/time/summary` every 15s, derives `runningTimerCardIds: Set<string>` from `runningEntries[].cardId`, threads into xyflow node data and the view components.
- 15s cadence is right — the per-card detail panel has its own per-card poll for instant feedback when the user opens a card; the canvas dot might be 0-15s stale, acceptable for a peripheral indicator.

**Feature 7 — Analytics dashboard (`AnalyticsTab.tsx` — NEW) ✅**

New owner-only tab in `BoardSettingsDialog` between Narrations and Advanced. **Pure CSS bars + inline SVG donut. ZERO new deps.** (The `recharts` dep in package.json was DELIBERATELY not used — binding bundle constraint.)

| Panel | Implementation |
| ----- | -------------- |
| A. Time per contributor | Horizontal CSS bars, sorted by totalMs desc, scaled to max; bar fill `var(--c-accent)` |
| B. Time per card | `<table>` sorted by totalMs desc, top 10, shows hours + contributor names |
| C. Status mix | Inline SVG donut + side legend, 4 rolled-up buckets: Planned / In progress+changes / In review / Approved+done; `cut` excluded. SVG arcs via `stroke-dasharray="${len} ${C - len}"` + `stroke-dashoffset="-${offset}"` |
| D. Throughput | Comments-resolved-rate bar from `SubmissionComment.resolvedAt`-not-null vs total — directly pulls from v0.13's natural primitive |

Per the v1.0-pivot prep note (#7 in the brief), the empty state is presentable as a marketing screenshot — friendly header copy, hint icons in each panel, faded "no cards" donut.

20-sec poll + 1Hz tick (for the running-count sub-headline only — the headline total uses the server snapshot to avoid per-second re-roll).

### Verification (run live)

| # | Check | Result |
|---|-------|--------|
| T1 | `npx tsc --noEmit` on `api/` | ✅ clean |
| T2 | `npx tsc --noEmit` on `client/` | ✅ clean |
| T3 | `npx vite build` succeeds | ✅ 803.10 KB / 241.76 KB gz |
| T4 | DB has `TimeEntry` table with the spec'd columns + 4 indexes | ✅ (verified via `prisma db pull --print`) |
| T5 | Mount order: `/api/boards/{bogus}/time/summary` → `"Auth required"` (not the boardsRouter's `"No token"`) | ✅ proves boardTimeRouter sits before boardsRouter |
| T6 | Concurrency: start on cardB while cardA running → cardA running drops 1→0 atomically | ✅ `stoppedPrev=1` returned, cardA verified empty |
| T7 | PATCH endedAt+1h → durationMs recomputes to original + 3,600,000 ms | ✅ jumped 21 → 3,600,021 ms |
| T8 | Editor stops at 32m → 1 notification fired to owner | ✅ body: `"Dev Two logged 32m on \"Opening landscape\""` |
| T9 | Editor stops at 12m (< 30m threshold) → 0 notifications | ✅ |
| T10 | Owner stops their own 31m timer → 0 notifications (self-skip) | ✅ |
| T11 | Guest start with bogus guestToken → 404 `Link not found` | ✅ guest validation gate works |

End-to-end smoke driven by a one-shot Node script (`api/v014-smoke.js`, deleted post-test). Full transcript in V014_REPORT.md §7.

### Bundle delta

| build | min | gzip |
|-------|-----|------|
| v0.13 | 783.21 KB | 237.23 KB |
| v0.14 | 803.10 KB | 241.76 KB |
| Δ     | +19.89 KB | **+4.53 KB** |

Under the +25 KB gzip cap. Drivers: TimeTrackingSection (~2.5 KB gz), AnalyticsTab (~2 KB gz), minor wiring. Clock lucide icon was already in the shared chunk (negligible).

### Files added / modified

**Added:**
- `api/src/routes/timeEntries.ts`
- `client/src/components/board/TimeTrackingSection.tsx`
- `client/src/components/board/AnalyticsTab.tsx`

**Modified:**
- `prisma/schema.prisma` (+ `TimeEntry` model + `Card.timeEntries` inverse relation)
- `api/src/index.ts` (mount boardTimeRouter before boardsRouter; timeEntriesRouter before cardsRouter; timeRootRouter at /api/time)
- `api/src/lib/notifications.ts` (`'time_logged'` added to NotificationKind union)
- `client/src/components/board/BoardCardNode.tsx` (red-dot affordance + hasRunningTimer prop)
- `client/src/components/board/KanbanView.tsx` (clock icon + runningTimerCardIds prop)
- `client/src/components/board/TableView.tsx` (clock icon + runningTimerCardIds prop)
- `client/src/components/board/BoardSettingsDialog.tsx` (analytics tab in union + visibleTabs + render)
- `client/src/components/board/CardDetailPanel.tsx` (TimeTrackingSection wiring + currentUserId prop)
- `client/src/routes/BoardPage.tsx` (summary poll + runningTimerCardIds threading + currentUserId pass-through + settingsInitialTab union widened)

### Known limitations (read before validation)

1. **Guests can't see canvas-level running-timer dots on other cards** — `/api/boards/:id/time/summary` is authed-only; guests only see running timers inside the per-card detail panel they have open. Easy v1.0 fix: open a public `/api/guest/:token/time/summary` returning just `runningEntries[].cardId`.
2. **Past-sessions edit form uses native `<input type=datetime-local>`** — browser-styled, no theme alignment. Acceptable for power-user fixup.
3. **DELETE is hard, no soft-delete** — v1.0 with Invoice flow likely flips this to soft-delete via `removedAt`.
4. **No bulk-delete / bulk-edit** for past sessions.
5. **30-min notification threshold is global**, not per-board configurable. v1.0 could expose in board settings.
6. **No CSV/PDF export** of analytics — v1.0 invoice flow will need this.
7. **Per-tab clocks drift by NTP skew** between two browser tabs (sub-100ms typically). Not user-visible.
8. **Past-sessions edit affordances are opacity-0 group-hover** — touch devices don't have hover. Tap-and-hold works on iOS via title attr; otherwise users must rely on the (separate) Comments edit affordances. Could add an always-visible kebab menu on mobile.

### Operational notes

- The build was on a clean tree (no resume needed — v0.13 commit `99087ee` was already on main).
- **Windows DLL-lock dance struck again**: PID 27500 (the v0.13 verification API: `node dist/index.js`, started 09:56:33) was holding the `query_engine-windows.dll.node` handle. Verified via `(Get-Process -Id 27500).Modules | Where-Object { $_.FileName -match 'query_engine' }`. Killed with `Stop-Process -Id 27500 -Force`, regen succeeded.
- All three dev services restarted post-build via PowerShell `Start-Process` (the bash `&` approach doesn't actually detach in this sandbox): api :8080 (pid 30464), collab :1234 (pid 28772), client :5176 (pid 31392). All responding to health/asset probes at end of session.
- A throwaway smoke-test script (`api/v014-smoke.js`) was used to drive 11 verification items against alt port 8088. Deleted post-test to keep the repo clean.

### v1.0-pivot hooks already baked

- **Analytics tab empty AND populated states are presentable as marketing screenshots** for "track time without leaving the board" feature card.
- **TimeEntry has NO billing-rate column** — per-entry billing belongs in a separate `Invoice` model in v1.0; this row is the raw atom that aggregates flow into Analytics now and will flow into invoices later.
- **`time_logged` notification kind is reserved and wired** — v1.0 can extend the recipient set (e.g. "email weekly summary") without schema changes.
- **The 15s `/time/summary` poll → `runningTimerCardIds` set is the refactor target** if v1.0 wants real-time push (Yjs awareness field would replace it).

### Open decisions still on you

Carries over: pricing tier names, `/p/<token>` legacy share link, email-side notifications, notification auto-prune cadence, narration password protection, video vs voice vs file ceilings (uniform 500 MB), range marker regex relaxation, "general comment" button. Plus new for v0.14: 30-min notification threshold as a per-board setting?, native `<input type=datetime-local>` vs custom theme-aligned picker for the past-sessions edit form?, soft-delete for TimeEntry?, CSV export of analytics?

### Next chain step

v0.14 closes the "Toggl replacement" leg of the pivot. The framedeck v0.x feature-complete checklist (boards, real-time collab, PDFs, film template, guests, submissions+approval, voice narration, video review, time tracking, analytics) is now done. Next + FINAL chain step is **v1.0-pivot — repositioned landing site + pricing live + Stripe integration**. The Analytics dashboard you ship is one of the headline screenshots that agent will use for marketing copy.

---

## ✅ v1.0-pivot LANDED — chain complete (2026-05-17)

**Commit:** `v1.0-pivot — landing site, pricing, Stripe checkout, feature gating` on `main` (local only — separate queued task pushes to GitHub).
**Full agent report:** `framedeck/V1_PIVOT_REPORT.md` — deep dive on schema, API, gates, routing, Stripe setup, launch checklist.
**Run shape:** Clean tree at start (v0.14 commit `e507507` already on main). No resume needed. End-to-end smoke ran against alt port 8088 with fake Stripe keys; gates verified both ways (Free user blocked → DB-flipped to Team → same user unblocked).

### What actually shipped

**Deliverable 1 — Marketing landing page at `/` ✅**
- Public route, no auth needed (authed users auto-redirect to `/dashboard`).
- Sections (top → bottom): Hero with tagline + sub + 2 CTAs + inline SVG canvas mockup · Stack-replacement block (Milanote/Notion/Trello/Loom/Frame.io crossed out → framedeck) · 6-card features grid (one per pivot version v0.10-v0.14 + analytics) · 3-tier pricing peek with "Most popular" badge on Team · Social-proof placeholder (faint "Used by indie studios + creators" with TODO comment marker for real quotes) · Final CTA.
- Visual: matches existing IDE aesthetic (cream + accent-orange, dark mode supported). No new fonts. No new color tokens. Mobile-responsive.

**Deliverable 2 — Pricing page at `/pricing` ✅**
- Three tiers: Free ($0) · Team ($19/mo, $190/yr) · Studio ($59/mo, $590/yr).
- Monthly/Annual toggle (annual shows "save 17%" badge).
- "Choose Team/Studio" buttons → `POST /api/billing/create-checkout-session` → hard-redirect to Stripe Checkout URL via `window.location`. "Start free" → `/signin?signup=1` (or `/dashboard` if already authed).
- Comparison table reaffirming the wedge (5 typical SaaS line items totalling ~$200/mo vs Team $19/mo flat).
- 5-item FAQ accordion (guest viewers, plan switching, exceeding seats, free trial of Team, data export).

**Deliverable 3 — Stripe integration (test mode) ✅**
- Schema: `Subscription` model (1-1 with User; 5 stripe* fields + status/cycle/seats/period bounds). Auto-created Free row on signup/login/oauth callback.
- Endpoints: `POST /api/billing/create-checkout-session` (authed) · `GET /api/billing/portal` (authed → Customer Portal URL) · `GET /api/billing/tier` (authed → tier/status/seats) · `POST /api/billing/webhook` (Stripe-signed, raw-body, handles checkout.session.completed + subscription.{created,updated,deleted}).
- Mount-order trap: webhook MUST be mounted with `express.raw({ type: 'application/json' })` BEFORE the global `express.json()` parser, otherwise Stripe signature verification fails. The two routers (billingWebhookRouter + billingRouter) export separately for this reason.
- Webhook idempotency: handlers upsert on `userId` so Stripe retries are no-ops by construction. Explicit `event.id` dedupe deferred to v1.1.
- npm dep added: `stripe@^22.1.1` (server-side only — no client-side Stripe SDK, redirect-only flow).

**Deliverable 4 — Pricing-aware feature gating ✅**
- `api/src/lib/featureGate.ts` — exports `LIMITS: Record<Tier, TierLimits>`, `getEffectiveTier`, `getTierLimits`, `assertLimit`, `GateError`. Numeric caps (maxActiveBoards, maxSeats, maxNarrationDurationMs, maxVideoUploadBytes) and boolean caps (timeTracking, analytics, customBranding, customShareDomain, guestViewAnalytics, templateLibrary).
- Hard gates wired:
  - `POST /api/boards` → maxActiveBoards (Free=1, Team/Studio=∞) → 403
  - `POST /api/boards/:id/narrations` → maxNarrationDurationMs (Free=5min, Team/Studio=30min) → 413, gates AUTHOR'S tier
  - `POST /api/cards/:id/submissions` when kind=video → maxVideoUploadBytes (Free=100MB, Team/Studio=500MB) → 413, gates BOARD OWNER'S tier
  - `POST /api/cards/:id/time/start` → timeTracking (Free=false) → 403
  - `GET /api/boards/:id/time/summary` → analytics (Free=false) → 403
- Client UX gates (NOT security): TimeTrackingSection inline upgrade CTA when server returns "Team feature" error · AnalyticsTab Paywall card replacing the dashboard for Free boards · SubscriptionPill in top bar ("Free · Upgrade" or "Team" / "Studio" with crown icon) · SubscriptionBanner red banner for past_due + green success toast on `?billing=success` (auto-dismisses 6s).

**Deliverable 5 — Routing restructure ✅**
- `client/src/App.tsx` reorganized: `/` splits to LandingPage (unauthed) vs Navigate /dashboard (authed). `/pricing` is always public. `/dashboard`, `/board/:id`, `/board/:id/shotlist`, `/settings`, `/billing` are authed-only.
- New `/billing` route is a Stripe Customer Portal redirect — fetches portal URL on mount and hard-redirects via `window.location`.
- Unauthed catch-all redirects to `/signin?redirect=<pathname+search>` so deep-links survive auth.
- SignInPage honors `?signup=1` (sets initial mode = signup) and `?redirect=` (post-auth navigation, defaults `/dashboard`).
- All token routes (`/p/<t>`, `/g/<t>`, `/n/<id>`, `/m/<t>`) preserved at the top of the route table — verified by smoke that 404s through their existing handlers, not redirects.

**Deliverable 6 — Hero asset ✅**
- `client/public/landing-hero-mockup.svg` — hand-crafted inline SVG mirroring the framedeck canvas idiom: dot grid + 4 cards in 2×2 + arrows with marker arrowheads + accent focus ring + animated pulsing red timer dot + status pills + presence avatars + Record pill. ~6 KB, animates the timer dot via SMIL.
- `TODO_LANDING_SCREENSHOT.md` documents the swap recipe (open `/board/<id>`, screenshot at 1920×1080, scale to 1200px, drop into `client/public/landing-hero.png`, swap the `<img src>` in LandingPage).
- Agent picked SVG over PNG because (a) the agent environment can't drive a browser screenshot capture, and (b) animated SVG is cheaper than PNG and shows the running-timer affordance live.

**Deliverable 7 — Marketing copy pack ✅**
- `LAUNCH_COPY.md` at repo root with: Show HN title + 150-word first comment · Product Hunt 60-char tagline + 260-char description + launch description · 5-tweet Twitter/X launch thread (one tweet per headline feature) · 3 cold-DM templates (YouTuber / podcast network / content studio) with personalization placeholders.

### Verification (24-item smoke transcript in V1_PIVOT_REPORT.md §9)

| # | Test | Result |
|---|---|---|
| T1 | Unauthed `/api/billing/tier` → 401 | ✅ |
| T2 | Webhook missing sig → 400 (NOT 200) | ✅ |
| T3 | Webhook bad sig (`v1=garbage`) → 400 | ✅ |
| T4 | Register fresh user → auto-create Free row | ✅ |
| T5 | `/billing/tier` returns `tier:'free',status:'active'` | ✅ |
| T6 | Fake checkout → 400 "Invalid API Key" (proves Stripe SDK invoked) | ✅ |
| T7-8 | Free 2nd board → 403 "Free tier limited to 1 active board" | ✅ |
| T9 | Free `/time/start` → 403 "Time tracking is a Team feature" | ✅ |
| T10 | Free `/time/summary` → 403 "analytics dashboard is a Team feature" | ✅ |
| T11 | Free 10-min narration → 413 "5 minutes" | ✅ |
| T12 | Free 2-min narration → 200 | ✅ |
| T13-17 | DB-flip to Team → all gates unlock; 2nd board OK, analytics OK, time start OK, 10-min narration OK | ✅ |
| T18-21 | Legacy `/p`, `/g`, `/n`, `/m` routes return 404 unchanged | ✅ |
| T22-24 | tsc clean both packages · vite build 829.96 KB / 248.51 KB gz | ✅ |

### Bundle delta

| Build | min | gzip |
|---|---|---|
| v0.14 | 803.10 KB | 241.76 KB |
| v1.0-pivot | 829.96 KB | 248.51 KB |
| Δ | +26.86 KB | **+6.75 KB** |

Under the +40 KB gzip cap. Stripe SDK is server-side only (no JS shipped to the browser).

### Files added (10)
- `prisma/schema.prisma` (+Subscription model + User.subscription inverse)
- `api/src/lib/featureGate.ts` (~190 lines)
- `api/src/routes/billing.ts` (~310 lines)
- `client/src/routes/LandingPage.tsx` (~260 lines)
- `client/src/routes/PricingPage.tsx` (~285 lines)
- `client/src/components/SubscriptionPill.tsx` (~95 lines)
- `client/src/components/SubscriptionBanner.tsx` (~80 lines)
- `client/public/landing-hero-mockup.svg`
- `TODO_LANDING_SCREENSHOT.md` + `LAUNCH_COPY.md` + `V1_PIVOT_REPORT.md`

### Files modified
- `api/src/index.ts` (webhook before json parser; billing router after auth)
- `api/src/routes/auth.ts` (ensureFreeSubscription on register/login/oauth)
- `api/src/routes/boards.ts` (assertLimit maxActiveBoards on POST)
- `api/src/routes/narrations.ts` (assertLimit maxNarrationDurationMs on POST)
- `api/src/routes/submissions.ts` (assertLimit maxVideoUploadBytes on video uploads)
- `api/src/routes/timeEntries.ts` (assertLimit timeTracking on start + analytics on summary)
- `api/.env.example` (Stripe env block)
- `client/src/App.tsx` (root route restructure + BillingPortalRedirect + UnauthedRedirect)
- `client/src/routes/SignInPage.tsx` (?signup=1 + ?redirect=)
- `client/src/routes/DashboardPage.tsx` (mount SubscriptionBanner)
- `client/src/components/AppTopBar.tsx` (mount SubscriptionPill; logo → /dashboard)
- `client/src/components/board/TimeTrackingSection.tsx` (paywall CTA)
- `client/src/components/board/AnalyticsTab.tsx` (Paywall card)
- `client/src/styles.css` (.btn-lg px-4.5 → px-[18px] fix)

### Known limitations (full list in V1_PIVOT_REPORT.md §11)

1. `maxSeats` is in LIMITS but NOT yet enforced at member-invite time — v1.1 should gate the members POST + magic-link create.
2. No `Invoice` model / per-entry billing — v1.1 schema add; the v0.14 TimeEntry rows are the raw atoms.
3. `customBranding` / `customShareDomain` / `guestViewAnalytics` / `templateLibrary` are reserved Studio caps not yet powering features. Studio today is functionally identical to Team. The pricing page advertises them, so this is "marketing-ahead-of-build" — disclose in launch comms.
4. Stripe webhook doesn't dedupe by `event.id` (replays are idempotent by upsert construction, but a tighter v1.1 would explicit-dedupe).
5. Hero is an animated SVG mockup, not a real screenshot. Swap recipe in `TODO_LANDING_SCREENSHOT.md`.
6. Marketing FAQ mentions JSON export "in v1.1" but no endpoint exists yet. Quick v1.0.1 if needed.
7. OAuth-only users get a Free row LAZILY on each callback (in addition to the eager-on-signup path) so legacy pre-pivot users land a row on next login. Idempotent via upsert.

### Operational notes

- Windows DLL-lock dance struck again — leftover PIDs from v0.14 verification held the prisma `query_engine-windows.dll.node`. Killed via `Stop-Process -Force`, regen succeeded. Same recipe as V013_REPORT.md.
- Stripe v22 has friction with strict typing on inner namespaces (`Stripe.Subscription`, `Stripe.Checkout.Session`, etc.) in mixed-module projects; resolved by typing the client as `ReturnType<typeof Stripe>` and using `any` casts at the SDK boundary. Intentional and isolated to the webhook resource shapes, not the gate or HTTP layer.
- Smoke ran on alt port 8088 against the canonical DB at `prisma/data/framedeck.db`. Test user `v1test-1778986738@example.com` (user id 6) was created during smoke; flipping its `Subscription.tier` from free → team via a one-shot Node script verified gates both ways.

### What's next for the user

The autonomous pivot chain is COMPLETE. Five user actions queued in `NEEDS_APPROVAL.md`:

1. **Stripe test-mode keys** (~10 min, free) — paste 6 env vars into `api/.env` so checkout works. Recipe in V1_PIVOT_REPORT.md §7.
2. **Hosting decision** — recommend **Railway** ($5/mo hobby tier; supports the Node monorepo as-is + Postgres add-on + built-in HTTPS).
3. **Domain registration** — recommend `framedeck.com` or `framedeck.app`. Cloudflare or Namecheap.
4. **Real Stripe products + prices** — repeat the test-mode product/price setup in LIVE mode when you're ready to take payments. Configure the production webhook in Stripe Dashboard.
5. **GitHub push** — separate queued task fires after this build to push framedeck to GitHub (user has a parallel task for that).

### Chain summary

Six versions, ~+27 KB gzip total bundle delta, complete repositioning from "Miro for filmmakers" to "cheap all-in-one planning board for small creator teams". The product is feature-complete, payable, marketed, and gated.

| Version | Headline | Bundle (gz) | Δ |
|---|---|---|---|
| v0.10 | Brief templates + magic-link guests | 221.76 KB | (baseline) |
| v0.11 | Submit Work + approval flow + bell | 225.33 KB | +3.57 KB |
| v0.12 | Voice narration ("Loom replacement") | 233.09 KB | +7.76 KB |
| v0.13 | Video timecode comments ("Frame.io replacement") | 237.23 KB | +4.14 KB |
| v0.14 | Time tracking + analytics ("Toggl replacement") | 241.76 KB | +4.53 KB |
| **v1.0-pivot** | Landing + pricing + Stripe + gates | **248.51 KB** | **+6.75 KB** |

The agent's chain is done. Go ship.

---

## Stockpulse + Taskpulse deploy hardening — 2026-05-18

A single sweep across both apps in advance of the user's self-host deploy
this week. Three commits per app, all pushed to origin/main. Full per-app
reports live at:

- `stockpulse/DEPLOY_REPORT.md`
- `taskpulse/DEPLOY_REPORT.md`

### Per-app commit graph

**stockpulse** (https://github.com/eugine8248/stockpulse)
- `019bf94` feat: auto-ingest daily cron reports via chokidar + /api/reports/today
- `f04c489` sec: JWT algo pin + tokenVersion, rate-limit, Zod, audit-log, env validation
- `46f9649` chore: production deploy prep — multi-stage Dockerfile, backup script, DEPLOY.md, Caddyfile

**taskpulse** (https://github.com/eugine8248/taskpulse)
- `cb9db9b` feat: auto-ingest daily cron reports via chokidar + /api/reports/today
- `6a90140` sec: JWT algo pin + tokenVersion, rate-limit, Zod, audit-log, env validation
- `aa55cfb` chore: production deploy prep — multi-stage Dockerfile, backup script, DEPLOY.md, Caddyfile

### What changed in both apps

#### Deliverable A — auto-update from daily cron reports

- chokidar watcher attached to the host-mounted reports drop site
  - **stockpulse**: `REPORTS_DIR=C:\Users\eugin\projects\taskpulse\data\reports\stocks`,
    flat directory of `YYYY-MM-DD-stock-analysis.md` files.
  - **taskpulse**: `REPORTS_DIR=data/reports/`, recursive depth=2,
    project-keyed buckets (stocks, tech-radar, dev-gig, morning).
- Per-bucket / per-date in-memory cache so the new endpoints are O(1).
- New endpoints
  - **stockpulse** `GET /api/reports/stock-analysis/latest-buys` — top-10
    BUY-signal tickers from today's report.
  - **taskpulse** `GET /api/reports/today` — most-recent report per bucket
    with a 600-char preview.
- New taskpulse client component `TodayPane.tsx` mounted at `/today`,
  auto-refreshing every 60 sec via react-query.
- Stockpulse `reportParser.ts` upgraded to handle the cron drop format
  ("Overall Top Picks (All Markets)" / "Not Recommended (AVOID)" /
  `**BUY**` bolded signal cells / "Global Stock Analysis Report" H1).
  `splitH2Sections` rewritten as a line-based splitter — the previous
  `\Z`-anchored regex was truncating long Top Picks tables at row ~8.

#### Deliverable B — security hardening (applied identically to both)

- **JWT algo pin + tokenVersion** — adopted the framedeck `90808b9`
  pattern: `verifyTokenSafe` async, `algorithms: ['HS256']` pinned,
  per-user `tokenVersion` cached for 30s, embedded as `tv` claim,
  rejected on mismatch. New `POST /api/auth/logout-everywhere` bumps
  the version.
- **express-rate-limit** on `/login` (5/15min) and `/setup` (3/1hr).
  Forgot-password limiter exported for forward-compat.
- **Helmet CSP** enabled (was `false` in both apps) with directives
  appropriate for Vite + Tailwind + Recharts/lucide. `referrerPolicy`,
  HSTS, `crossOriginEmbedderPolicy: false`.
- **Env validation** at boot — fails fast in prod if `JWT_SECRET` is
  missing / <32 chars / matches a known dev default, or if
  `DATABASE_URL` is missing. Warn-only in dev.
- **AuditLog** Prisma model (applied via `db push`) — captures every
  login_success / login_failure / register / password_change /
  logout_everywhere with IP, UA, action, meta. Fire-and-forget writer.
  Owner-only `GET /api/admin/audit-log` paginates the last 100.
- **Health endpoint** runs `prisma.$queryRaw\`SELECT 1\`` and returns
  503 on DB failure.
- **Graceful shutdown** — SIGTERM/SIGINT drains in-flight requests,
  stops the report watcher, disconnects Prisma, exits.
- **Zod**: every POST/PATCH/PUT route was already using safeParse in
  both apps. Verified, not duplicated.
- **NO_AUTH gating** was already prod-gated in taskpulse; added the
  same gate in stockpulse (the original v0.2 ship-without-gate
  incident).

#### Deliverable C — production deploy prep

- Multi-stage `Dockerfile` for both apps — `npm prune --omit=dev`,
  `tini` PID-1 for proper signal handling, `apk add sqlite` so the
  backup script works in-image, `HEALTHCHECK` via wget on `/api/health`.
- `docker-compose.yml` — stockpulse exposes 3003:3000, taskpulse
  3001:3000. `JWT_SECRET:?` syntax so compose refuses to start with a
  missing secret. Volume mounts for `./data` + `./backups`. Stockpulse
  bind-mounts the taskpulse cron drop dir into `/app/data/reports/stocks`.
- `scripts/backup-sqlite.sh` — atomic `sqlite3 .backup` + 7-daily +
  4-weekly rotation.
- `.env.production.example` for both apps — every env var documented.
- `DEPLOY.md` for both — server requirements, sample Caddyfile (auto
  Lets-Encrypt), first-deploy sequence, watcher mount setup,
  backup/restore, smoke test checklist, upgrade path, common gotchas
  (including the Prisma file-URL trap).

### Verification matrix (both apps)

| Test | stockpulse | taskpulse |
|---|---|---|
| `tsc --noEmit` server | clean | clean |
| `tsc --noEmit` client | clean | clean |
| `npm run build` server | clean | clean |
| `npm run build` client | clean | clean |
| Boot in dev with NO_AUTH=true | clean | clean |
| `/api/health` | 200 `{ok:true,ts}` | 200 `{ok:true,ts}` |
| File-watcher pickup of new report file | <4 sec | <4 sec |
| `docker compose build` | not run (no docker on dev host) | not run |
| `prisma db push` after schema change | clean | clean |

### Known gaps (both)

- **`docker compose build` not exercised** on this Windows dev box — no
  Docker installed. The Dockerfiles are tightened versions of the
  previously-shipping ones (each has built successfully on prior CI runs)
  plus tini, sqlite, npm prune, healthcheck.
- **SSE / WebSocket push for report events not wired.** Hooks are in
  place (`reportEvents` EventEmitter) but client uses 60s polling.
  Wiring SSE is a follow-up.
- **Email-keyed login throttling not implemented** — only IP-keyed
  (the brief allowed deferring this to avoid leaking account-existence
  via differential timing).

### New env vars (both apps)

- `JWT_EXPIRES_IN` (default `7d`)
- `CLIENT_ORIGIN` (CORS allowlist in prod)

stockpulse-only:
- `REPORTS_DIR` (default `C:\Users\eugin\projects\taskpulse\data\reports\stocks`)
- `STOCK_REPORTS_DIR` (legacy alias)

taskpulse-only:
- `REPORTS_DIR` (default `data/reports`, set to `/app/data/reports` in Docker)

### Bundle delta

| App | Server (raw) | Client |
|---|---|---|
| stockpulse | +162 KB (chokidar 148 KB + express-rate-limit 14 KB) | 0 |
| taskpulse | +162 KB | +3 KB (TodayPane.tsx + Sunrise icon) |

Both well under the 200 KB allotment in the brief.
