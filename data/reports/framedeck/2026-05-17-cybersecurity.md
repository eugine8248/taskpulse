# framedeck v0.14 — Cybersecurity Audit

**Critical:** 3 | **Important:** 7 | **Minor:** 6

Scope: read-only audit of v0.10 → v0.14 surface (guest links, submissions, narrations, timecode comments, time tracking, notifications). v1.0-pivot Stripe/billing surface was sampled but full review deferred per scope. Live API confirmed responding on `localhost:8080`. `npm audit` clean for `api/` and `collab/`; client `npm audit` flags one moderate dev-only esbuild advisory.

---

## 1. JWT — regression from the v0.4 fix (algorithm pin + tokenVersion revocation)

### CRITICAL — JWT algorithm pin LOST (`api/src/middleware/auth.ts:21`, `collab/src/index.ts:18`, `api/src/routes/guest.ts:451`)

The v0.4 audit explicitly fixed this: `jwt.verify(token, SECRET, { algorithms: ['HS256'] })`. All three call sites now read `jwt.verify(token, SECRET)` with NO algorithms option. With `jsonwebtoken` v9.0.2 the library's defaults are safer than v8 (it will not silently accept `alg: none`), so this is no longer a same-day RCE, but the explicit pin is a defense-in-depth requirement and was checked off in the prior audit. Downgrading or future bumps could re-introduce algorithm-confusion. Two of three call sites also share the env default `'dev-secret-change-me'` fallback if `JWT_SECRET` is unset.

**Exploit scenario:** If a future patch ships an asymmetric public key in `JWT_SECRET` (e.g. RS256 pub key reused as HMAC secret) the missing pin lets an attacker sign an HS256 token using the public key as the HMAC secret. Not exploitable today but the audit-required guard is gone.

**Recommended fix:** Re-add `{ algorithms: ['HS256'] }` to all three `jwt.verify` calls. Centralize through `verifyTokenSafe` so the duplicated path in `guest.ts:451` doesn't drift.

### CRITICAL — JWT revocation removed (no `tokenVersion` field; v0.4 fix lost)

The v0.4 fix added `User.tokenVersion` and stamped it into the JWT payload; password change + explicit "sign out everywhere" bumped it. The current `User` model has no `tokenVersion` column and `signToken({ userId })` carries nothing else. There is no logout / revocation primitive anywhere in `api/src/routes/auth.ts`.

**Exploit scenario:** A stolen JWT (leaked via referer header from a third-party plugin, browser extension exfil, server log accident, etc.) is valid for the full 7-day expiry. Even a deliberate "log me out of all devices" action would have no server-side effect — there is no way to invalidate a token short of rotating `JWT_SECRET` (which logs out every user globally).

**Recommended fix:** Re-add `User.tokenVersion Int @default(0)`; include it in the JWT payload; check on verify; expose `POST /api/auth/sign-out-all` that increments it; bump it on password reset.

---

## 2. Magic-link guest tokens

### IMPORTANT — guest token lookup is direct findUnique with no constant-time compare (`api/src/routes/guest.ts:48`)

`resolveGuestToken` does `prisma.guestLink.findUnique({ where: { token } })`. SQLite + Prisma will execute an indexed lookup whose latency is dominated by I/O, not string compare, so a practical timing oracle is unlikely. Token entropy is 16 random bytes = 128 bits which is fine. The bigger concern is that the token IS the access grant and travels in URL paths — see next.

**Exploit scenario:** Low-risk timing oracle (probably not exploitable across the internet); 128-bit entropy makes enumeration infeasible. Flagged for completeness.

**Recommended fix:** None required for entropy; consider an explicit `crypto.timingSafeEqual` if moving away from `findUnique`. More important: see referer issue below.

### IMPORTANT — guest token in URL path leaks via Referer (`api/src/routes/guest.ts:189`, client `/g/:token` route)

Guest URLs are of the form `/g/<32-hex-token>`. Any outbound navigation from that page (e.g. clicking a `submission.externalUrl` link, a markdown link in a comment body, a CDN-loaded image hosted externally) will send the full URL in the `Referer` header by default. A board owner who pastes a Frame.io link into a `kind='link'` submission and then a guest clicks it has just leaked the magic-link token to Frame.io's logs.

**Exploit scenario:** Board owner adds a `kind=link` submission pointing to an attacker-controlled site (or a third-party image hosted via a regular `<img>` tag in a card). Guest clicks / loads the resource. Attacker reads `Referer: https://app/g/<token>` from their server log and now has full role-scoped guest access until expiry / revoke.

**Recommended fix:** Send `<meta name="referrer" content="no-referrer">` (or `same-origin`) in the guest page HTML, and add `rel="noreferrer noopener"` to any external link the page renders. Alternatively redesign so the URL carries only an opaque id and the token rides in `sessionStorage` set via a one-shot redirect.

### MINOR — guest link expiry/revocation only checked on path-mounted endpoints, not consistently surfaced

`resolveGuestToken` checks `revokedAt` + `expiresAt` in `guest.ts`, `submissions.ts`, `submissionComments.ts`, `timeEntries.ts`. Consistent. Good. The minor: revoking a guest link does NOT cascade-invalidate `BoardNotification` rows where `recipientGuestToken = revokedToken`. If the guest re-uses an old polled-already URL they get a 404, so practical impact is nil; cleanup hygiene only.

---

## 3. Auth-or-guest endpoint boundary

### IMPORTANT — `kind='link'` `externalUrl` is unvalidated and writable by contributor guests (`api/src/routes/submissions.ts:242`, `:307`)

`externalUrl` is taken straight from the request body (`req.body.externalUrl.slice(0, 2000)`) with no URL parsing or scheme allowlist. A contributor guest can store `javascript:alert(1)` or `data:text/html,...`. If the client renders this as `<a href={s.externalUrl}>` the result is an XSS at click time. Spot-checked `CardDetailPanel`: anchors are rendered via React JSX so the URL ends up as an attribute. React does NOT block `javascript:` URLs in href as of 18+ — it warns in dev but renders in prod.

**Exploit scenario:** Contributor-role guest submits a `kind='link'` row with `externalUrl=javascript:fetch('/api/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('framedeck.token') }}).then(...)`. Owner clicks the link from the dashboard or card detail panel; the attacker exfiltrates the owner's JWT (which has no revocation — see §1).

**Recommended fix:** `z.string().url()` schema-validate; reject any scheme outside `http`/`https`/`mailto`. Add a runtime client guard that strips non-http(s) URLs.

### IMPORTANT — body-source `guestToken` permits in-body smuggling on non-mutating reads (`api/src/routes/timeEntries.ts:120`, `submissions.ts:101`, `submissionComments.ts:99`)

The resolvers accept guest token via EITHER `req.query.guestToken` or `req.body.guestToken`. On GET requests, body is normally absent; on POST it works as intended. The risk is when the SAME router is called from a client that mixes both: an authed user with a valid Bearer token plus a body-level `guestToken` will be resolved as the GUEST (the resolver checks guest-token FIRST, line 103/100/102 respectively). A misbehaving client could effectively downgrade itself to a guest identity for an action — minor today but worth flagging because guest authorship is used for `(authorKind, authorGuestToken)` tuple-based author-checks on PATCH/DELETE. A guest-mode write attributes to the guest token even when the JWT was also present.

**Exploit scenario:** Limited. Mostly a client correctness footgun. An attacker who has BOTH a JWT and a guest token can plant a record attributed to the guest, which they could later edit using just the token (no JWT). Not a privilege escalation, but breaks audit-trail attribution.

**Recommended fix:** Prefer JWT path when both are present, or reject if both are supplied.

### MINOR — viewer collaborator (authed) can read `CardComment` and `CardSubmission` (intended, but undocumented)

`resolveCardAccess` in `guest.ts:432` returns `mode:'user'` even for a viewer collaborator. POST endpoints check `canWrite` separately, so writes are blocked. Reads are permitted. This is consistent with the v0.4 viewer model but not stated in the V010 report.

---

## 4. Role enforcement matrix

### IMPORTANT — `assertLimit('timeTracking')` gates start but not stop / patch / delete (`api/src/routes/timeEntries.ts:227`)

A free-tier board owner cannot START a timer (gate at line 227). However the gate is ONLY on `/time/start`. `/time/stop`, `PATCH /api/time/:id`, `DELETE /api/time/:id`, and `GET /api/cards/:cardId/time` have no tier check. A user who downgrades from Team→Free with running timers can still stop+edit them indefinitely. Not a security issue per se but it's a billing-bypass on the gated feature: an attacker user could keep a `start` open from a trial window then patch `startedAt`/`endedAt` later for unlimited logged time.

**Recommended fix:** Gate the patch path too, or document the design.

### MINOR — viewer collaborator who was previously an editor can still withdraw/delete their old TimeEntry rows (`api/src/routes/timeEntries.ts:397`, `:459`)

Author-equal check uses `(authorKind, authorUserId)` tuple — works correctly. The minor wrinkle is that a downgraded viewer can still mutate their own past entries (note edits, time fixups, delete). The board owner expectation may be "viewer can't change anything." Documented behavior, but check intent.

### MINOR — `card.status` is auto-transitioned by guest submissions without owner gating (`api/src/routes/submissions.ts:393`)

A contributor-role guest who submits work auto-bumps `card.status` to `review`. A viewer/commenter can't, but a contributor can mass-set every card on the board to `review` by spamming `kind='text'` submissions (rate-limited to 3/sec — still 10k cards/hour). UX nuisance more than security; flag for awareness.

---

## 5. Upload security

### CRITICAL — base64 `thumbnailDataUrl` bypasses the multer fileFilter and pipes attacker-supplied SVG/whatever into sharp (`api/src/routes/submissions.ts:336-368`)

The video-submission code path accepts a `req.body.thumbnailDataUrl` text field, matches `^data:(image\/[a-z0-9+.-]+);base64,(.+)$`, decodes to a Buffer, and passes straight to `sharp(raw).rotate().resize().jpeg()`. The MIME regex allows `image/svg+xml`, `image/gif`, `image/tiff`, anything-starting-with-image. Sharp 0.33.5 has had multiple libvips-side CVEs over time (e.g. CVE-2024-3656, malformed SVG/HEIF). Today's `npm audit` is clean but the user-controlled input + image-codec stack is a classic risk surface, and the standard upload path (`multer({ fileFilter })`) only allows `image/*` MIME via the FILE multipart part — it doesn't see the base64-in-text-field thumbnail.

The base64 size cap is `< 4 * 1024 * 1024`, so the decoded buffer is ~3 MB — large enough for any libvips DoS payload.

**Exploit scenario:** Contributor-role guest POSTs `/api/cards/:cardId/submissions?guestToken=...` with `kind=video`, a tiny real video file, and a `thumbnailDataUrl=data:image/svg+xml;base64,...<libvips-exploit-svg>...`. The server runs `sharp(raw)` on attacker bytes. On a vulnerable libvips this is unauthenticated code execution / DoS / OOM. Even today on a patched libvips, malformed inputs can trigger native crashes; framedeck is single-process Node so crashing libvips kills the whole API.

**Recommended fix:** Reject any MIME beyond `image/jpeg|png|webp`; reject SVG. Wrap sharp in `try/catch` with a hard timeout. Move thumbnail processing to a worker process so a crash doesn't take down the API. Consider rejecting the base64 path entirely and accept thumbnails as a normal multipart file part that goes through `multer.fileFilter`.

### IMPORTANT — feature-gate runs AFTER the 500 MB multer upload completes (`api/src/routes/submissions.ts:177`, `:264`)

`multer({ limits: { fileSize: 500 * 1024 * 1024 } })` is mounted on the route. The `assertLimit('maxVideoUploadBytes')` for Free-tier owners (100 MB cap) runs AFTER multer has buffered the full body into memory at line 264. A Free-tier-owner board can be DoS'd: a contributor guest POSTs a 450 MB video; multer happily allocates 450 MB in Node heap before the gate trips. Multiple concurrent uploads can OOM the single-process API.

**Exploit scenario:** Contributor guest writes a loop POSTing 450 MB videos concurrently against a Free-tier owner's board. Each one passes multer, holds 450 MB, then is rejected at the tier gate. Node heap exhaustion.

**Recommended fix:** Send the limit at multer level based on the resolved board owner's tier (would require a two-pass: resolve owner tier from query string first, then mount a per-request multer instance), or switch to disk-streaming multer + early header-based abort. At minimum, cap multer at 100 MB and only widen when the owner is known-paid.

### IMPORTANT — Local-storage `/uploads/...` is publicly served with no auth (`api/src/index.ts:53`)

`app.use('/uploads', express.static(UPLOADS_DIR))`. Any uploaded file (card photo, submission video, narration audio, submission thumbnail) is served to anyone who knows / guesses the URL. URL shape: `/uploads/<userId>/<boardId>/<timestamp>-<6char>.ext`. The user/board parts are not secret (board IDs are cuid-shaped 25-char strings — high entropy) but the filename's random suffix is only 6 base36 chars (~30 bits). The full URL is leaked via the `audioUrl` field on every `/api/narrations/:id/replay` and every submission read. Anyone with a narration replay URL has the audioUrl. Anyone with a guestToken has every fileUrl.

This is a pre-existing v0.6 design choice. v0.12 amplified it: now PRIVATE board owners' voice narrations live under `/uploads/...` and are reachable by direct URL even if the user revokes the guest link. Soft-deleting a narration sets `removedAt` and (best-effort) removes the local file — but in S3 mode the comment explicitly says we leave the file in place.

**Exploit scenario:** Director records a private narration about a sensitive project, shares it with one collaborator via the replay URL. Collaborator forwards the audioUrl to a third party. Owner "deletes" the narration — replay API now 404s, but the third party still has the direct `audioUrl` and can fetch the audio file from `/uploads/...`. Local-storage removal is "best-effort" and on S3 it's documented as not removed.

**Recommended fix:** For local-storage: actually remove the underlying file on narration / submission delete (it's already attempted, verify it works). For S3: implement the deferred cleanup. Better: gate `/uploads/<userId>/...` behind an auth check (signed URL token) so revoking the narration also breaks the audio URL.

### MINOR — content-type validation is by Content-Type header only (`api/src/routes/uploads.ts:27`, `:38`, `submissions.ts:251`)

`fileFilter` checks `file.mimetype.startsWith('image/')` / `.startsWith('audio/')`. Multer takes mimetype from the client's multipart header, NOT from sniffing the file content. A `.exe` renamed to `.jpg` with header `Content-Type: image/jpeg` passes the filter; sharp then rejects it (good), but if a future endpoint accepts the bytes without re-encoding (the v0.12 `/api/uploads/audio` endpoint writes raw bytes) the content type stored in the row reflects the client's claim, not reality.

**Recommended fix:** Use `file-type` (the npm package, ~1 KB gzip) to sniff magic bytes and reject mismatches.

---

## 6. Rate limiting

### IMPORTANT — in-process token buckets reset on every API restart and don't share across instances (`api/src/routes/guest.ts:66-91`, `submissions.ts:43-61`, `submissionComments.ts:32-50`, `timeEntries.ts:55-73`)

Four separate in-memory `Map<string, number[]>` buckets — one per router. Spec: 3 req/sec per token. Observations:

1. Each router has its OWN bucket — a contributor guest can issue 3 comment/sec + 3 submission/sec + 3 sub-comment/sec + 3 time-tracking/sec = 12 req/sec total across endpoints.
2. Bucket keys ARE per-token (`subm:guest:<token>`), so token enumeration via the limited endpoints does NOT amplify — good.
3. The window is sliding 1 sec; on restart all counters reset. An attacker with restart capability (or who waits 1 sec) can always burst.
4. Buckets are per-process. If the API is ever scaled to multiple node processes (cluster mode / Docker replicas / PM2 multi-worker) each process gets its own bucket — a 4-replica deploy allows 12 req/sec per replica = 48 req/sec per token in aggregate.

The spec says "in-process" so this matches design intent, but I think the spec author didn't account for the multi-router fragmentation.

**Exploit scenario:** Guest enumerates a card's submission feed at 12 POSTs/sec. Or, post-multi-replica scale-out, 48 POSTs/sec per token. Not a single-flow attack but enough to do real DB write damage over a day.

**Recommended fix:** Centralize buckets across routers (single shared module). For multi-process scale-out, swap to `express-rate-limit` + a `rate-limit-redis` store. At minimum, also cap by IP (currently no IP-based limiter anywhere).

### MINOR — bucket cleanup interval has a subtle leak under high churn (`api/src/routes/guest.ts:85-91`)

The 60s cleanup interval prunes empty buckets but does NOT cap total bucket count. An attacker that rotates through many random `guestToken` strings (most of which 404 at `resolveGuestToken`) doesn't add buckets — good. But every successful contributor guest holds a bucket forever (modulo idle pruning). On a large-tenant deploy, bucket map size = #active guest tokens, which is unbounded.

---

## 7. Notification fan-out

### IMPORTANT — `fireNotification({ toBoardEditors })` correctly scopes by `boardId`, but the helper never checks the `cardId` belongs to the board (`api/src/lib/notifications.ts:55`)

The helper takes `boardId` + `cardId` + writes a `BoardNotification` with both. It does NOT cross-check that `cardId` actually belongs to `boardId`. Callers are expected to. Spot-checked the 5 call sites:

- `submissions.ts:404` — `cardId: card.id` resolved from access (good, same boardId)
- `submissionComments.ts:262/281/293/307` — `cardId: card.id` from access resolver (good)
- `timeEntries.ts:687` — `cardId: entry.cardId` where the entry is the just-stopped entry on the same card (good)
- `guest.ts:286` — `cardId: card.id` resolved (good)

All current callers cross-check via `resolveCardAndAccess`. Still, the helper itself is fragile — a future caller could pass a stale cardId / wrong-board cardId and the link would deep-link to a card the recipient might not have access to (recipient is a board owner of a different board, link goes to /board/wrongBoardId#card-wrongCardId). 

**Recommended fix:** Have the helper assert `cardId` belongs to `boardId` before creating rows.

### MINOR — guest-targeted notifications are NOT cleared when the guest link is revoked (`api/src/routes/guest.ts:170-180`)

`DELETE /api/guest-links/:id` flips `revokedAt`. `BoardNotification` rows where `recipientGuestToken=<thatToken>` remain. The public GET endpoint at line 300 validates the token first (404 on revoked), so a revoked guest's notifications are unreachable in practice. But the rows accumulate. Minor hygiene.

### MINOR — notification body strings can include arbitrary user-supplied text (`api/src/routes/guest.ts:285`)

Notification `body` is template-rendered server-side with `${authorName} commented on "${card.title}": ${comment body}`. Recipients render this in the bell as plain text (React escapes by default), so XSS is blocked. But the body could include emoji/control characters that render oddly in the bell. Minor cosmetic.

---

## 8. Time-tracking concurrency

### MINOR — `$transaction` is SQLite-serializable today; not portable to Postgres (`api/src/routes/timeEntries.ts:256-287`)

The atomic auto-stop is correct under SQLite (DB-level write lock). On Postgres without explicit `Serializable` isolation, two concurrent `start` calls from the same user (two tabs, near-simultaneous) could both find no running entries inside their respective transactions and both create new ones — violating the "at most one running timer globally" invariant. Today the schema is SQLite-pinned (`provider = "sqlite"`) so this is fine, but the v1.0-pivot doc mentions Postgres readiness. Flag for the migration.

**Recommended fix:** When migrating to Postgres, add `{ isolationLevel: 'Serializable' }` to the `$transaction` options OR add a partial unique constraint like `CREATE UNIQUE INDEX one_running ON TimeEntry(authorKind, authorUserId) WHERE endedAt IS NULL` (and equivalent for guest tokens).

---

## 9. WebSocket / Yjs collaboration

PASS. `collab/src/index.ts:14-32` validates the JWT (with the same missing-algorithms-pin from §1 — same fix) and checks `board.ownerId === userId || collaborators.some(c => c.userId === userId)`. Guests have no JWT so they cannot connect. Confirmed in `client/src/hooks/useYjsBoard.ts:77` — Yjs provider is mounted only when `localStorage.framedeck.token` is non-empty. Guests are correctly EXCLUDED from Yjs broadcast per the v0.10 design.

No findings for this section.

---

## 10. Stripe webhook (v1.0-pivot — partial review only)

Per scope instruction, full v1.0-pivot audit is deferred. Spot observations only:

### MINOR (defer to v1.0 audit) — webhook mount order is correct (`api/src/index.ts:48-50`)

`/api/billing/webhook` is mounted with `express.raw({ type: 'application/json' })` BEFORE the global `express.json({ limit: '2mb' })`. `billing.ts:239` verifies the signature against the raw `req.body` Buffer. Looks right; the comment explicitly calls out the trap.

### MINOR (defer) — no idempotency / replay-protection beyond Stripe's signature

Stripe's signature includes the timestamp and is rejected if older than 5 min (default `tolerance`). No application-level idempotency store on `event.id`. If Stripe retries an event delivery, `applySubscriptionState` runs twice; it's idempotent via `upsert` so practical impact is nil. Flag for v1.0 audit.

### MINOR (defer) — `tierFromPriceId` falls back to substring match (`api/src/routes/billing.ts:97,103`)

If env vars aren't set, the resolver does `priceId.includes('team')` / `'studio'`. An attacker who can name a Stripe Price could exploit this — but the price IDs come from Stripe in webhook-verified events, not user input. Low risk; still, the substring fallback is sloppy.

---

## 11. JWT — see §1

(Combined above.)

---

## 12. CORS

### MINOR — `cors({ origin: true, credentials: true })` reflects ANY origin with credentials (`api/src/index.ts:40`)

`origin: true` reflects the request's `Origin` header back as `Access-Control-Allow-Origin`. Combined with `credentials: true`, any browser on any origin can make credentialed requests to the API. framedeck doesn't use cookies for auth (JWT is in `localStorage`, set as `Authorization: Bearer`); cookies that DO exist (`COOKIE_SECRET` env hint) are session cookies for nothing user-facing.

Because the JWT is in localStorage (not a cookie), the per-origin reflection isn't immediately exploitable: an attacker site can't read the victim's localStorage from a different origin, and `Authorization: Bearer` doesn't auto-attach cross-origin. BUT: any future move to cookie-stored sessions (e.g. an `httpOnly` refresh token) becomes trivially CSRF-able from any third-party origin.

**Recommended fix:** Pin the allowed origin list explicitly (`CLIENT_ORIGIN` env, comma-split). Already half-baked — `index.ts:181` shows `process.env.CLIENT_ORIGIN`; just plumb it into `cors({ origin: ... })`.

---

## 13. Dependency security

### MINOR — esbuild GHSA-67mh-4wv8-2f99 (moderate, dev-only, transitive via vite) — `client/`

`npm audit --json` in `client/` flags one moderate advisory: `esbuild <=0.24.2` allows any website to send requests to the dev server. Effects: `vite` dev server only. NOT a prod concern — `vite build` output doesn't ship esbuild. Severity moderate, CVSS 5.3, requires user interaction.

`api/` and `collab/` audits: 0 vulnerabilities of any severity.

**Recommended fix:** Upgrade vite to a version that pulls esbuild >= 0.24.3 when it lands; until then, only run `vite dev` on localhost (current dev convention).

### MINOR — sharp 0.33.5 is current as of audit but the codec stack is broad

See §5 CRITICAL above. sharp itself is reasonably current; libvips bundled in sharp is the concern. No active CVE in npm audit. Pin in mind given the attacker-controlled-bytes flow.

---

## Coverage

Audited in depth: 1 (JWT), 2 (guest tokens), 3 (auth-or-guest), 4 (roles), 5 (uploads + sharp + storage), 6 (rate limit), 7 (notifications), 8 (time concurrency), 9 (Yjs), 12 (CORS), 13 (deps).

Partially audited (per scope): 10 (Stripe — deferred to next audit per scope; spot-checked mount order + signature verify).

Not audited: 11 (folded into 1 to avoid duplication). OAuth Google callback flow (`auth.ts:114-168`) was read but not deeply analyzed — `prompt=select_account`, profile email used without an `email_verified` check (the v0.4 audit reportedly fixed this; verify on next pass). Password reset flow does not exist in the repo (no surface to audit). SQL injection surface is nil due to Prisma parameterization.
