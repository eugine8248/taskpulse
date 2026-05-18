# Taskpulse v2.6.0 — Inline callgraph (embedded callmap engine)

Released: 2026-05-18

## Summary

Every GitHub PR card now has a "Show callgraph" button. Clicking opens a
full-screen taskpulse-skinned overlay that:

1. Lazy-loads the vendored callmap engine (~45 KB gz) and the appropriate
   tree-sitter WASM grammar.
2. Fetches PR metadata + changed files **through the taskpulse server**
   (POST `/api/github/proxy`) so the user's PAT never crosses to the
   browser.
3. Parses base + head of each supported file with tree-sitter, diffs
   functions, builds a cross-file callgraph (with dimmed-external
   placeholders for unresolved calls), and lays it out via dagre.
4. Renders an SVG callgraph using `--c-bg / --c-surface / --c-accent`
   from the active theme — warm-cream light or cool-slate dark.

## Vendor mechanism

`scripts/sync-callmap-engine.ps1` is the canonical pull script. It:

- Copies `callmap/packages/core/src/*.ts` → `client/src/lib/callmap-engine/`
- Renames `github.ts` → `engine-github.ts` (avoids collision with
  `server/src/lib/github.ts`)
- Mirrors `callmap/packages/desktop/public/*.wasm` →
  `client/public/grammars/`
- Re-emits a `SYNC_MANIFEST.md` with mtimes for the next reviewer

Re-run any time callmap's core ships a meaningful update. There's no
runtime version coupling — the engine is fully embedded.

## Lazy-load architecture

- `CardDetailPanel` → `lazy(() => import('./CardCallgraphPanel'))`.
- `CardCallgraphPanel` → dynamic `import('../../lib/callmap-engine')`
  inside its mount effect.
- The engine entrypoint (`index.ts`) wires:
  - `setHttp()` to a proxy that hits `POST /api/github/proxy`
  - `setWasmLoader()` to a function returning `/grammars/<name>.wasm`
- Each grammar is fetched on demand — a TypeScript PR loads the TS
  grammar; a Python PR loads the Python one. The engine caches per
  GrammarKey.

### Bundle sizes (vite build)

```
dist/assets/index-CxVzjo8K.js              722.64 kB │ gzip: 210.15 kB   (initial)
dist/assets/index-DlfYk5GD.js              161.61 kB │ gzip:  45.23 kB   (engine — lazy)
dist/assets/CardCallgraphPanel-f-fRNmBf.js   3.29 kB │ gzip:   1.47 kB   (panel — lazy)
```

Initial chunk ≤ 350 KB gz ✓. Deferred engine + panel ≤ 100 KB gz ✓.
Grammars (~2 MB total) are fetched on-demand per language and cached by
the browser.

## PAT proxy

`POST /api/github/proxy` body `{ url }`. The server:

- Validates `url` starts with `https://api.github.com/`.
- Looks up the authed user's encrypted PAT, decrypts in-process.
- Forwards the request with the PAT in `Authorization: token …`.
- Returns `{ ok, status, body, headers }` to the client.

This is what `engine-github.ts setHttp()` consumes. The browser never
sees the PAT.

## CSP exception

`helmet`'s `contentSecurityPolicy.scriptSrc` adds `'wasm-unsafe-eval'`
so the tree-sitter runtime can compile WASM. This is the narrowest CSP
allowance for WASM (does NOT re-enable `eval()`).

## Known divergence from callmap

- Render is a custom SVG renderer (`render.ts`) — callmap proper uses
  React Flow. Our viewer is read-only; the engine's xyflow integration
  isn't vendored.
- Engine fetches are routed via the proxy instead of direct
  api.github.com hits (callmap-desktop uses Tauri's HTTP module;
  taskpulse uses its own auth-gated proxy).

## Verification

- Client `tsc -b` clean.
- Vite build clean (with the documented `wasm-unsafe-eval` CSP addition).
- Bundle ceilings met (210 KB initial, 47 KB lazy total — separate
  WASM fetches).

A live "open a TypeScript PR card → click Show callgraph" smoke test
is the integration check; this lands behind v2.5's PAT + linking flow
which is already verified.
