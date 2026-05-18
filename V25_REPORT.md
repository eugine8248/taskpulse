# Taskpulse v2.5.0 — GitHub integration

Released: 2026-05-18

## Summary

Taskpulse boards can now bind to a GitHub repo. Open PRs + issues mirror
into a dedicated "GitHub" column on a 15-minute auto-sync timer. Closed
items reconcile to Done. Single-card "Add from URL" works for any
PR/issue/commit URL.

## Schema (Prisma)

```prisma
model User {
  ...
  githubPatEncrypted String?   // AES-256-GCM(iv|tag|ct) base64-joined
  githubLogin        String?
  githubScopes       String?   // CSV
}

model Board {
  ...
  githubRepoUrl     String?
  githubRepoOwner   String?
  githubRepoName    String?
  githubLastSyncAt  DateTime?
  githubAutoSync    Boolean   @default(true)
  githubColumnId    Int?
  @@index([githubRepoOwner, githubRepoName])
}

model Card {
  ...
  githubKind          String?  // 'pr' | 'issue' | 'commit'
  githubUrl           String?
  githubNumber        Int?
  githubSha           String?
  githubState         String?  // 'open' | 'draft' | 'closed' | 'merged'
  githubMetadata      String?  // JSON cache
  githubLastFetchedAt DateTime?
  @@index([githubKind, githubState])
  @@unique([columnId, githubUrl], name: "uniq_card_per_col_per_url")
}
```

Applied via `prisma db push --accept-data-loss` (FTS5 virtual table dropped
+ rebuilt at boot — `ensureFtsReady` handles this idempotently).

## Encryption

`server/src/lib/encryption.ts` — AES-256-GCM, IV=12 bytes, tag=16 bytes,
key from `PAT_ENCRYPTION_KEY` (base64 of 32 random bytes).

- Production: refuses to start if key missing or wrong length.
- Dev fallback: deterministic key derived from `SHA-256("taskpulse-pat:" + JWT_SECRET)`
  with a one-time warning. Easy to migrate to a real key by setting
  `PAT_ENCRYPTION_KEY` and re-storing PATs.

Format on disk: `base64(iv).base64(tag).base64(ciphertext)`.

`envValidation.ts` was extended to flag missing/short keys at boot.

## API surface

| Method | Path | Notes |
|--|--|--|
| POST | `/api/github/pat` | Store/replace user PAT. Validates with `GET /user`. |
| DELETE | `/api/github/pat` | Clear stored PAT. |
| GET | `/api/github/pat/status` | `{connected, login, scopes, rateLimit}`. |
| POST | `/api/github/cards/:id/refresh` | Re-fetch a card from GitHub. |
| POST | `/api/boards/:id/github/link` | Body `{repoUrl}` → links + initial sync. |
| DELETE | `/api/boards/:id/github/link` | Unlink (cards stay). |
| POST | `/api/boards/:id/github/sync` | Manual sync; returns stats. |
| POST | `/api/boards/:id/github/import-url` | Body `{url}` → add single card. |
| PATCH | `/api/boards/:id/github/autosync` | Body `{enabled}`. |
| GET | `/api/boards/:id/github` | Link status snapshot. |
| POST | `/api/webhooks/github` | **PUBLIC**, HMAC-validated, 404 when secret unset. |

The webhook is mounted BEFORE `authMiddleware` (in `index.ts`) and uses
`express.raw()` so HMAC sees the raw body.

## Sync model

`server/src/services/githubSync.ts`:

1. `ensureGithubColumn(boardId)` — finds-or-creates the "GitHub" column.
2. Paginated fetch of open PRs (`/repos/:o/:r/pulls?state=open`).
3. Paginated fetch of open issues (filters out `pull_request` rows).
4. Per item: upsert by `(columnId, githubUrl)` — keyed via Prisma find +
   create/update because SQLite supports composite-unique-with-null.
5. Reconciliation: any existing GitHub card with `githubLastFetchedAt < syncStartedAt`
   is re-fetched; if upstream says closed/merged it moves to Done.
6. Fires `github_pr_imported`, `github_pr_merged`, `github_pr_closed`,
   `github_issue_imported`, `github_issue_closed` CardEvents.

`syncAllLinkedBoards()` runs every 15 min via `setInterval` after a 30s
boot delay. Per-board jitter is 0-120s.

### Rate-limit handling (GitHubClient)

- Reads `x-ratelimit-remaining` from every response; sleeps 2s when < 100.
- Retries 429/5xx with exponential backoff (1s, 2s, 4s, then fail).
- 401 → throws `GitHubError(401, 'GitHub PAT may be revoked or invalid')`
  which surfaces as a clean error in the route layer.

## CLI

```
tp gh login                       # interactive PAT prompt
tp gh logout
tp gh status                      # connection, scopes, rate-limit
tp gh link <board> <repoUrl>      # board: id or name
tp gh unlink <board>
tp gh sync <board>                # manual sync
tp gh add <url> [--board <name>]  # single-card import (PR/issue/commit)
```

`tp board ls` now shows linked repos. The default `tp` view + `tp ls`
render a small GitHub state pill (⎇#245 / ○123 / ◆sha) on github-derived
cards.

## UI

- **Settings page** has a GitHub section: connect/disconnect, scope-prefilled
  PAT creation link, rate-limit display.
- **Board view** has a top strip showing `owner/repo · synced 5m ago` with
  Sync / Add-from-URL / Unlink. When not linked, "Link to a GitHub repo…"
  opens a modal.
- **GitHub column** has a subtle `accent/30` border + octocat icon in the
  header.
- **CardItem** shows a state pill: open=green, draft=muted, merged=accent,
  closed=red.
- **CardDetailPanel** has a top GitHub section (with author, base→head,
  +/-lines, mergeable, Open-on-GitHub, Refresh, Show-callgraph for PRs).

## Webhook stretch

`POST /api/webhooks/github` validates `x-hub-signature-256` (HMAC-SHA256
of the raw body, timing-safe comparison). Handles `pull_request`,
`issues`, `push` (push is acked-but-ignored to avoid commit flooding).
When `GITHUB_WEBHOOK_SECRET` is unset, the endpoint returns 404.

## Verification (run 2026-05-18)

```
POST /api/auth/login          → 200 (login.data.token)
POST /api/github/pat (bogus)  → 401 GitHub rejected the PAT
POST /api/github/pat (real)   → 200 {login: eugine8248, scopes: [...]}
GET  /api/github/pat/status   → 200 connected: true, rate 4982/5000
POST /api/boards/6/github/link
       (sindresorhus/p-queue) → 200 prsImported:3, issuesImported:2
POST /api/boards/6/github/import-url
       (PR/245)              → 200 cardId:65 created
POST /api/webhooks/github
       (valid HMAC + merged)  → 200 {ok:true}; card 65 githubState=merged
POST /api/webhooks/github
       (invalid HMAC)         → 401 Invalid signature
POST /api/webhooks/github
       (no secret env)        → 404 Webhook disabled
tp gh status / sync / etc.   → ok
```

## Constraints honoured

- Zero new server-side runtime deps. Hand-rolled GitHub client + crypto.
- Server typecheck (`tsc --noEmit`) clean.
- Server build (`tsc -p`) emits `dist/`.
- Client typecheck + Vite build clean.
- Initial client chunk: 209 KB gz (limit 350 KB).
- Lazy callgraph chunk: 1.29 KB gz placeholder for v2.5 (full engine in v2.6).
- Webhook mount order: BEFORE authMiddleware + JSON parser (uses `express.raw`).
