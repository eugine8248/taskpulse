# Code Quality Report — framedeck v0.4.0

**Reviewed:** 2026-05-14
**PM:** Code Quality PM
**Pipeline:** Stack Detector → Frontend Reviewer + Backend Reviewer → consolidated
**Mode:** Master ran inline (subagent sandbox blocked target-repo reads — see registry).

---

## Detected Stack

framedeck is a 3-workspace TypeScript npm-workspaces monorepo. **Client** is React 18 + Vite 5 + Tailwind 3.4 + react-router 6, with TanStack Query 5 provisioned and Zustand 5 available (though both lightly used in favor of `useState + useEffect + fetch` in pages). The canvas is `@xyflow/react` (React Flow). **API** is Express 4 + Prisma 5 against Postgres, with bcryptjs + JWT auth (7d expiry), Google OAuth (hand-rolled with `fetch`, not via the declared passport dependency), multer + sharp + AWS S3 SDK for image uploads, and helmet + cors + morgan. **Collab** is a separate `@hocuspocus/server` workspace persisting Yjs binary state to a shared Postgres `YjsDocument` table. No tests of any kind. Prisma schema lives at repo root.

v0.4 added: member invites + role-based access, point-in-time `BoardSnapshot` model with a 30-min auto-snapshotter, global Cmd/Ctrl+K command palette, and an S3-compatible storage toggle with local-disk fallback.

Full artifact: `.agent-context/stack-detection.json`

---

## Frontend Review

See `frontend-review.md` for the full body. Headline counts:

- **Critical:** 1 — JWT in `localStorage` + 7-day expiry, with broad XSS surface
- **Important:** 10 — concentrated around the realtime/canvas hook, the dual data-fetching pattern, and a latent broken dark-mode toggle
- **Minor:** 6

The frontend is well-organized and the Tailwind token system is sound, but two foot-guns recur: state shared via module-level mutables (`window.__fdLastCursor`, the CommandPalette command bus), and `useEffect`-disabled exhaustive-deps that hide stale-callback / stale-token risks in the Yjs hook.

---

## Backend Review

See `backend-review.md` for the full body. Headline counts:

- **Critical:** 4 — JWT secret silent fallback, permissive CORS, sync bcrypt, half-transactional restore
- **Important:** 10 — concentrated around the snapshotter's scaling and the triple-duplicated auth helpers
- **Minor:** 8

The Express layer is idiomatic; the issues are operational and code-health. The single most impactful refactor is consolidating the three near-duplicate authorization helpers into one module — and the single highest-priority bug fix is wrapping the snapshot restore + safety snapshot in one transaction.

---

## Cross-cutting findings

1. **No tests anywhere.** Three workspaces, zero `vitest` / `jest` / `playwright` / `cypress` configs. For v0.4 features that touch concurrent state (Yjs sync, snapshot restore, role checks), this is the gap most likely to bite in production.
2. **Theme story is incoherent.** Frontend has a palette command that toggles `.dark` on `<html>` and persists `framedeck.theme`, but Tailwind isn't configured for class-based dark mode — so the toggle does nothing visible. Pick a side and commit.
3. **Token security is a single thread.** JWT in `localStorage` (frontend) + `JWT_SECRET` falling back to a hardcoded string (backend) + 7d expiry + permissive CORS. Each individually is debatable; together they compound.
4. **Optimistic UI without rollback.** `BoardPage.updateCard` patches local state then awaits the API with no error handling. If the API rejects (rate limit, validation, network), the user sees stale state and never gets told.
5. **Operational scaling: the snapshotter and the auth helpers.** Snapshotter walks ALL boards every 30 min and may not even detect changes (if `Board.updatedAt` isn't being bumped by child mutations); restore reinserts cards one-by-one inside a transaction. Both fine at v0.4 scale, both will hurt at 10× scale.

---

## Top 5 recommended actions

1. **Fail-fast on missing JWT_SECRET in production** (and audit for other env defaults like `CLIENT_URL`, OAuth IDs). 5-line config-assertion module at boot. Fixes the most exploitable single issue.
2. **Consolidate the three board-access helpers** into `api/src/lib/board-access.ts`. Each of `boards.ts`, `snapshots.ts`, `members.ts` calls a slightly different copy — a divergence-by-omission bug is just waiting to land.
3. **Wrap snapshot restore + its safety pre-snapshot in one transaction**, and replace the `for (cards) tx.create()` loop with `createMany`. Both correctness and performance.
4. **Frontend data layer: pick one.** Either route all page-level fetches through `useQuery` (the TanStack Query provider is already mounted) or remove the provider. The current half-and-half costs maintainability and leaves optimistic-rollback unimplemented.
5. **Fix the realtime hook contract in `useYjsBoard`:** lift `opts` into a ref, react to token changes, drop the `eslint-disable react-hooks/exhaustive-deps`. Sets the stage for the BoardPage xyflow-reset fix (#3 in the frontend review) which is the most user-visible bug.

> Stack detection artifact saved to `.agent-context/stack-detection.json`.
> Run **UI Layout PM** next for screen-space and responsive issues, then **QA PM** to verify.
