// Idempotent-ish seed: wipes user 3's existing boards + labels, then creates
// 5 project boards (framedeck, callmap, stockpulse, taskpulse, gitaudit)
// with a unified 5-column shape + universal labels + populated cards
// from the ongoing task list as of 2026-05-18.
//
// Pin cap = 3. Pins set: OAuth secret rotation, framedeck Cloudflare tunnel,
// taskpulse+stockpulse deploy this week.

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const USER_ID = 3;
const COLUMNS = ['Up Next', 'In Progress', 'Blocked', 'Review', 'Done'];

const LABELS = [
  'security',
  'audit',
  'launch-prep',
  'infra',
  'bug',
  'polish',
  'validation',
];

// Card shape: { column, title, description, priority, labels?, pin?, due? }
const projects = [
  {
    name: 'framedeck',
    cards: [
      // ---- Blocked: external action needed ----
      {
        column: 'Blocked',
        title: 'Configure Cloudflare tunnel for framedeckdev.alien-lee.com',
        description:
          'Tunnel currently returns 403 Forbidden from Cloudflare. Set up the cloudflared route to point at localhost:5176 (the Vite client; Vite proxies /api → localhost:8080 and /collab WS → ws://localhost:1234, so one tunnel rule covers everything).',
        priority: 'urgent',
        labels: ['infra'],
        pin: true,
      },
      {
        column: 'Blocked',
        title: 'Sign up for Stripe test-mode keys + create products',
        description:
          'Required to unlock the v1.0-pivot billing path. Steps:\n1. stripe.com → sign up\n2. Copy Secret Key + Webhook Secret into api/.env\n3. Create 4 products: Team Monthly, Team Annual, Studio Monthly, Studio Annual\n4. Copy the 4 price_xxx into env vars (STRIPE_PRICE_TEAM_MONTHLY/ANNUAL, STRIPE_PRICE_STUDIO_MONTHLY/ANNUAL)\n5. Add webhook endpoint pointing at https://framedeckdev.alien-lee.com/api/billing/webhook',
        priority: 'high',
        labels: ['launch-prep'],
      },
      {
        column: 'Blocked',
        title: 'Add framedeck tunnel callback to Google OAuth Console',
        description:
          'Add `https://framedeckdev.alien-lee.com/api/auth/google/callback` to Authorized redirect URIs for the OAuth 2.0 Client ID. Without this, sign-in-with-Google bounces from the tunnel.',
        priority: 'medium',
        labels: ['infra'],
      },
      {
        column: 'Blocked',
        title: 'Decide framedeck production host',
        description:
          'Options: Railway (recommended for low-friction Docker deploys), Fly.io (free tier still ok for SQLite single-region), Render. Whichever — they all read the existing Dockerfile.',
        priority: 'medium',
        labels: ['launch-prep'],
      },
      {
        column: 'Blocked',
        title: 'Register framedeck domain',
        description: 'Recommend framedeck.com or framedeck.app. ~$15/yr at Cloudflare Registrar or Namecheap.',
        priority: 'medium',
        labels: ['launch-prep'],
      },

      // ---- Up Next ----
      {
        column: 'Up Next',
        title: 'Run 5-hour pivot validation pass',
        description:
          'The DIY validation plan from the v0.10 scaffold report:\n1. Create 1 board of each template (Editor/Thumbnail/Illustrator/Animator/Sound/Podcast). ~30 min\n2. Generate a magic link, open in private browser, leave a comment + submit a photo. ~1 hr\n3. Screenshot Editor template + record 30-sec Loom + post on Twitter/X. ~1 hr\n4. DM 5 small creators (YouTubers, podcasters) offering free Pro for 15 min of feedback. ~2 hrs\n\nIf 2 of 5 say "this is genuinely better" → commit the 8-week full pivot. If 0 of 5 → revisit positioning.',
        priority: 'high',
        labels: ['validation'],
      },
      {
        column: 'Up Next',
        title: 'Fix tier-2 cybersecurity IMPs from 2026-05-17 audit (7 items)',
        description:
          'Standing audit findings, none CRIT-level (CRIT-1, CRIT-2, CRIT-3 already shipped):\n- Guest-token-in-URL leaks via Referer header (XSS-equivalent if guest clicks external links)\n- kind=link externalUrl not validated — javascript: URLs render through React JSX\n- Feature-gate runs AFTER multer buffers 500 MB into memory (DoS vector on Free tier)\n- /uploads/... served by express.static unauthenticated — narration audio reachable by direct URL even after revoke\n- Rate-limit buckets fragmented per-router (~12 req/sec per token aggregate, not 3)\n- CORS origin:true credentials:true is a trap for any future cookie-based auth\n- Stripe webhook signature verification not yet stress-tested\n\nFull list in taskpulse/data/reports/framedeck/2026-05-17-cybersecurity.md',
        priority: 'medium',
        labels: ['audit', 'security'],
      },
      {
        column: 'Up Next',
        title: 'Fix tier-2 QA IMPs from 2026-05-17 audit (6 items)',
        description:
          'Standing QA findings (one CRIT — Postgres serialization gap — only matters if migrating from SQLite):\n- 4 routers do findCard BEFORE auth check, leaking card-existence to unauthed callers\n- ~7 unbounded list endpoints (no pagination) — will degrade on big boards\n- Error string drift ("No token" vs "Auth required") for the same condition\n- Time-tracking summary does multi-query aggregation in app code, won\'t scale\n- Error response shape inconsistency between newer + older routers\n- v1.0-pivot Stripe/billing was deferred per scope; spot-check only\n\nFull list in taskpulse/data/reports/framedeck/2026-05-17-qa.md',
        priority: 'medium',
        labels: ['audit', 'bug'],
      },
      {
        column: 'Up Next',
        title: 'Smoke-test v0.10–v0.14 features physically',
        description:
          'End-to-end verification checklist:\n- "+ New board" → template picker → pick "Editor brief"\n- Board settings → Guest links → create a contributor link → open in private browser, leave comment, submit photo\n- Click scrub bar at 0:12 on a video submission, leave timecode comment\n- Record narration → walk through 3 cards → finish → open replay link in private browser\n- Per-card timer: start on Card A → switch to Card B + start → previous auto-stops → red dot moves\n- Board settings → Analytics tab',
        priority: 'medium',
        labels: ['validation'],
      },
      {
        column: 'Up Next',
        title: 'Capture demo GIF + real screenshots for framedeck',
        description:
          'Currently using SVG mockups. Recipe: load https://framedeckdev.alien-lee.com (when tunnel works) in OBS or ShareX → record 15-sec demo → ffmpeg to GIF → swap into client/public/landing-hero-*.png. ~30 min.',
        priority: 'low',
        labels: ['polish'],
      },
      {
        column: 'Up Next',
        title: 'Address tier-2 cyber MINs (6) + QA MINs (9)',
        description:
          'Low-priority polish items from the 2026-05-17 audit. Pick off as time allows. Full list in the two audit reports under taskpulse/data/reports/framedeck/.',
        priority: 'low',
        labels: ['audit', 'polish'],
      },

      // ---- Done (recent wins, last 7 days) ----
      {
        column: 'Done',
        title: 'CRIT-3: Harden video thumbnail data-URL ingress (libvips attack surface)',
        description: 'Commit ecde9b6 — MIME allowlist (JPEG/PNG only) + magic-byte sniff + sharp failOn:error + 50 MP cap + 3 MB buffer cap.',
        priority: 'high',
        labels: ['security', 'audit'],
      },
      {
        column: 'Done',
        title: 'CRIT-1 + CRIT-2: Restore JWT algorithm pin + tokenVersion revocation',
        description: 'Commit 90808b9 — HS256 pinned across api + collab + guest; tokenVersion column on User with 30s cache; bumpTokenVersion helper for logout-everywhere.',
        priority: 'high',
        labels: ['security', 'audit'],
      },
      {
        column: 'Done',
        title: 'v1.0-pivot — landing site, pricing, Stripe checkout, feature gating',
        description: 'Commit a73b332 — landing at /, /pricing, Subscription schema, Stripe checkout test-mode, feature gates (1 board Free, no time-tracking Free, etc.), dashboard tier pill, launch copy drafts.',
        priority: 'high',
        labels: ['launch-prep'],
      },
      {
        column: 'Done',
        title: 'v0.10 → v0.14 pivot chain (templates, magic-link, submit-work, voice narration, video timecode, time tracking)',
        description: 'Complete feature build chain in 2 days. Bundle delta v0.10→v1.0-pivot: +26.75 KB gzip total for the entire repositioning.',
        priority: 'medium',
        labels: ['launch-prep'],
      },
      {
        column: 'Done',
        title: 'Promote dev accounts to Studio tier',
        description: 'Both eugine8248 (id 1) and dev2@framedeck.local (id 2) → Studio (15 seats, annual) for full-feature testing.',
        priority: 'low',
        labels: ['polish'],
      },
    ],
  },

  // =========================================================================
  {
    name: 'callmap',
    cards: [
      // Blocked
      {
        column: 'Blocked',
        title: 'C1 — VS Code Marketplace publisher account',
        description: 'Free, ~5 min. https://marketplace.visualstudio.com/manage → sign in with Microsoft account → create publisher → generate PAT at dev.azure.com (Marketplace → Manage scope, 1yr expiry). Required before `vsce publish` can ship callmap-1.1.0.vsix.',
        priority: 'medium',
        labels: ['launch-prep'],
      },
      {
        column: 'Blocked',
        title: 'C2 — Register callmap.dev domain',
        description: '~$15/yr at Cloudflare or Namecheap. Wires into README badges + Astro site <base> config.',
        priority: 'low',
        labels: ['launch-prep'],
      },
      {
        column: 'Blocked',
        title: 'C3 — Schedule Show HN / Product Hunt launch',
        description: 'Drafts ready at callmap/packages/site/launch/show-hn.md + product-hunt.md. Pick a Tuesday/Wednesday morning Pacific. Post manually (Show HN doesn\'t accept API).',
        priority: 'low',
        labels: ['launch-prep'],
      },

      // Up Next
      {
        column: 'Up Next',
        title: 'Capture real screenshots + demo GIF',
        description: 'Currently using SVG mockups. Recipe at callmap/packages/site/public/TODO_DEMO_GIF.md. ~30 min with OBS or ShareX:\n1. Launch callmap.exe (release build at packages/desktop/src-tauri/target/release/)\n2. Paste sindresorhus/p-queue#245 (canonical test PR)\n3. Record interactions: load → toggle Map view → click-to-isolate → 3D easter egg (gg) → bookmarks\n4. ffmpeg to GIF, ~3 MB, 24-30 fps\n5. Replace SVG fallbacks at packages/site/public/screenshot-*.svg',
        priority: 'medium',
        labels: ['polish'],
      },
      {
        column: 'Up Next',
        title: 'Address callmap tier-2 cyber IMPs (5 items)',
        description: 'No CRITs to fix. Hygiene items from 2026-05-17 audit:\n- http:request accepts any api.github.com URL (no path allowlist)\n- Tauri csp: null — no defense-in-depth if highlight.js regresses\n- shell:allow-open unscoped (could open mailto:/custom protocols)\n- openExternal accepts arbitrary URL strings unvalidated\n- GitHub Actions pinned by major tag rather than SHA\n\nFull list in taskpulse/data/reports/callmap/2026-05-17-cybersecurity.md',
        priority: 'medium',
        labels: ['audit', 'security'],
      },
      {
        column: 'Up Next',
        title: 'Address callmap QA IMPs (3 items) + minors',
        description: '- v03-parsers-smoke.mjs + v03-pipeline-smoke.mjs silently ENOENT (expect public/ at repo root, WASMs live at packages/desktop/public/)\n- Desktop recent-PRs leak between users on shared Windows account (localStorage not user-scoped)\n- Two parser smoke scripts need path fix\n\nFull list in taskpulse/data/reports/callmap/2026-05-17-qa.md',
        priority: 'low',
        labels: ['audit', 'bug'],
      },
      {
        column: 'Up Next',
        title: 'Verify v1.1.0 GitHub release workflow ran cleanly',
        description: 'The v1.1.0 tag push fires .github/workflows/release.yml → matrix-build Windows/macOS/Linux installers + .vsix → attaches to a draft GitHub Release. Check the release page on github.com/eugine8248/callmap and confirm all artifacts attached + sizes look right.',
        priority: 'medium',
        labels: ['validation'],
      },

      // Done
      {
        column: 'Done',
        title: 'v1.1 Map view — 5 phases shipped (Obsidian/neural-net redesign)',
        description: 'Force-directed orbs · per-file cluster halos · zoom-adaptive labels · particle flow animations · 3D easter egg (gg keypress) · prefers-reduced-motion · web-worker for big graphs. Initial bundle SHRANK 157→152 KB gz (Codicon dedupe). Lazy chunks: Map 15 KB gz, 3D 367 KB gz. Tag v1.1.0 pushed.',
        priority: 'high',
        labels: ['launch-prep'],
      },
      {
        column: 'Done',
        title: 'v1.0 launch package — site, docs, release pipeline, README polish',
        description: 'Commit 2db7170 — Astro docs site + landing + auto-generated changelog · Show HN + PH copy drafts · GitHub Sponsors · CI + matrix release pipeline · README/CONTRIBUTING/SECURITY/issue+PR templates.',
        priority: 'high',
        labels: ['launch-prep'],
      },
      {
        column: 'Done',
        title: 'Pushed to GitHub as public OSS (MIT)',
        description: 'github.com/eugine8248/callmap — public repo, MIT license, ready for marketplace submission once C1 lands.',
        priority: 'medium',
        labels: ['launch-prep'],
      },
    ],
  },

  // =========================================================================
  {
    name: 'stockpulse',
    cards: [
      // Up Next
      {
        column: 'Up Next',
        title: 'Deploy stockpulse to own server (this week)',
        description:
          'Follow stockpulse/DEPLOY.md:\n1. SSH to your server (Docker + Compose v2 installed)\n2. git clone github.com/eugine8248/stockpulse + cd in\n3. Copy .env.production.example → .env.production, fill secrets (generate JWT_SECRET via `openssl rand -base64 48`)\n4. docker compose up -d\n5. docker compose exec stockpulse npx prisma db push\n6. Verify /api/health returns 200 with DB ping\n7. Point DNS at server IP\n8. Add Caddyfile entry from DEPLOY.md → automatic Let\'s Encrypt SSL\n9. Smoke test: login + watchlist + reports',
        priority: 'high',
        labels: ['infra', 'launch-prep'],
      },
      {
        column: 'Up Next',
        title: 'Verify docker compose build works (no Docker on Windows dev box)',
        description: 'The hardening agent shipped a tightened Dockerfile but couldn\'t run `docker compose build` locally. First action on the deploy server: `docker compose build` and confirm it succeeds before bringing up.',
        priority: 'medium',
        labels: ['infra', 'validation'],
      },
      {
        column: 'Up Next',
        title: 'Verify auto-update flow with a real cron-pulled report',
        description: 'chokidar watcher is wired; should pick up new files within ~4 sec. Drop a dated stock-analysis report into the watched dir and confirm /api/reports/stock-analysis/latest-buys reflects it.',
        priority: 'low',
        labels: ['validation'],
      },
      {
        column: 'Up Next',
        title: 'Add stockpulse tunnel + CORS allowlist',
        description: 'If/when you set up `stockpulsedev.alien-lee.com` tunnel, mirror the framedeck/gitaudit pattern: vite allowedHosts wildcard + server CORS function allowlist already in place from today\'s hardening.',
        priority: 'low',
        labels: ['infra'],
      },
      {
        column: 'Up Next',
        title: 'Setup stockpulse Cloudflare tunnel routing',
        description: 'No tunnel domain set up yet. Decide whether to use `stockpulsedev.alien-lee.com` pattern or skip and access only on deployed prod URL.',
        priority: 'low',
        labels: ['infra'],
      },

      // Done
      {
        column: 'Done',
        title: 'Security hardening playbook applied (JWT pin + tokenVersion, rate-limit, helmet, env validation, audit log)',
        description: 'Commit f04c489 — all 9 security items from the playbook applied identically to stockpulse + taskpulse. Schema additions via prisma db push.',
        priority: 'high',
        labels: ['security'],
      },
      {
        column: 'Done',
        title: 'Auto-ingest daily cron reports via chokidar',
        description: 'Commit 019bf94 — chokidar watcher on REPORTS_DIR (default taskpulse/data/reports/stocks) + new GET /api/reports/stock-analysis/latest-buys parser.',
        priority: 'medium',
        labels: ['infra'],
      },
      {
        column: 'Done',
        title: 'Production deploy prep (multi-stage Dockerfile, backup script, DEPLOY.md, Caddyfile)',
        description: 'Commit 46f9649 — multi-stage Dockerfile w/ tini + sqlite + HEALTHCHECK + npm-prune. docker-compose with JWT_SECRET:? fail-fast. scripts/backup-sqlite.sh atomic + 7-daily + 4-weekly rotation. .env.production.example. DEPLOY.md with sample Caddyfile.',
        priority: 'medium',
        labels: ['infra'],
      },
    ],
  },

  // =========================================================================
  {
    name: 'taskpulse',
    cards: [
      // Up Next
      {
        column: 'Up Next',
        title: 'Deploy taskpulse + stockpulse to own server (this week)',
        description:
          'Stated goal: deploy this week. Same pattern as stockpulse:\n1. SSH to server, git clone, cd\n2. .env.production with secrets\n3. docker compose up -d\n4. prisma db push\n5. Verify /api/health\n6. DNS + Caddyfile entry\n7. Smoke test login + boards + reports + /today pane\n8. Install PWA on phone home screen via tunnel\n\nDeploy taskpulse + stockpulse together since they share the same patterns.',
        priority: 'urgent',
        labels: ['infra', 'launch-prep'],
        pin: true,
      },
      {
        column: 'Up Next',
        title: 'Wire WebSocket reducers for new v2 event types',
        description: 'Currently the React client catches up via TanStack polling + invalidate-on-mutate, which works but isn\'t realtime. For the new CardEvent kinds (created/moved/pinned/commented/time_logged/attached/tagged), add WS reducers in the client + emit on the server side. Pattern reference: stockpulse has its own WS hooks for /ws.',
        priority: 'medium',
        labels: ['polish'],
      },
      {
        column: 'Up Next',
        title: 'Build POST /api/columns so `tp quick` works correctly',
        description: 'CLI `tp quick "<title>"` was specced to add to the default board\'s "Inbox" column (create if missing). Server currently lacks POST /api/columns, so the CLI falls back to the first column. Add the endpoint with Zod validation + admin gate.',
        priority: 'medium',
        labels: ['bug'],
      },
      {
        column: 'Up Next',
        title: 'Add richer interactive editor for `tpl save` + `view save` CLI',
        description: 'Currently posts minimal payloads. For tpl save: prompt for card-skeleton list (title, description, priority, tags) interactively. For view save: prompt for filter+sort selections. Use the prompts package.',
        priority: 'low',
        labels: ['polish'],
      },
      {
        column: 'Up Next',
        title: 'Run Lighthouse PWA audit + add score to V2_REPORT',
        description: 'No headless Chrome available during the v2 build. Run `npx lighthouse https://taskpulse.alien-lee.com/ --view --preset=desktop` locally to get the PWA score + accessibility + performance + SEO numbers.',
        priority: 'low',
        labels: ['validation'],
      },
      {
        column: 'Up Next',
        title: 'Clean up test accounts in DB',
        description: 'Three users in the DB: id 1 test@taskpulse.local "Tester", id 2 local@taskpulse.local "Local User", id 3 eugine8248@gmail.com "Eugin" (primary). Decide whether to drop the 2 test accounts via scripts/create-or-reset-account.mjs or leave them.',
        priority: 'low',
        labels: ['polish'],
      },

      // Review
      {
        column: 'Review',
        title: 'Smoke-test all v2 features end-to-end (after this seed)',
        description: 'Once this task list lands in taskpulse:\n- /today pane refreshes with the 4 cron buckets ✓\n- Pin/unpin works (try pinning 4 — should 409 on the 4th)\n- Add comment to a card → comment appears + CardEvent recorded\n- Start a timer → red dot on card + topbar pill\n- Search for "tunnel" → FTS returns cards from this seed\n- Save a view "blocked items" → reload, verify it persisted\n- Apply a template (create one first)\n- /audit-log (admin) shows my login attempts',
        priority: 'medium',
        labels: ['validation'],
      },
      {
        column: 'Review',
        title: 'Verify PWA install on phone via tunnel',
        description: 'Open https://taskpulse.alien-lee.com/ on phone → "Add to home screen" → confirm it opens standalone + service worker registers + /api/reports/today caches.',
        priority: 'medium',
        labels: ['validation'],
      },

      // Done
      {
        column: 'Done',
        title: 'v2.0–v2.4 chain shipped (full task management + tp CLI + PWA)',
        description: 'Commits 432fa3c (schema+pin+comments+activity+time+attachments+FTS+views+templates) → e269a2a (tp CLI) → b174f83 (PWA). Tag v2.0.0 pushed. `tp` globally installed.',
        priority: 'high',
        labels: ['launch-prep'],
      },
      {
        column: 'Done',
        title: 'Wired taskpulse.alien-lee.com tunnel + CLI default URL',
        description: 'Commit 7bbe4ff — vite allowedHosts allowlist (.alien-lee.com wildcard) + CLI default URL fix (taskpulsedev → taskpulse). Tunnel returns 200 + HTML.',
        priority: 'medium',
        labels: ['infra'],
      },
      {
        column: 'Done',
        title: 'Auto-pull daily cron reports from G:\\My Drive at 5:30 AM KL',
        description: 'scripts/pull-morning-reports.ps1 + Windows Scheduled Task TaskpulsePullMorningReports. Pulls Stock-Report/Tech-Radar/Dev-Gig/morning-* from G:\\ and renames with KL date into data/reports/{stocks,tech-radar,dev-gig,morning}/.',
        priority: 'medium',
        labels: ['infra'],
      },
      {
        column: 'Done',
        title: 'Security hardening + auto-update + deploy prep',
        description: 'Commits cb9db9b → 6a90140 → aa55cfb. Same playbook as stockpulse: JWT pin+tokenVersion, rate-limit, helmet CSP+HSTS, env validation, AuditLog, /logout-everywhere, /api/reports/today, /today UI route, multi-stage Dockerfile, backup script, DEPLOY.md.',
        priority: 'medium',
        labels: ['security', 'infra'],
      },
    ],
  },

  // =========================================================================
  {
    name: 'gitaudit',
    cards: [
      // Blocked
      {
        column: 'Blocked',
        title: 'Rotate Google OAuth secret (leaked in chat + sitting in env)',
        description:
          'OAuth Client Secret `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` was pasted in chat 3+ sessions ago and is still embedded in gitaudit/server/.env.\n\nSteps:\n1. Cloud Console (https://console.cloud.google.com) → APIs & Services → Credentials\n2. Find OAuth 2.0 Client ID 566940840220-1c3c9piuo5q5mkfogjb9bsijm26h9gld\n3. Click "Reset Secret" → confirm\n4. Copy new GOCSPX-... → paste into gitaudit/server/.env GOOGLE_CLIENT_SECRET=\n5. Restart server\n6. Test sign-in-with-Google flow\n\nDo this BEFORE init-ing gitaudit as a git repo (otherwise the old secret enters git history forever). ~5 min total.',
        priority: 'urgent',
        labels: ['security'],
        pin: true,
      },
      {
        column: 'Blocked',
        title: 'Add gitaudit tunnel callback to Google OAuth Console',
        description:
          'Add `https://gitauditdev.alien-lee.com/api/auth/google/callback` to Authorized redirect URIs. Tunnel is already live + working (200 OK), only the callback URL config is missing for sign-in-with-Google to work via tunnel. Do this at the same time as the secret rotation above.',
        priority: 'medium',
        labels: ['infra'],
      },
      {
        column: 'Blocked',
        title: 'Decide gitaudit hosting + domain',
        description: 'Commercial AI-code-review SaaS. Needs a real domain + production host. Same options as framedeck (Railway/Fly/Render). Branding decision: gitaudit.dev / gitaudit.io / gitaudit.app — register early since the .dev one might go.',
        priority: 'medium',
        labels: ['launch-prep'],
      },

      // Up Next
      {
        column: 'Up Next',
        title: 'Initialize git + push gitaudit to private GitHub repo',
        description:
          'Currently not a git repo. After OAuth secret rotation:\n1. cd C:\\Users\\eugin\\projects\\gitaudit\n2. git init -b main\n3. Verify .gitignore covers: .env, .env.local, .env.production, data/*.db, node_modules/, dist/, .next/\n4. git add . && git commit -m "initial commit"\n5. gh repo create gitaudit --private --source=. --remote=origin\n6. git push -u origin main\n\nVisibility: PRIVATE (commercial product, contains Anthropic API key spec, planned Stripe).',
        priority: 'high',
        labels: ['launch-prep'],
      },
      {
        column: 'Up Next',
        title: 'Address tier-2 security items from earlier audit',
        description:
          '- XSS via SVG logo upload (sharp pipeline or strict MIME)\n- Refund double-spend race (atomic credit ledger)\n- Puppeteer SSRF (if rendering arbitrary URLs)\n- Dev secrets in .env (JWT_SECRET, COOKIE_SECRET still default values — replace with strong randoms before any prod deploy)\n- OAuth state param missing (CSRF protection on OAuth callback)\n- CORS function allowlist already added today — verify\n- Weak shareToken initial cuid value (use crypto.randomBytes if exposed publicly)\n\nSome may already be addressed since the earlier audit; re-check before fixing.',
        priority: 'medium',
        labels: ['audit', 'security'],
      },

      // Done
      {
        column: 'Done',
        title: 'Wire gitauditdev.alien-lee.com tunnel',
        description: 'server/.env CLIENT_ORIGIN + OAUTH_REDIRECT_URI updated, server/src/index.ts CORS changed from single-string to function allowlist (localhost + tunnel + alien-lee.com wildcard), client/vite.config.ts allowedHosts. Tunnel returns 200 OK.',
        priority: 'high',
        labels: ['infra'],
      },
    ],
  },
];

// -- Execute --

console.log('Wiping existing boards + labels for user', USER_ID, '...');
await p.cardLabel.deleteMany({ where: { card: { column: { board: { userId: USER_ID } } } } });
await p.card.deleteMany({ where: { column: { board: { userId: USER_ID } } } });
await p.column.deleteMany({ where: { board: { userId: USER_ID } } });
await p.board.deleteMany({ where: { userId: USER_ID } });
await p.label.deleteMany({ where: { userId: USER_ID } });

console.log('Creating', LABELS.length, 'universal labels...');
const labelRows = {};
for (const name of LABELS) {
  const row = await p.label.create({ data: { userId: USER_ID, name } });
  labelRows[name] = row.id;
}

console.log('Creating', projects.length, 'project boards...');
for (const proj of projects) {
  const board = await p.board.create({
    data: { userId: USER_ID, name: proj.name },
  });
  const colIds = {};
  for (let i = 0; i < COLUMNS.length; i++) {
    const col = await p.column.create({
      data: { boardId: board.id, name: COLUMNS[i], order: (i + 1) * 1000 },
    });
    colIds[COLUMNS[i]] = col.id;
  }

  for (let i = 0; i < proj.cards.length; i++) {
    const c = proj.cards[i];
    const card = await p.card.create({
      data: {
        columnId: colIds[c.column],
        title: c.title,
        description: c.description || '',
        priority: c.priority || 'medium',
        order: (i + 1) * 1000,
        dueDate: c.due ? new Date(c.due) : null,
        pinnedAt: c.pin ? new Date() : null,
      },
    });
    if (c.labels) {
      for (const lbl of c.labels) {
        const lblId = labelRows[lbl];
        if (lblId) await p.cardLabel.create({ data: { cardId: card.id, labelId: lblId } }).catch(() => {});
      }
    }
  }
  console.log('  ✓', proj.name, '—', proj.cards.length, 'cards');
}

// Verify pin count
const pinned = await p.card.count({ where: { pinnedAt: { not: null }, column: { board: { userId: USER_ID } } } });
console.log('\nPinned cards:', pinned, '(cap is 3)');

await p.$disconnect();
console.log('Done.');
