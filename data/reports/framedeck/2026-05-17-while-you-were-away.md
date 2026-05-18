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

---

## ⏩ 2026-05-18 update — what changed since you last read this

**Closed (✅ done):**
- All 3 framedeck cyber CRITs from yesterday's audit: CRIT-1 (JWT algo pin), CRIT-2 (tokenVersion revocation), CRIT-3 (base64 thumbnail bypass). Commits `90808b9` + `ecde9b6` pushed to `github.com/eugine8248/framedeck`.
- framedeck v1.0-pivot landed `a73b332` — landing site, pricing page, Stripe checkout (test mode), feature gating, launch copy drafts.
- framedeck pushed to GitHub (`eugine8248/framedeck`).
- **callmap pushed to GitHub** as PUBLIC repo (MIT) — `github.com/eugine8248/callmap`. All 5 commits up to `e593bfc` (cleaner edges + click-to-isolate UI tweak).
- Version-string drift fixed in callmap (0.5.0 → 1.0.0 everywhere).
- Dev accounts promoted to Studio tier: `eugine8248@gmail.com` (id 1) + `dev2@framedeck.local` (id 2). 15 seats, annual cycle.
- Cron prompt patches: all 4 routine prompts (stock, tech-radar, dev-gig, morning-snapshot) now use KL date instead of UTC.
- Auto-pull script + Windows scheduled task: copies daily Drive outputs to `taskpulse/data/reports/{stocks,tech-radar,dev-gig,morning}/` at 5:30 AM KL.
- Gitaudit tunnel wired: `gitauditdev.alien-lee.com` working (200 from Cloudflare). CORS hardened to function-based allowlist.
- Framedeck tunnel config wired: `framedeckdev.alien-lee.com` allowed in Vite + CLIENT_ORIGIN/URL pointed at it.
- stockpulse + taskpulse + log-analyzer all committed + pushed.
- 5 memories saved (Prisma db-push trap, JWT regression pattern, auth-or-guest mount order, Windows DLL lock, framedeck positioning).

**Still standing — top of the list when you come back:**

1. **🔴 Rotate Google OAuth secret** `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` — leaked in chat 3 sessions ago, still in `gitaudit/server/.env`. ~5 min in Cloud Console. Do this BEFORE initializing gitaudit as a git repo (otherwise secret enters git history).

2. **🔴 Cloudflare tunnel for framedeck still 403** — `framedeckdev.alien-lee.com` not yet routed. Should target `localhost:5176`. The gitaudit tunnel works fine; only framedeck's is missing the cloudflared route.

3. **Gitaudit — not on GitHub yet** — needs `git init` + visibility decision. Default: private. After OAuth secret rotation, init with `.gitignore` covering `.env`, `data/*.db`, `node_modules`.

4. **Google OAuth Console** — add tunnel callbacks for both products:
   - `https://framedeckdev.alien-lee.com/api/auth/google/callback`
   - `https://gitauditdev.alien-lee.com/api/auth/google/callback`

5. **framedeck v1.0-pivot launch decisions** (NEEDS_APPROVAL):
   - Stripe test-mode keys (free, ~10 min)
   - Real Stripe products: 4 price IDs (Team/Studio × Monthly/Annual)
   - Hosting (Railway / Fly / Render)
   - Domain (recommend `framedeck.com` or `.app`)

6. **callmap v1.0 launch decisions** (NEEDS_APPROVAL):
   - C1: VS Code Marketplace publisher account (free, 5 min)
   - C2: Domain (recommend `callmap.dev`, ~$15/yr)
   - C3: Show HN / Product Hunt timing — Tue/Wed Pacific morning when ready

7. **Tier-2 audit items unfixed** — 12 framedeck IMPs + 14 minors; 8 callmap IMPs + 16 minors. All non-CRIT. Pick off whenever.

8. **Validate the framedeck pivot** — the 5-hour DIY pass (create each template, send magic-link, post Twitter demo, DM 5 small creators).

9. **Capture real callmap demo GIF + screenshots** — recipe at `callmap/packages/site/public/TODO_DEMO_GIF.md`. ~30 min with OBS/ShareX.

10. **Smoke-test the v0.10–v0.14 framedeck features physically** — list in this report under "Test what landed."

**In flight while you're remote (2026-05-18):**
- ~~Callmap redesign proposal — Obsidian/neural-net-style graph view~~ → ✅ **shipped**
- ~~stockpulse + taskpulse hardening + auto-update + deploy prep~~ → ✅ **shipped**

### Late-afternoon 2026-05-18 — what landed while you were out

**callmap v1.1.0** ✅ — 5 commits + `v1.1.0` tag pushed to `eugine8248/callmap`:
- `bde40e8` Map view core (force-directed orbs, per-file cluster halos)
- `c3ab16c` animations 1 (breathing, halo, ripple)
- `acf56a0` animations 2 (particle flow, settle, throb)
- `46cfaff` perf + a11y (Worker, prefers-reduced-motion, kbd nav)
- `5311a46` 3D easter egg (`gg` keypress, dynamic-imported, 367 KB gz lazy chunk)
- Initial bundle actually *shrank* 157 → 152 KB gz (Codicon dedupe)
- Map view itself is a lazy chunk — one-time "Preparing graph…" flash on first toggle
- Toggles: Activity Bar · status bar · palette · `Ctrl+Shift+G` · `gg` for 3D

**stockpulse + taskpulse hardening** ✅ — 3 commits each, all pushed:
- **Deliverable A — auto-update**: chokidar watcher on `data/reports/`; new `GET /api/reports/today` (taskpulse) + `GET /api/reports/stock-analysis/latest-buys` (stockpulse); new `TodayPane.tsx` UI route at `/today` in taskpulse. <4s end-to-end pickup verified.
- **Deliverable B — security stack** (applied identically to both): JWT algo pin HS256 + `tokenVersion` 30s-cached revocation (framedeck-pattern); rate-limit (login 5/15min, register/setup 3/hr per IP); helmet w/ CSP + HSTS + referrerPolicy; env validation on boot (refuses weak `JWT_SECRET` in prod); `AuditLog` model + admin `/api/admin/audit-log`; health endpoint with DB ping (503 on fail); SIGTERM/SIGINT graceful shutdown; `POST /api/auth/logout-everywhere`.
- **Deliverable C — deploy prep**: multi-stage Dockerfile (tini + sqlite + npm-prune + HEALTHCHECK); docker-compose with `JWT_SECRET:?` fail-fast and volume mounts for `data/`; `scripts/backup-sqlite.sh` (atomic via `sqlite3 .backup`, 7-daily + 4-weekly rotation); `.env.production.example` template; **`DEPLOY.md`** with sample Caddyfile (auto Let's Encrypt SSL).
- **DB schema additions** (both apps, via `prisma db push`): `User.tokenVersion`, `AuditLog` table with 3 indexes.
- Reports at `stockpulse/DEPLOY_REPORT.md` and `taskpulse/DEPLOY_REPORT.md`.

**Known gaps (small, documented in DEPLOY_REPORT.md):**
- `docker compose build` not exercised locally (no Docker on this Windows box). Dockerfile is a tightening of the previously-shipping one.
- SSE/WebSocket push for report events not wired — clients still poll at 60s. EventEmitter scaffolded for a 1-file follow-up.
- Email-keyed login throttling deferred; IP-keyed only (brief allowed this).
