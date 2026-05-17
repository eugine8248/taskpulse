# While You Were Away — 2026-05-17

**Status snapshot.** Read this when you're back at the desk. Items grouped by what NEEDS your decision vs what's just running.

---

## 🔴 NEEDS YOUR DECISION / ACTION

### Security — pasted in chat earlier (rotate ASAP)
- **Google OAuth Client Secret** `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` was pasted in chat during the GitAudit auth setup. It's flagged in `gitaudit/NEEDS_APPROVAL.md`. **Rotate it at the Google Cloud Console.** ~5 min.

### callmap — blockers before public launch (all in `callmap/NEEDS_APPROVAL.md`)
- **C1** — VS Code Marketplace publisher account. Free, ~5 min. Without this the `.vsix` can't be published. Code ships either way; only the publish step waits.
- **C2** — Domain. Recommend `callmap.dev` (~$15/yr Cloudflare or Namecheap). Wires into README badges + docs site.
- **C3** — Show HN / Product Hunt launch timing. Drafts are at `callmap/packages/site/launch/show-hn.md` + `product-hunt.md`. Pick a Tuesday/Wednesday morning Pacific when ready.
- **Real screenshots + demo GIF** — agent shipped SVG mockups; capture recipe at `callmap/packages/site/public/TODO_DEMO_GIF.md`. ~30 min with OBS or ShareX.
- **Push callmap to GitHub** — task #60 (framedeck) is queued; consider doing callmap at the same time. `gh` CLI not yet installed (`winget install --id GitHub.cli`).

### framedeck — v1.0-pivot will add these to your queue
- **Stripe test-mode keys** — free, ~10 min. Sign up at stripe.com, copy Secret Key + Webhook Secret, paste into `api/.env`. Without these the billing endpoints render but checkout 500s.
- **Hosting decision** — Railway / Fly.io / Render. (You may have notes from the v0.4 era on this.)
- **Domain registration** — recommend `framedeck.com` or `framedeck.app`.
- **Real Stripe products + prices** — create Team Monthly, Team Annual, Studio Monthly, Studio Annual in Stripe dashboard, copy the 4 `price_xxx` IDs into env vars.
- **Postgres vs SQLite for prod** — legacy decision from v0.5 era. SQLite has carried through fine; only revisit if you need multi-region or > 100 concurrent writers.

### Test what landed
- **callmap (PID 32944, release v0.5)** is open. Verify the cleaner edges + click-to-isolate feel right. Paste `https://github.com/sindresorhus/p-queue/pull/245` to load the canonical test graph, then click any node to see the isolate-neighbors highlight.
- **framedeck v0.10-v0.14** — running locally at `192.168.1.49:5176` (or `localhost:5176`). Things to try:
  - Click "+ New board" → template picker (v0.10) → pick "Editor brief"
  - Board settings → Guest links → create a "contributor" link → open in private browser, leave a comment, submit a photo
  - On a card with a video submission, click the scrub bar at 0:12, leave a timecode comment (v0.13)
  - Click "Record narration" in board toolbar → walk through 3 cards talking → finish → grab the replay link → open in private browser (v0.12)
  - Per-card timer: start → switch to another card and start → previous auto-stops → see the running red dot move (v0.14)
  - Board settings → Analytics tab → see the dashboard (v0.14)

### Obsidian decision (from earlier conversation)
- Verdict was MAYBE-GO with narrow scope (Strategy / Lessons / Reading folders only — don't try to make it the center).
- ~1 hour setup if you commit.
- Open offer: I can draft initial vault structure + port the framedeck pivot diagnosis + callmap diagnosis + Prisma db-push lesson as ready-to-paste markdown when you say go.

---

## 🟢 RUNNING / AUTONOMOUS (no action needed)

### Build chain
- **framedeck v1.0-pivot** ✅ landed (`a73b332` on `main`) — landing page at `/`, pricing page at `/pricing`, Stripe checkout + webhook + customer portal (test mode), Subscription schema with auto-Free on signup, feature gating (Free: 1 board, no analytics, no time-tracking, 100MB video cap, 5min narration cap), launch copy at `LAUNCH_COPY.md`. Bundle delta +6.75 KB gz. **24/24 smoke tests passed live on :8088.**
- **Total chain delta v0.10 → v1.0-pivot:** +26.75 KB gzip for the entire repositioning. Repo is 6 commits ahead of nothing (no remote yet).

### Push framedeck to GitHub (BLOCKED ON YOU)
Task #60 is queued but **I can't execute it while you're away** because:
1. `gh` CLI isn't installed (`winget install --id GitHub.cli` needed)
2. `gh auth login` is interactive — opens browser or asks for paste
3. You haven't confirmed **public vs private** repo visibility

**My recommendation when you're back:** private (commercial product with pricing/Stripe), but say so explicitly. Push command sequence ready:
```powershell
winget install --id GitHub.cli
gh auth login
cd C:\Users\eugin\projects\framedeck
gh repo create framedeck --private --source=. --remote=origin
git push -u origin main
```

### Audits (fired while you're away)
- **framedeck cybersecurity + QA re-audit** — first audit since v0.4. Focus on the v0.10-v0.14 surface: magic-link tokens, guest auth boundary, submission/video uploads, time entry concurrency, Stripe webhook security. **Read-only — won't fix without your permission.**
- **callmap cybersecurity + QA audit** — first ever. Focus on PAT storage, WASM sandbox, VS Code webview CSP, GitHub API handling, parser edge cases, release pipeline security. **Read-only.**

Reports will land at:
- `taskpulse/data/reports/framedeck/2026-05-17-cybersecurity.md` ✅ **landed: 3 CRIT · 7 IMP · 6 MIN** 🚨
- `taskpulse/data/reports/framedeck/2026-05-17-qa.md` ✅ **landed: 1 CRIT · 6 IMP · 9 MIN**
- `taskpulse/data/reports/callmap/2026-05-17-cybersecurity.md` ✅ **landed: 0 CRIT · 5 IMP · 9 MIN**
- `taskpulse/data/reports/callmap/2026-05-17-qa.md` ✅ **landed: 0 CRIT · 3 IMP · 7 MIN**

### 🚨 framedeck audit — CRITICAL findings (read this when you're back)

Three of these are **regressions** of bugs the May v0.4 audit specifically fixed. Somewhere in v0.10-v0.14 the hardening got wiped.

**CYBER-CRIT-1: JWT algorithm pin LOST** (`api/src/middleware/auth.ts:21`, `collab/src/index.ts:18`, `guest.ts:451`)
The v0.4 audit added `{ algorithms: ['HS256'] }` to every `jwt.verify` call. All 3 call sites are now missing it. With jsonwebtoken v9 this is much lower severity than v8 (alg=none is auto-rejected) — but the defensive pin is gone.

**CYBER-CRIT-2: JWT revocation removed**
v0.4 added a `tokenVersion` column on User + cache-backed bump-on-rotate primitive. Both are gone. A stolen JWT is valid for the full 7-day expiry with **no way to revoke**. Means a leaked token at signin = 7 days of full access until natural expiry. Highest priority of the three CRITs.

**CYBER-CRIT-3: Base64 thumbnailDataUrl bypasses multer + pipes attacker bytes into sharp** (`submissions.ts:336-368`)
v0.13's client-side thumbnail extraction sends a base64 JSON payload that bypasses multer's file-filter. MIME regex allows SVG/anything-image. A contributor-role guest can trigger sharp on up to 4 MB of arbitrary bytes — the **classic libvips attack surface** (multiple historical CVEs).

**QA-CRIT: Postgres serialization gap** in time-tracking `$transaction`
Works today on SQLite (DB-level lock). The documented v1.0 Postgres readiness will **break the "≤1 running timer per author" invariant** unless you add `isolationLevel: 'Serializable'` or a partial unique index. Pre-Postgres migration must fix.

### Other framedeck items worth your attention
- **CYBER-IMP**: Guest-token-in-URL leaks via Referer header (XSS-equivalent if guest clicks external links)
- **CYBER-IMP**: `kind=link` `externalUrl` not validated — `javascript:` URLs would render through React JSX
- **CYBER-IMP**: Feature-gate runs AFTER multer buffers 500 MB into memory (DoS vector on Free tier)
- **CYBER-IMP**: `/uploads/...` served by `express.static` unauthenticated — narration audio reachable by direct URL even after revoke
- **CYBER-IMP**: Rate-limit buckets fragmented per-router (aggregate is ~12 req/sec per token, not 3)
- **QA-IMP**: Four routers do `findCard` BEFORE auth check, leaking card-existence to unauthed callers
- **QA-IMP**: ~7 unbounded list endpoints (no pagination) — will degrade on big boards

### My recommendation when you're back

**Highest-priority fix**: CYBER-CRIT-2 (JWT revocation). It's the one with the most exposed attack window (7 days of stolen-token validity).

The 3 cyber CRITs are all 1-2 hour fixes each. The QA CRIT (Postgres serialization) is only a fix-now item if you're about to migrate; can wait if you're staying on SQLite for v1.0 launch.

**I will NOT fix any of these without your explicit go-ahead** — same protocol as the May audit pass.

### callmap audit — top items worth your attention

**Verdict: ship-able.** No critical findings. Read the full reports for detail; here are the items that need your decision:

1. **Version-string drift (QA-IMP)** — README + site say v1.0 but every `package.json`, `Cargo.toml`, `tauri.conf.json`, and the existing `.vsix` still say **0.5.0**. **Must bump before any public tag / GitHub release / marketplace publish.** ~5 min fix.
2. **Dev-mode white screen explained (QA-IMP)** — root cause is `?worker&inline` resolving `@callmap/core/parseWorker` through the workspace symlink, eagerly evaluating `web-tree-sitter` whose internal `eval` calls trip Vite's dev worker plugin. Production builds bundle at build-time and sidestep it. Fix: switch to plain `?worker` (non-inline). One-line change. This explains the white screen we hit earlier today when I tried to launch dev mode.
3. **GitHub API URL not allowlisted (CYBER-IMP)** — `http:request` accepts any `api.github.com` URL. Should narrow to specific path patterns.
4. **Tauri CSP is `null` (CYBER-IMP)** — no defense-in-depth if highlight.js ever regresses. Combined with 2× `dangerouslySetInnerHTML` in SourcePanel, recommend setting a strict CSP + adding DOMPurify.
5. **Recent PRs leak between humans on a shared Windows account (QA-IMP)** — localStorage isn't user-scoped. Edge case; only matters if multiple humans share an OS account.

The 5 cyber findings are all v1.1-grade hygiene — nothing blocking ship. The version-string drift IS blocking a clean v1.0 release tag, though.

### Services running locally
- framedeck api on `:8080`
- framedeck client on `:5176`
- framedeck collab on `:1234`
- callmap.exe (release build PID 32944)
- 4 morning routines fired clean today (all in Drive: stock, tech radar, dev gig, morning snapshot)

---

## ✅ COMPLETED THIS SESSION (for reference)

- **callmap v0.4** — workspaces refactor + VS Code extension port
- **callmap v0.5** — perf, search, minimap, bookmarks, code-split, OS-keychain PAT, pagination
- **callmap v1.0** — docs site, launch copy, GitHub Sponsors, CI + release pipeline, README polish
- **callmap UI tweak** — cleaner edges + click-to-isolate (release rebuilt + launched)
- **framedeck v0.10** — role-based brief templates + magic-link guest access
- **framedeck v0.11** — Submit Work zone + approval flow + in-app notifications
- **framedeck v0.12** — voice narration + replay links + per-card voice notes
- **framedeck v0.13** — video timecode comments + scrub-bar markers + client-side thumbnails
- **framedeck v0.14** — per-card time tracking + per-board analytics dashboard
- **framedeck auth bug fix** — converted useAuth to AuthProvider Context (the "must refresh after login" loop)
- **framedeck dev infra** — restored API on 8080 (env had wrong key), restarted collab
- Framedeck market viability diagnosis + freelancer-handoff pivot positioning

---

## When you're back

The next interaction, I'll lead with this report's headline. The autonomous chain may have finished by then — if so I'll surface the v1.0-pivot results + execute the GitHub push (with the public/private confirmation).
