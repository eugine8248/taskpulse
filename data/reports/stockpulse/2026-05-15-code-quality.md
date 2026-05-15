# Code Quality Report — stockpulse v0.1.0

**Reviewed:** 2026-05-15
**PM:** Code Quality PM
**Pipeline:** Stack Detector → Frontend Reviewer + Backend Reviewer → consolidated
**Mode:** Master ran inline (subagent sandbox blocked target-repo reads — see registry).

---

## Detected Stack

stockpulse is a 2-workspace TypeScript npm-workspaces monorepo packaged into a single Docker image. **Client** is React 18 + Vite 5 + Tailwind 3.4 (class-based dark mode wired) + react-router 6, with Zustand 5 owning client state (token, theme, prices, alert toasts, connection status) and TanStack Query 5 owning server-cache calls. Charts are Recharts 2. **Server** is Express 4 + Prisma 5 against **SQLite**, with bcryptjs + JWT auth (7d expiry, optional `NO_AUTH=true` bypass), helmet (CSP disabled) + cors, and a `ws@8` WebSocket hub at `/ws` with per-user socket maps and a 30 s heartbeat. **External data** is Yahoo Finance's unofficial endpoints (`query1.finance.yahoo.com`) for intraday bars, summary, batch quotes, and symbol search — fetched with `Mozilla/5.0` UA to dodge their 403s. **Background work**: an in-process poller @ 5 s union-batches all-user watchlist symbols, broadcasts price ticks per user via the WS hub, and evaluates alerts with a 5-minute debounce on `Alert.lastTriggered`.

No tests anywhere. CI workflows present (`.github/workflows/build.yml`, `release.yml`). v0.1.0 is locally committed (per the registry) but not yet pushed to GitHub.

Full artifact: `.agent-context/stack-detection.json`

---

## Frontend Review

See `frontend-review.md` for the full body. Headline counts:

- **Critical:** 1 — JWT in `localStorage` (lower threat surface than framedeck but worth noting)
- **Important:** 7 — concentrated around WebSocket reconnect handling, effect-driven routing causing screen flashes, and hardcoded hex drift in chart components
- **Minor:** 7

The frontend is the strongest part of the codebase. Zustand vs TanStack Query is split correctly, dark mode is wired end-to-end (unlike framedeck), the WS hook is small and considered. The recurring weakness is around the boundary between WS protocol close codes and reconnect behavior, and the routing-by-effect pattern that causes a one-frame wrong-screen flash.

---

## Backend Review

See `backend-review.md` for the full body. Headline counts:

- **Critical:** 4 — JWT secret silent fallback, `NO_AUTH=true` no-prod-guard env bypass, permissive CORS, sync bcrypt
- **Important:** 10 — concentrated around the poller's resilience (Yahoo timeouts, sequential batches, no caching/backoff) and one real alert-debounce race
- **Minor:** 8

The Express layer is idiomatic. The hard issues are: (a) the alert-debounce race, which can fire the same alert twice within the 5-min window if Prisma writes lag the poll cycle; (b) the Yahoo client lacking any timeout/cache/backoff, which is the single most likely source of a real production stall.

---

## Cross-cutting findings

1. **Three of four backend criticals are also framedeck criticals.** Same `JWT_SECRET` default string, same `cors({ origin: true, credentials: true })`, same sync bcrypt. These came from the same template; a shared `lib/secure-config.ts` module deserves to be lifted into both projects' next cycle.
2. **`NO_AUTH=true` is the new front-runner for "single env var that opens the whole system."** The HTTP middleware AND the WS hub both honor it AND `/api/auth/status` reports it to anyone. Three independent surfaces of the same misconfiguration.
3. **No tests, two projects, increasing realtime complexity.** stockpulse has more concurrency surface than framedeck (poller × WS × alert evaluation × Yahoo throttling), and zero automated coverage. The alert-debounce race in particular is the kind of bug that only surfaces under load — exactly the kind a small concurrency test could catch.
4. **External-API hardening is missing.** The Yahoo client has no timeout, no cache, no backoff, no rate-limit handling. Yahoo's unofficial endpoints are documented to throttle aggressively. At any meaningful user count, this is the first thing that blows up.
5. **Static-file serving in containerized deploys is fragile.** `path.resolve(__dirname, '..', '..', 'client', 'dist')` assumes the dev layout transplants directly to the Docker image. Worth an env-var override + a Dockerfile verification.

---

## Top 5 recommended actions

1. **One config-validation module at boot.** Refuses to start in production if `JWT_SECRET` is unset, `CLIENT_URL` is unset, or `NO_AUTH=true`. Lift into both stockpulse AND framedeck — single fix point for four cross-project criticals.
2. **Atomic alert debounce.** Replace `findMany → check lastTriggered → update` with `prisma.alert.updateMany({ where: { id, OR: [{ lastTriggered: null }, { lastTriggered: { lt: cutoff } }] }, data: { lastTriggered: now } })`; only act when `count === 1`. Single highest-priority correctness fix.
3. **Yahoo client hardening**: `AbortController` timeout in `yahooGet`, parallelize batches with `Promise.allSettled`, add an LRU cache (15 s quotes, 60 s `range='1d'` intraday, longer otherwise), exponential backoff on 4xx/5xx. Single highest-priority resilience win.
4. **Fix the WebSocket auth-failure reconnect loop**: branch on close codes 4001-4003 in `useWebSocket.onclose` and stop retrying; surface "session expired"; route to `/login`. Today an expired token quietly burns reconnect cycles forever.
5. **Replace effect-driven routing with route guards.** `<RequireAuth>` + `<RequireSetup>` components at the top of the route tree. Eliminates the one-frame wrong-screen flash on every load, and makes the routing rules readable in one place.

> Stack detection artifact saved to `.agent-context/stack-detection.json`.
> Run **UI Layout PM** next for screen-space and responsive issues, then **QA PM** to verify.
