---
generated: 2026-05-18
pipeline: tech-trend-scout → framework-analyst → tooling-analyst → adoption-signal-analyst → synthesizer
status: PASS
items_in_radar: 22
---

# Tech Radar — 2026-05-18

## 1. TL;DR
- **The headline:** Anthropic's Bun team merged a 1M-line Zig→Rust rewrite (PR #30412, May 14) written entirely by Claude AI in 6 days — canary is available now, stable is weeks out; if you use Claude Code daily you're already running Bun, so watch the canary closely.
- **Second-tier:** Vite 8.0.13 landed the same day (May 14) with Rolldown 1.0.1 and lazy bundling — if you haven't migrated to Vite 8 yet, this week is the right moment.
- **Anti-recommendation:** The community is loud about jQuery 4.0 (January 2026) — ignore it entirely; it is a legacy-cleanup release with zero relevance to your stack.

---

## 2. What changed this week

- **Bun Zig→Rust rewrite** — PR #30412 merged May 14: 1,009,257 lines added, written by Claude AI in 6 days, passes 99.8% of test suite. *Canary available; stable build weeks out; controversial but shipping.*
- **Vite 8.0.13** — Ships Rolldown 1.0.1 and lazy bundling; capstone of the March 8.0 GA release. *10–30× build speed improvement now fully locked in.*
- **React 19.2.6** — Released May 6. Adds `<Activity>` API, `useEffectEvent` hook, `cacheSignal` for RSC, and React Performance tracks in browser DevTools. *Patch stable; upgrade freely.*
- **Claude Code May 2026** — Agent view, `/goal` command for outcome-based autonomy, Opus 4.7 default in Fast mode (1M token context window), worktree background isolation, projected context cost in `/plugin`. *Direct daily-workflow upgrades.*
- **React Doctor (millionco)** — Trending #13 on GitHub this week (+2,643 stars). Rust-based (Oxlint) linter for 60+ React anti-patterns targeting AI-generated code; produces a 0–100 health score, integrates into CI. *Direct GitAudit competitive signal.*
- **TanStack Router 1.170** — Released with CSRF middleware; TanStack Query is at 12M weekly npm downloads. *Ecosystem momentum continues.*
- **TypeScript 6.0** (March 23) — Final JS-based compiler release. `strict: true` by default, 40–60% faster incremental rebuilds, `using` declarations, Stage-3 decorators with metadata. *Go-native TS 7.0 now in active development.*
- **Next.js 16.2** (March 2026) — React Compiler stable, `"use cache"` directive, ~400% faster `next dev` startup, Next.js DevTools MCP integration. *Turbopack is the default — no Webpack.*
- **Qodo 2.0** (February 2026) — Multi-agent architecture with a "judge" agent that resolves conflicts across specialist sub-agents. 60.1% F1 bug-catch rate; cross-repo dependency tracking in Enterprise tier. *Clearest direct GitAudit competitor update this cycle.*
- **Drizzle ORM** — PlanetScale acquired the entire core team in March 2026; ~1.9M weekly npm downloads (growing). *Enterprise backing changes the long-term calculus vs. Prisma.*

---

## 3. The Radar

### 🟢 ADOPT (use now)

- **Claude Code** *(AI-Dev · ESTABLISHED)* — Opus 4.7 with 1M-token context, Agent view for multi-session management, `/goal` command for autonomous task execution. Daily-driver for this stack. · Upgrade immediately; Opus 4.7 Fast mode default is a free win.
- **Vite 8** *(Build · ESTABLISHED)* — Rolldown 1.0.1 is production-stable; 10–30× faster builds vs. Rollup baseline; Rolldown-vite repo archived — the experiment is done, this is the release. · Run `npm create vite@latest` or bump existing projects to ^8.
- **React 19.2** *(UI Framework · ESTABLISHED)* — `<Activity>`, `useEffectEvent`, DevTools performance tracks. 19.2.6 is the latest patch (May 6). · Drop-in upgrade from 19.1; no breaking changes.
- **TypeScript 6.0** *(Language · ESTABLISHED)* — Strict mode is now the default; 40–60% faster rebuilds; the last JS-based compiler — know that TS 7 (Go) is coming in 2026/2027. · Audit your `tsconfig.json` for flags 6.0 now enforces by default.
- **TanStack Query + Router** *(Libraries · ESTABLISHED)* — 12M weekly downloads for Query; Router at 1.170 with CSRF middleware; Form now at stable 1.0. · The safe choice for React data fetching and SPA routing.
- **Prisma 7.6** *(DB-ORM · ESTABLISHED)* — 3.8M weekly downloads, 3× faster queries, 90% smaller bundle vs. v6, read replica support, Bun-aware init. · Already in your stack — keep upgrading patch releases.
- **Tailwind CSS v4** *(Styling · ESTABLISHED)* — CSS-first config (no tailwind.config.js required), faster build via Oxide engine, ~12M weekly downloads. · Direct upgrade from v3; design token migration is the main work.
- **Vitest 4.1** *(Testing · ESTABLISHED)* — Browser-native mode via Playwright integration, AST-based V8 coverage, 5× faster than Jest 30 in large suites. · Default test runner for Vite-based projects; pairs directly with your stack.
- **Playwright** *(Testing · ESTABLISHED)* — Dominant E2E tool; now also drives Vitest 4 browser mode. Stable component testing. · No reason to evaluate alternatives.

### 🔵 TRIAL (worth a 30-day pilot)

- **Bun (Rust canary)** *(Runtime · ESTABLISHED→watching)* — Anthropic-owned since Dec 2025; Zig→Rust rewrite merged to main May 14. Canary available. Claude Code already ships as Bun executable. · Follow `bun.sh/blog` for stable canary announcement; test your Express app against it.
- **Drizzle ORM v1** *(DB-ORM · RISING)* — PlanetScale-backed since March 2026; 1.9M weekly downloads (climbing). Lighter, SQL-transparent alternative to Prisma with a comparable DX since v1. · Pilot on next greenfield service; don't migrate existing Prisma projects yet.
- **Hono v4** *(Backend · RISING)* — 1.8M weekly downloads; TypeScript-first; runs on Node, Bun, Deno, Cloudflare Workers. Cleaner than Express 5 for new APIs. · Drop-in for any new Express service; 1-day migration for simple routers.
- **Better-auth** *(Auth · RISING)* — Lucia successor; 6,200+ GitHub stars; production-stable since v1 (early 2025); full ownership, no vendor lock-in, framework-agnostic. · Lucia is deprecated — use this on your next project before defaulting to Clerk.
- **React Doctor** *(Tool · RISING)* — Rust-based (Oxlint), 60+ React anti-pattern checks, 0–100 health score, CI sticky-PR-comment integration. Millionco shipped it 88 days ago; 8,793 stars. · Add to your CI pipeline now; also study the 60-rule set for GitAudit feature ideas.
- **Next.js 16.2** *(Meta-Framework · ESTABLISHED)* — Not your primary stack (you use Vite/Express), but the DevTools MCP integration and "use cache" semantics are worth understanding as patterns; React Compiler is now stable here first. · Monitor, not adopt — implement React Compiler in your Vite app directly instead.

### 🟡 ASSESS (track but don't commit)

- **Qodo 2.0** *(AI Code Review · RISING)* — Multi-agent review with judge agent, 60.1% F1 bug catch rate, cross-repo dependency tracking. Direct GitAudit competitor with real architectural differentiation. · Map their multi-agent architecture against your GitAudit roadmap this sprint.
- **CodeRabbit Autofix** *(AI Code Review · ESTABLISHED)* — 13M PRs reviewed; new Autofix (early access, April 2026) does agent-based auto-fixing of findings without auto-merge. $24/dev/month. · Watch Autofix GA date — agent-driven remediation is the next feature frontier for GitAudit.
- **Windsurf 2.1** *(AI-Dev · RISING)* — Cognition acquired it for $250M (Feb 2026); v2.1.32 (April 29). Devin now available as a CLI agent in Terminal. · Acquired upside uncertain; watch 90-day post-acquisition product velocity before committing.
- **TanStack Start** *(Meta-Framework · RISING)* — Full-stack TanStack play (client-first + server capabilities); pre-1.0. Positioning as a lighter Next.js for TanStack-native apps. · Interesting if you want full-stack TanStack without Next.js lock-in; wait for 1.0 stable.
- **Deno 2.7** *(Runtime · RISING)* — Temporal API stabilized, Windows ARM support, npm overrides, full Node.js compatibility. Solid alternative for TypeScript-first greenfield. · No reason to migrate existing Node apps; evaluate only on next new service.

### 🔴 HOLD (overhyped / declining / defer)

- **Express 5** *(Backend · DECLINING)* — Released after 10 years in beta — but it's a cleanup release, not a performance upgrade. ~35M weekly downloads but net-new adoption is flowing to Hono. · Stay in existing Express apps; choose Hono for all new backends.
- **Elysia** *(Backend · HYPE)* — Impressive Bun benchmarks (2.5M req/s) but Bun-only and mid-rewrite; dependency on Bun canary stability makes it risky for production right now. · Revisit after Bun Rust stable ships.
- **Lucia Auth** *(Auth · DEAD)* — Deprecated and archived since March 2025. Core team pivoted to educational resources. · Migrate to Better-auth now if you have any Lucia dependency.
- **Webpack** *(Build · DECLINING)* — No meaningful new releases. Use Vite 8 for new projects; use Rspack for Webpack-compatible migrations. · Don't start any new project on Webpack in 2026.

---

## 4. Quadrants

### Frameworks
- ADOPT: React 19.2, Vite 8, TypeScript 6.0, Tailwind CSS v4, TanStack Router
- TRIAL: Hono v4, Next.js 16.2 (monitor only)
- ASSESS: TanStack Start
- HOLD: Express 5, Webpack, Elysia

### Tools
- ADOPT: Claude Code, Vitest 4.1, Playwright, Prisma 7.6
- TRIAL: Drizzle ORM v1, Better-auth, React Doctor, Bun (Rust canary)
- ASSESS: Qodo 2.0, CodeRabbit Autofix, Windsurf 2.1
- HOLD: Lucia Auth

### Languages & Runtimes
- ADOPT: Node.js 24 (native TypeScript, security improvements)
- TRIAL: Bun (Rust canary — watch for stable)
- ASSESS: Deno 2.7
- HOLD: —

### Techniques
- ADOPT: AI-agent-driven multi-file editing (the 2026 default workflow)
- TRIAL: Multi-agent code review pipelines (Qodo pattern; apply to GitAudit architecture)
- ASSESS: AI-generated runtime rewrites at scale (Bun Zig→Rust demonstrates viability and controversy)
- HOLD: Vibe coding without a quality gate (add React Doctor or equivalent to every AI-code pipeline)

---

## 5. Anti-radar — what NOT to chase

1. **jQuery 4.0** — HN discussed it; it's a legacy-cleanup release, irrelevant to modern React stacks.
2. **Elysia** — Benchmarks are real, production viability is not while Bun core is mid-rewrite.
3. **SolidJS / Qwik** — Fine tech, no production ecosystem, React 19 Compiler closes the gap that made them interesting.
4. **TanStack Start (pre-1.0)** — Exciting but pre-stable; don't build GitAudit or client work on it yet.
5. **Deno as Node.js replacement** — Don't migrate existing Node apps; evaluate only on a new greenfield project with a clear TypeScript-first case.

---

## 6. Notes for the user

### Direct-stack updates
- **Vite 8.0.13** — Run `npm i vite@latest` today. Rolldown 1.0.1 is in. Lazy bundling improves large-codebase cold starts. This is the payoff for the March 8.0 GA.
- **React 19.2.6** — `<Activity>` is the most relevant new API for GitAudit: it lets you hide/show background UI (e.g., review panels) while preserving state. `useEffectEvent` cleans up stale-closure bugs in effects.
- **TypeScript 6.0** — Check your `tsconfig.json`: `strict: true` is now the default. If you had it off intentionally you'll get new errors on upgrade. Rebuild time improvement is free — upgrade first, fix errors second.
- **Prisma 7.6** — Already on your stack. The 3× query speed improvement is real; verify your Bun-aware init settings since Claude Code ships with Bun.
- **TanStack Query 12M weekly DLs / Router 1.170** — Your existing use of these is validated at scale. CSRF middleware in Router 1.170 is relevant for GitAudit's webhook endpoints.
- **Tailwind v4** — CSS-first config means no more `tailwind.config.js` required. Migration is a few hours for a mid-sized project. Do it on next GitAudit sprint.

### Claude Code / AI-dev tools
- **Agent view + `/goal` command (May 2026)** — `/goal` lets you define an outcome and walk away. For GitAudit feature development: define a spec as the goal, let Claude Code run it end-to-end. Start using this today.
- **Opus 4.7 with 1M context** — Fast mode now runs Opus 4.7 by default. The 1M-token context means you can feed Claude Code your entire GitAudit codebase + tests + migrations without truncation. This is qualitatively different from 200K.
- **Worktree background isolation** — Background agents now run in isolated git worktrees. Safe for parallel feature branches in GitAudit without merge conflicts between agent sessions.
- **Bun Zig→Rust rewrite (canary)** — Claude Code ships as a Bun executable. The rewrite fixes memory leaks and shrinks the binary 3–8 MB. Expect a performance bump in Claude Code's own startup once stable ships. Follow `bun.sh/canary`.
- **React Doctor** — Run `npx skills add millionco/react-doctor` to inject 47 React rules into your Claude Code sessions. This gives your agent immediate feedback on AI-generated React quality. Directly relevant for all your apps.

### GitAudit competitive intel
- **Qodo 2.0 (February 2026)** — Multi-agent architecture with dedicated specialist agents (security, performance, test coverage) and a judge agent that resolves conflicts. F1 bug catch rate: 60.1%. Cross-repo dependency tracking is Enterprise-only. This is the clearest architectural signal for where GitAudit should go: parallelized specialist agents beat single-pass reviews.
- **CodeRabbit Autofix (early access, April 2026)** — Agent-based auto-fixing of review findings, without auto-merge. $24/dev/month. 13M PRs reviewed. This is the next feature horizon: review → suggest fix → agent implements fix → human approves. GitAudit should have a roadmap position on this.
- **Greptile** — 82% bug catch rate in benchmarks (vs. CodeRabbit ~44%, Qodo 60.1%). $30/dev/month with a 50-review cap. Greptile's advantage is deep codebase indexing — relevant as a moat strategy for GitAudit.
- **React Doctor (millionco)** — Not a direct code-review SaaS competitor (it's a CLI/CI linter), but the 60-rule taxonomy covering security, performance, architecture, accessibility, and dead code is a direct reference for GitAudit's rule taxonomy. Study their GitHub for rule definitions.
- **Anthropic multi-agent code review** — Anthropic shipped its own internal multi-agent code review system on March 9, 2026. No public product yet, but the pattern validates the architecture. Could become a Claude Code feature that competes with GitAudit — watch for product announcements.

---

## 7. Sources

- https://bun.com/blog/bun-joins-anthropic
- https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone
- https://www.theregister.com/devops/2026/05/14/anthropics-bun-rust-rewrite-merged-at-speed-of-ai/5240381
- https://vite.dev/blog/announcing-vite8
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- https://nextjs.org/blog/next-16
- https://nextjs.org/blog/next-16-2
- https://react.dev/versions
- https://tanstack.com/query/latest
- https://github.com/TanStack/router/releases
- https://www.qodo.ai/blog/introducing-qodo-2-0-agentic-code-review/
- https://github.com/millionco/react-doctor
- https://www.pkgpulse.com/guides/drizzle-orm-v1-vs-prisma-6-vs-kysely-2026
- https://www.pkgpulse.com/blog/lucia-auth-v3-vs-better-auth-vs-stack-auth-self-hosted-2026
- https://releasebot.io/updates/anthropic/claude-code
- https://code.claude.com/docs/en/whats-new
- https://github.com/trending/typescript?since=weekly
- https://releasebot.io/updates/vite
