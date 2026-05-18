// v2.6 callmap-engine entry point.
//
// This file is the public facade for CardCallgraphPanel. It:
//
//   1. Wires the vendored engine's `setHttp` to a server-side proxy
//      (POST /api/github/proxy) so the PAT NEVER reaches the browser.
//   2. Configures the WASM grammar base path to /grammars/.
//   3. Re-exports `buildCallgraph` + `layoutGraph` from the vendored modules.
//
// Replacing the vendor copy is done by `scripts/sync-callmap-engine.ps1`.

import { setHttp } from './engine-github';
import { buildCallgraph, type BuildProgress } from './callgraphBuilder';
import { layoutGraph } from './graphLayout';
import { renderInto } from './render';
import { setWasmLoader } from './parser';
import { api } from '../../api/client';

let wired = false;

interface ProxyResp {
  ok: boolean;
  status: number;
  body: string;
  headers: Record<string, string | null>;
}

function lazyWire(): void {
  if (wired) return;
  wired = true;
  // The vendored github.ts already supports custom HTTP via setHttp.
  // We route every api.github.com call through /api/github/proxy so the
  // PAT never reaches the browser.
  setHttp(async (url, init) => {
    const r = await api.post<ProxyResp>('/api/github/proxy', { url });
    return {
      ok: r.ok,
      status: r.status,
      headers: {
        get: (name: string) => r.headers[name.toLowerCase()] ?? null,
      },
      text: async () => r.body,
      json: async () => JSON.parse(r.body),
    };
    void init;
  });
  // WASM grammars live under client/public/grammars/ → served from
  // /grammars/ at runtime. The engine's locateFile uses these for both
  // the tree-sitter core and per-language grammars.
  setWasmLoader(async (filename) => {
    return `/grammars/${filename}`;
  });
}

export { buildCallgraph, layoutGraph, renderInto };
export type { BuildProgress };

/** Convenience wrapper used by CardCallgraphPanel. */
export async function buildPrCallgraph(
  prUrl: string,
  onProgress?: (p: BuildProgress) => void,
) {
  lazyWire();
  return buildCallgraph(prUrl, onProgress);
}
