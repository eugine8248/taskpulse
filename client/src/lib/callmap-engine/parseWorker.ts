// v0.5 — Web Worker entry for tree-sitter parsing.
//
// The worker accepts an `init` message with the WASM URLs (resolved by
// the host) and a stream of `parse` messages with file batches. It
// emits one `result` per file and a final `done` when the batch is
// exhausted.
//
// Why a worker? The parser is the single biggest main-thread blocker
// on large PRs (50+ files × 200ms each = ~10s of jank). Moving it off
// the main thread keeps the UI responsive — progress text still updates,
// clicks still register, the spinner stays smooth.
//
// The host is responsible for *constructing* the worker (Vite needs
// `?worker&inline`, VS Code needs `new Worker(asWebviewUri(...))`) but
// once constructed, this module's wire protocol is identical across
// hosts.
//
// Wire protocol (host → worker):
//   { type: 'init',  payload: { wasmFiles: Record<string,string> } }
//   { type: 'parse', payload: { jobId, file: string, source: string, grammar: GrammarKey } }
//
// Wire protocol (worker → host):
//   { type: 'ready' }
//   { type: 'result',  payload: { jobId, file, language, fns: RawFn[] } }
//   { type: 'error',   payload: { jobId, file, error: string } }
//
// The worker keeps the parser and grammar caches local — they're reused
// across jobs in the same batch, so the per-file cost amortizes nicely.

import { extractFunctions, setWasmLoader, type RawFn } from "./parser";
import type { GrammarKey } from "./language";

// Inside a worker we don't have access to fetch over file:// (Tauri) so
// hosts pass pre-resolved URIs via the init payload. The worker turns
// each URI into bytes once and caches them.

export interface InitMessage {
  type: "init";
  payload: { wasmFiles: Record<string, string> };
}

export interface ParseMessage {
  type: "parse";
  payload: { jobId: number; file: string; source: string; grammar: GrammarKey };
}

export interface ReadyMessage {
  type: "ready";
}

export interface ResultMessage {
  type: "result";
  payload: { jobId: number; file: string; fns: RawFn[] };
}

export interface ErrorMessage {
  type: "error";
  payload: { jobId: number; file: string; error: string };
}

export type HostMessage = InitMessage | ParseMessage;
export type WorkerMessage = ReadyMessage | ResultMessage | ErrorMessage;

// Module-side state. The `?worker` Vite import will execute this
// script's top level inside the worker.
let initialized = false;
let bytesCache: Record<string, Uint8Array> = {};

function isWorkerScope(): boolean {
  // DedicatedWorkerGlobalScope check — works in browsers, Vite workers,
  // and the VS Code webview-spawned worker. We bail out cleanly if this
  // module is *imported* on the main thread (the typed-wrapper does
  // exactly that to share the type defs).
  return (
    typeof self !== "undefined" &&
    typeof (self as any).postMessage === "function" &&
    typeof (self as any).addEventListener === "function" &&
    typeof (self as any).document === "undefined"
  );
}

if (isWorkerScope()) {
  // Install a wasm loader that pulls from the host-supplied URI map.
  // We cache the bytes after first fetch so repeat grammar loads are
  // free.
  setWasmLoader(async (file) => {
    const cached = bytesCache[file];
    if (cached) return cached;
    const uri = pendingUris[file];
    if (!uri) {
      throw new Error(`parseWorker: no WASM URI registered for ${file}`);
    }
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`parseWorker: failed to fetch ${file}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    bytesCache[file] = buf;
    return buf;
  });

  const pendingUris: Record<string, string> = {};

  (self as any).addEventListener("message", async (e: MessageEvent<HostMessage>) => {
    const msg = e.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "init") {
      Object.assign(pendingUris, msg.payload.wasmFiles);
      initialized = true;
      (self as any).postMessage({ type: "ready" } as ReadyMessage);
      return;
    }
    if (msg.type === "parse") {
      const { jobId, file, source, grammar } = msg.payload;
      if (!initialized) {
        (self as any).postMessage({
          type: "error",
          payload: { jobId, file, error: "parseWorker not initialized" },
        } as ErrorMessage);
        return;
      }
      try {
        const fns = await extractFunctions(source, grammar);
        (self as any).postMessage({
          type: "result",
          payload: { jobId, file, fns },
        } as ResultMessage);
      } catch (err: unknown) {
        (self as any).postMessage({
          type: "error",
          payload: {
            jobId,
            file,
            error: err instanceof Error ? err.message : String(err),
          },
        } as ErrorMessage);
      }
    }
  });
}

// Empty export keeps this file a module under "isolatedModules": true.
export {};
