---
generated: 2026-05-16
pipeline: tech-trend-scout → framework-analyst → tooling-analyst → adoption-signal-analyst → synthesizer
status: PASS
items_in_radar: 21
---

# Tech Radar — 2026-05-16

## 1. TL;DR
- **The headline:** @TanStack npm supply chain attack (CVE-2026-45321, CVSS 9.6) hit 42 packages on May 11 via GitHub Actions cache poisoning — audit your lockfile and rotate credentials if any @tanstack/* package was installed on that date.
- **Second-tier:** Vite 8 + Rolldown is production-stable (v8.0.13) — 10-30x faster builds, zero plugin changes required; upgrade on your next deploy cycle.
- **Anti-recommendation:** OpenAI Daybreak is getting enterprise press this week — skip it; it's a closed-access research preview with zero indie-dev access right now.

## 2. What changed this week

- **@TanStack/* (CVE-2026-45321)** — Mini Shai-Hulud worm compromised 42 @tanstack/* npm packages via GHA cache poisoning on May 11. *Audit lockfile immediately; pin to pre-May-11 versions; rotate credentials.*
- **Grok Build beta (xAI)** — xAI launched a CLI coding agent ($99/mo intro) with 8 parallel agents, Arena Mode auto-scoring, local-first privacy, grok-code-fast-1 at 70.8% SWE-Bench. *Direct Claude Code competitor; track but don't switch.*
- **OpenAI Daybreak** — Codex Security + GPT-5.5-Cyber for AI code review, threat modeling, patch validation. Launched May 11. *Closed access only; major GitAudit competitive event to log.*
- **Cursor 3.4** — Cloud agent development environments: parallel agents, multi-repo, Dockerfile-based, audit logs, env-level security controls. Released May 13. *Enterprise-grade parallelism in Cursor.*
- **react-doctor v0.1 (Million.co)** — 60+ rule Rust-powered React linter, AI-code aware, GitHub Actions diff mode, health score 0–100. *Run on every PR; directly usable as GitAudit feature.*
- **Drizzle ORM v1.0.0-beta.22** — PlanetScale hired entire Drizzle team in March; 5.1M weekly downloads, crossed Prisma. *Migration from Prisma worth scoping in H2 2026.*
- **Vite 8.0.13** — Rolldown (Rust) as default production bundler since March 12; Linear's builds dropped from 46s → 6s. *Upgrade now; all existing Rollup/Vite plugins work.*
- **TypeScript 6.0** — Released March 23. Strict mode on by default, ES5 target removed, `outFile` gone, last JS-based compiler. *Migration required; breaking changes need a branch test first.*
- **Remix 3 Beta** — Released April 30. Dropped React, built on EventTarget + Fetch API, runs on Node/Bun/Deno without adapters, bundles 15+ UI components. *Interesting pivot but too radical for existing React projects.*
- **Better Auth v1.6.11** — 2M weekly downloads, actively shipping features, Lucia officially deprecated, Auth.js in security-patch mode. *The new default for indie-dev auth.*

## 3. The Radar

### 🟢 ADOPT (use now)
- **Vite 8 + Rolldown** *(Build · ESTABLISHED)* — Rolldown (Rust) replaces esbuild+Rollup; 10-30x faster production builds, full Rollup plugin compat · Upgrade today: `npm install vite@latest`, no plugin changes needed
- **TypeScript 6.0** *(Language · ESTABLISHED)* — Last JS-based TS release; strict on by default, ES5 gone, decorator metadata stable · Plan branch migration now; update tsconfig `target` to ≥ ES2015 before upgrading
- **Vitest 3** *(Testing · ESTABLISHED)* — 5.6x faster cold starts vs Jest, 28x faster watch mode, real browser mode via Playwright · Default test runner for all TS projects; drop Jest
- **Node.js 24 LTS** *(Runtime · ESTABLISHED)* — `--strip-types` stable (run `.ts` directly), improved permission model · Safe upgrade for Express + Prisma apps; ts-node dependency removable
- **Prisma v7.6** *(DB-ORM · ESTABLISHED)* — 7.8M weekly DLs, fast query compiler landed v7.3, v7.6 performance fixes · User already invested; no action needed; watch Drizzle trajectory for Q4 decision
- **Claude Code (Opus 4.7)** *(AI-Dev · ESTABLISHED)* — Routines (scheduled cloud agents), mobile push notifications, `xhigh` effort default, GitHub Action GA · New Routines feature directly usable for GitAudit async review pipeline

### 🔵 TRIAL (worth a 30-day pilot)
- **Drizzle ORM v1-beta** *(DB-ORM · RISING)* — PlanetScale-backed full-time team, 5.1M weekly DLs (crossing Prisma), sqlcommenter support, beta.22 · Pilot on a new GitAudit data model; schema syntax is familiar, migration tooling maturing
- **Better Auth v1.6** *(Auth · RISING)* — 2M weekly DLs, only auth lib gaining features in 2026; Lucia deprecated, Auth.js on life support · Use on any new project needing auth; direct Lucia migration path available
- **Hono v4** *(Backend · RISING)* — 1.8M weekly DLs, 15KB, identical API across Node/Bun/Deno/Workers · Pilot as Express replacement on a new GitAudit endpoint; `hono/client` gives end-to-end type safety
- **react-doctor** *(Tools · RISING)* — Rust-speed, 60+ React-specific rules, diff-mode GitHub Action, designed explicitly for AI-generated code · Run on every PR in GitAudit's own codebase; the rule set is a direct feature roadmap reference for GitAudit

### 🟡 ASSESS (track but don't commit)
- **Bun 2.0** *(Runtime · RISING)* — Full Node API compat, 2-4x faster HTTP (185K req/s), built-in bundler/test runner · Watch Prisma + Express compatibility status; consider for new standalone microservices
- **Remix 3 Beta** *(Meta · HYPE)* — No React dependency, Fetch API native, bundles UI components, runs on any runtime · Watch for React compatibility layer post-beta; too radical to adopt before stable
- **TypeScript 7 (Go native)** *(Language · HYPE)* — In VS 2026 Insiders preview; claimed 10x+ compile speedup on large codebases · Not production-ready; track release cadence, plan migration window for 2027
- **CodeRabbit** *(AI Code Review · ESTABLISHED)* — 13M PRs reviewed, $24/user/mo, `.coderabbit.yaml` config, 40+ bundled linters · Direct GitAudit competitor; study their bundled-linter + AI hybrid model as a feature pattern
- **Qodo 2.0** *(AI Code Review · RISING)* — Multi-agent parallel review (bug/security/quality/test agents), 60.1% F1 score, cross-repo dependency tracking · GitAudit competitor; cross-repo tracking is their most defensible new feature
- **OpenAI Daybreak** *(AI Code Review · HYPE)* — GPT-5.5-Cyber, threat modeling from repo, patch validation, audit logs. Research preview, gated. · Biggest GitAudit competitive threat long-term; no indie access yet; log the roadmap
- **Cursor 3.4** *(AI-Dev · ESTABLISHED)* — Cloud agent envs with parallel agents, multi-repo, Dockerfile setup, governance controls · Competitive intel for multi-agent workflow; Bugbot now usage-based not seat-based

### 🔴 HOLD (overhyped / declining / defer)
- **@TanStack/* packages** *(Tools · COMPROMISED)* — CVE-2026-45321, CVSS 9.6, 42 packages compromised May 11 via GHA OIDC token exfiltration · Audit lockfile now; pin all @tanstack/* to pre-May-11 versions; rotate any machine credentials; wait for official TanStack all-clear
- **Grok Build** *(AI-Dev · HYPE)* — $99–299/month, SuperGrok-gated, early beta; 70.8% SWE-Bench vs Claude Code's proven ecosystem · Don't switch; track quarterly for capability benchmarks vs Claude Code
- **Deno 3.0** *(Runtime · RISING)* — 95% npm compat, KV storage, strong sandboxing · Node 24 with `--strip-types` covers the same need for this user's Express + Prisma stack; no migration rationale
- **Panda CSS** *(Styling · RISING)* — 500K weekly DLs, type-safe CSS-in-JS, design token system · Tailwind v4 already meets this user's needs; switching cost exceeds benefit for active projects

## 4. Quadrants

### Frameworks
- ADOPT: Vite 8 + Rolldown, TypeScript 6.0
- TRIAL: Hono v4
- ASSESS: Remix 3 Beta, TypeScript 7 Native (Go)
- HOLD: Panda CSS

### Tools
- ADOPT: Vitest 3, Prisma v7.6, Claude Code (Opus 4.7)
- TRIAL: Drizzle ORM v1-beta, Better Auth v1.6, react-doctor
- ASSESS: CodeRabbit, Qodo 2.0, OpenAI Daybreak, Cursor 3.4
- HOLD: @TanStack/* (supply chain attack), Grok Build

### Languages & Runtimes
- ADOPT: TypeScript 6.0, Node.js 24 LTS
- TRIAL: Bun 2.0
- ASSESS: TypeScript 7 Native (preview), Deno 3.0
- HOLD: —

### Techniques
- ADOPT: AI-assisted PR review via GitHub Actions + Claude Code (GA, proven)
- TRIAL: Diff-mode targeted linting (react-doctor diff mode — fast, PR-scoped)
- ASSESS: Multi-agent parallel coding sessions (Cursor 3.4 cloud envs pattern)
- HOLD: Unverified npm installs — supply chain hygiene is non-negotiable in 2026; always pin + verify provenance

## 5. Anti-radar — what NOT to chase

1. **OpenAI Daybreak** — Closed research preview; zero indie-dev access right now
2. **Grok Build** — $99–299/mo beta that doesn't beat your existing Claude Code setup
3. **Remix 3 Beta** — Dropped React entirely; radical rewrite not worth betting solo projects on
4. **TypeScript 7 (Go)** — Insiders-only preview; real production ETA is 12+ months; don't plan migrations yet
5. **Deno 3.0** — 95% npm compat means 5% breakage; Node 24 native TS strips already covers your need

## 6. Notes for the user

**Direct-stack updates:**
- **Vite 8.0.13**: Run `npm install vite@latest` on all projects (framedeck, stockpulse, taskpulse, GitAudit). No plugin changes; test production build output for correctness.
- **TypeScript 6.0**: Create a `tsconfig-v6-test.json` branch on GitAudit. Key changes: add `"strict": false` temporarily if you relied on default loose mode; remove `"target": "ES5"` if present; remove `outFile` if used.
- **Node.js 24 LTS**: Upgrade Express apps; replace ts-node in any script with native `node --strip-types`. Prisma compatibility is confirmed.
- **@TanStack URGENT**: Check every project's lockfile for `@tanstack/react-query`, `@tanstack/router`, or any `@tanstack/*` at a version published May 11, 2026. CVE-2026-45321, CVSS 9.6. If in doubt, pin to the last pre-attack version and run `npm install --frozen-lockfile`.
- **Tailwind v4**: No v5 announced; no action needed.
- **Prisma v7.6**: Already the current version. Consider scoping a Drizzle migration for one new GitAudit data model to evaluate ergonomics.

**Claude Code / AI-dev tools:**
- **Routines** are now in Claude Code on the web — schedule cloud agents from cron, GitHub events, or API calls. Directly usable for GitAudit's nightly audit pipeline.
- **Mobile push notifications** are live — Claude pings your phone when a long agent task finishes or needs input.
- **Opus 4.7** is the new default on Max/Team; use `/effort xhigh` for complex coding or debugging tasks in GitAudit.
- **react-doctor** integrates with Claude Code via GitHub Actions diff mode — a clean fit for your multi-agent workflow: agent writes React → react-doctor gates the PR.
- **Cursor 3.4 cloud envs** and **Grok Build Arena Mode** both suggest the industry is moving toward automated agent self-evaluation before human review — a pattern GitAudit could surface for its customers.

**GitAudit competitive intel:**
- **OpenAI Daybreak** (May 11): OpenAI entered AI code security review with threat modeling, dependency risk, patch validation. Closed-access enterprise-only. GitAudit's moat: accessible, developer-first, no enterprise gate. Weakness to address: threat modeling from the repo is a missing GitAudit feature.
- **CodeRabbit** crossed 13M PRs this week — their bundled-linter + AI hybrid is the industry's most proven pattern; their `.coderabbit.yaml` natural-language config is worth cloning for GitAudit's UX.
- **Qodo 2.0**: Cross-repo dependency tracking is a concrete new feature GitAudit doesn't have yet; worth a roadmap card.
- **Anthropic's multi-agent code review** (March 9, 2026): A direct reference implementation — study the architecture for GitAudit's own review pipeline design.

## 7. Sources

- https://snyk.io/blog/tanstack-npm-packages-compromised/
- https://thehackernews.com/2026/05/mini-shai-hulud-worm-compromises.html
- https://vite.dev/blog/announcing-vite8
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- https://remix.run/blog/remix-3-beta-preview
- https://nextjs.org/blog/next-16-2-turbopack
- https://planetscale.com/blog/drizzle-joins-planetscale
- https://github.com/millionco/react-doctor
- https://cursor.com/changelog
- https://openai.com/daybreak/
- https://www.engadget.com/2173482/xai-coding-agent-grok-build/
- https://code.claude.com/docs/en/whats-new
- https://better-auth.com/
- https://github.com/lucia-auth/lucia/discussions/1714
- https://github.com/microsoft/typescript/releases
- https://orm.drizzle.team/docs/latest-releases
- https://techcrunch.com/2026/05/14/openai-says-codex-is-coming-to-your-phone/
- https://www.pkgpulse.com/guides/hono-vs-elysia-2026
- https://medium.com/@chaos.architect25/the-best-ai-coding-tools-of-may-2026-cf2db2804a0f
