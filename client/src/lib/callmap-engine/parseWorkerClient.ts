// v0.5 — Typed client wrapper around a parse worker.
//
// Hosts construct the Worker themselves (the construction syntax differs
// per bundler: Vite uses `new MyWorker()` from `?worker` imports, VS Code
// webviews use `new Worker(asWebviewUri(...))`). They hand the
// constructed worker to `wrapParseWorker()` which gives the engine a
// promise-based API.
//
// The wrapper keeps a `Map<jobId, resolver>` so concurrent parse jobs
// can be queued without colliding. We assign monotonically increasing
// ids and resolve/reject as `result` / `error` messages arrive.

import type { RawFn } from "./parser";
import type { GrammarKey } from "./language";

export interface ParseWorkerClient {
  /** Wait for the worker to acknowledge `init` so we know it's safe to send parse jobs. */
  ready: Promise<void>;
  /** Send a file to the worker; resolves with the extracted functions. */
  parse(file: string, source: string, grammar: GrammarKey): Promise<RawFn[]>;
  /** Tear down — fires Worker.terminate(). The caller should drop their reference too. */
  dispose(): void;
}

export interface ParseWorkerLike {
  postMessage(msg: unknown): void;
  terminate?(): void;
  addEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
}

/**
 * Wrap a host-constructed Worker (or any object satisfying the small
 * `ParseWorkerLike` interface) into a typed client. The wrapper sends
 * the `init` message itself — callers only need to supply the WASM URI
 * map so the worker can resolve grammar files.
 */
export function wrapParseWorker(
  worker: ParseWorkerLike,
  wasmFiles: Record<string, string>
): ParseWorkerClient {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (fns: RawFn[]) => void; reject: (err: Error) => void }
  >();

  let resolveReady!: () => void;
  const ready = new Promise<void>((res) => {
    resolveReady = res;
  });

  function onMessage(ev: MessageEvent) {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ready") {
      resolveReady();
      return;
    }
    if (msg.type === "result") {
      const p = pending.get(msg.payload.jobId);
      if (p) {
        pending.delete(msg.payload.jobId);
        p.resolve(msg.payload.fns);
      }
      return;
    }
    if (msg.type === "error") {
      const p = pending.get(msg.payload.jobId);
      if (p) {
        pending.delete(msg.payload.jobId);
        p.reject(new Error(msg.payload.error));
      }
      return;
    }
  }

  worker.addEventListener("message", onMessage);
  worker.postMessage({ type: "init", payload: { wasmFiles } });

  return {
    ready,
    parse(file, source, grammar) {
      return new Promise<RawFn[]>((resolve, reject) => {
        const jobId = nextId++;
        pending.set(jobId, { resolve, reject });
        worker.postMessage({
          type: "parse",
          payload: { jobId, file, source, grammar },
        });
      });
    },
    dispose() {
      worker.removeEventListener("message", onMessage);
      // Reject any in-flight jobs so callers don't hang.
      for (const [, p] of pending) {
        p.reject(new Error("parse worker disposed"));
      }
      pending.clear();
      worker.terminate?.();
    },
  };
}

// ── Worker-factory injection ──────────────────────────────────────────
// Hosts that *want* worker-parsing call `setParseWorkerFactory()` with
// a function that returns a fresh ParseWorkerClient. The callgraph
// builder calls it once at the start of each PR build.
//
// If no factory is set (or the factory throws — e.g. in Node tests),
// the builder falls back to the inline parser on the calling thread.

export type ParseWorkerFactory = () =>
  | ParseWorkerClient
  | Promise<ParseWorkerClient>
  | null;

let activeFactory: ParseWorkerFactory | null = null;

export function setParseWorkerFactory(factory: ParseWorkerFactory | null): void {
  activeFactory = factory;
}

export function getParseWorkerFactory(): ParseWorkerFactory | null {
  return activeFactory;
}
