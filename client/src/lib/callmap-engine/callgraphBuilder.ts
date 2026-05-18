// Orchestrates the full PR -> callgraph pipeline:
//   1. fetch PR meta + changed files
//   2. for each supported file, fetch base+head content
//   3. parse both sides with tree-sitter (lazy grammar load by language)
//   4. diff the function sets per file
//   5. build a PR-wide symbol table (v0.3) so calls in one file can
//      resolve to declarations in another
//   6. trim the result to the "delta neighborhood":
//        the changed/added/removed functions + their direct callers/callees
//      plus dimmed "external" placeholder nodes for unresolved calls
//
// Output: a CallGraphResult ready to feed into xyflow + dagre.

import {
  fetchChangedFiles,
  fetchFileAtSha,
  fetchPrMeta,
  isSupportedSource,
  parsePrUrl,
} from "./engine-github";
import { extractFunctions, type RawFn } from "./parser";
import { diffFile } from "./diffAnalyzer";
import {
  detectLanguage,
  grammarFor,
  languageGroup,
  type GrammarKey,
  type Language,
} from "./language";
import {
  getParseWorkerFactory,
  type ParseWorkerClient,
} from "./parseWorkerClient";
import type {
  CallGraphEdge,
  CallGraphResult,
  ChangedFunction,
  ChangeKind,
  RawCallRef,
} from "./types";

export interface BuildProgress {
  phase: "meta" | "files" | "parse" | "graph" | "done";
  message: string;
  current?: number;
  total?: number;
}

export type ProgressCb = (p: BuildProgress) => void;

// v0.5: a single `parse` call resolves `base` + `head` for one file.
// We expose this as a helper so the worker- and inline paths share the
// same shape.
async function parseFile(
  source: string,
  grammar: GrammarKey,
  worker: ParseWorkerClient | null,
  filename: string
): Promise<RawFn[]> {
  if (worker) {
    try {
      return await worker.parse(filename, source, grammar);
    } catch (err) {
      // Worker errors fall back to the inline parser so a single bad
      // file doesn't kill the whole build.
      console.warn(`[callmap] parse-worker failure on ${filename}, falling back inline:`, err);
      return extractFunctions(source, grammar);
    }
  }
  return extractFunctions(source, grammar);
}

export async function buildCallGraphFromPrUrl(
  url: string,
  onProgress?: ProgressCb
): Promise<CallGraphResult> {
  const parts = parsePrUrl(url);
  if (!parts) throw new Error("Invalid GitHub PR URL. Expected https://github.com/<owner>/<repo>/pull/<n>");

  onProgress?.({ phase: "meta", message: "Fetching PR metadata..." });
  const pr = await fetchPrMeta(parts);

  onProgress?.({ phase: "files", message: "Listing changed files..." });
  const files = (await fetchChangedFiles(parts)).filter((f) =>
    isSupportedSource(f.filename)
  );

  if (files.length === 0) {
    return {
      pr,
      functions: [],
      edges: [],
      stats: {
        filesScanned: 0,
        added: 0,
        removed: 0,
        changed: 0,
        contextNodes: 0,
        externalNodes: 0,
        byLanguage: {},
      },
    };
  }

  // Step 2 + 3 + 4: fetch + parse + diff per file.
  // v0.5: when a worker factory is registered we spin one up for this
  // build; the worker stays alive for the whole batch and is disposed
  // once we're done parsing. If anything goes wrong constructing the
  // worker we degrade silently to the inline path — the parse is just
  // slower, the result is identical.
  let worker: ParseWorkerClient | null = null;
  const factory = getParseWorkerFactory();
  if (factory) {
    try {
      const candidate = await factory();
      if (candidate) {
        await candidate.ready;
        worker = candidate;
      }
    } catch (err) {
      console.warn("[callmap] parse-worker setup failed, falling back inline:", err);
      worker = null;
    }
  }

  const allChanged: ChangedFunction[] = [];
  try {
    let i = 0;
    for (const f of files) {
      i++;
      onProgress?.({
        phase: "parse",
        message: `Parsing ${i} / ${files.length} files`,
        current: i,
        total: files.length,
      });

      const lang = detectLanguage(f.filename);
      const grammar = grammarFor(lang);
      if (!grammar) continue; // shouldn't happen — isSupportedSource was already true

      const [baseSrc, headSrc] = await Promise.all([
        f.status === "added"
          ? Promise.resolve<string | null>(null)
          : fetchFileAtSha(parts.owner, parts.repo, pr.baseSha, f.previous_filename || f.filename),
        f.status === "removed"
          ? Promise.resolve<string | null>(null)
          : fetchFileAtSha(parts.owner, parts.repo, pr.headSha, f.filename),
      ]);

      const baseFns = baseSrc ? await parseFile(baseSrc, grammar, worker, f.filename) : [];
      const headFns = headSrc ? await parseFile(headSrc, grammar, worker, f.filename) : [];

      const fileChanges = diffFile({
        file: f.filename,
        language: lang,
        baseFns,
        headFns,
      });
      allChanged.push(...fileChanges);
    }
  } finally {
    worker?.dispose();
  }

  onProgress?.({ phase: "graph", message: "Building graph..." });

  // Step 5a: build the PR-wide symbol table.
  // The table is keyed by the function's qualified name AND by its short
  // name so that a call site referencing the short name can still be
  // resolved when there's no ambiguity. Each entry records the candidate
  // function ids so callers can detect 1-vs-N matches.
  //
  // We only index head-side declarations (`unchanged`, `added`, `changed`).
  // `removed` declarations don't exist at head and shouldn't satisfy a head
  // call; conversely, a head call into a removed function is genuinely
  // unresolved — that's the bug we want to surface.
  type SymbolEntry = { id: string; file: string; language: Language };
  const symbolByName = new Map<string, SymbolEntry[]>();
  const symbolByQualified = new Map<string, SymbolEntry[]>();
  function addSymbol(map: Map<string, SymbolEntry[]>, key: string, entry: SymbolEntry) {
    const arr = map.get(key) ?? [];
    arr.push(entry);
    map.set(key, arr);
  }
  for (const fn of allChanged) {
    if (fn.kind === "removed") continue;
    const entry: SymbolEntry = { id: fn.id, file: fn.file, language: fn.language };
    addSymbol(symbolByName, fn.name, entry);
    addSymbol(symbolByQualified, fn.qualifiedName, entry);
  }

  // Step 5b: resolve every call site to a (set of) symbol ids.
  // Returns an array of target ids (0 = unresolved, 1 = resolved, >1 = ambiguous).
  function resolveCall(call: RawCallRef, ownerId: string): {
    targets: string[];
    ambiguous: boolean;
  } {
    // First try qualified name if we can construct one from the call site.
    if (call.qualifier) {
      const qkey = `${call.qualifier}.${call.name}`;
      const qm = symbolByQualified.get(qkey);
      if (qm && qm.length > 0) {
        const ids = qm.map((s) => s.id).filter((id) => id !== ownerId);
        return { targets: ids, ambiguous: ids.length > 1 };
      }
    }
    // Then try qualified-name lookup using the bare name (it equals the
    // qualified name for top-level functions, so most calls hit here).
    const direct = symbolByQualified.get(call.name);
    if (direct && direct.length === 1) {
      const ids = direct.map((s) => s.id).filter((id) => id !== ownerId);
      return { targets: ids, ambiguous: false };
    }
    // Fall back to short-name lookup across all files.
    const byShort = symbolByName.get(call.name);
    if (!byShort || byShort.length === 0) {
      return { targets: [], ambiguous: false };
    }
    const ids = byShort.map((s) => s.id).filter((id) => id !== ownerId);
    if (ids.length === 0) return { targets: [], ambiguous: false };
    if (ids.length === 1) return { targets: ids, ambiguous: false };
    // Multiple candidates — flag as ambiguous; do NOT pick one.
    return { targets: [], ambiguous: true };
  }

  // Step 6: pick the "interesting" set (added/removed/changed)
  // and pull in their direct callers + callees from the 'unchanged' pool.
  const interesting = allChanged.filter((fn) =>
    fn.kind === "added" || fn.kind === "removed" || fn.kind === "changed"
  );
  const interestingIds = new Set(interesting.map((f) => f.id));
  const byId = new Map(allChanged.map((f) => [f.id, f]));

  const contextSet = new Map<string, ChangedFunction>();

  // Direct callees of interesting functions: pull any matching unchanged
  // function into the context set so the call edge has a real target.
  for (const fn of interesting) {
    for (const call of fn.calls) {
      const { targets } = resolveCall(call, fn.id);
      for (const tid of targets) {
        if (interestingIds.has(tid)) continue;
        const match = byId.get(tid);
        if (match && match.kind === "unchanged" && !contextSet.has(match.id)) {
          contextSet.set(match.id, { ...match, kind: "neutral" });
        }
      }
    }
  }

  // Direct callers of interesting functions: an unchanged function that
  // calls an interesting one gets promoted to "neutral context".
  const interestingIdSet = new Set(interesting.map((f) => f.id));
  for (const fn of allChanged) {
    if (fn.kind !== "unchanged") continue;
    if (contextSet.has(fn.id)) continue;
    for (const call of fn.calls) {
      const { targets } = resolveCall(call, fn.id);
      if (targets.some((t) => interestingIdSet.has(t))) {
        contextSet.set(fn.id, { ...fn, kind: "neutral" });
        break;
      }
    }
  }

  // Step 7: assemble nodes + edges, attach disambiguation flags, and
  // synthesize "external" placeholder nodes for unresolved calls.
  const nodes: ChangedFunction[] = [...interesting, ...contextSet.values()];
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: CallGraphEdge[] = [];
  const seenEdges = new Set<string>();
  const externals = new Map<string, ChangedFunction>();
  // Per-node disambiguation state we'll merge back at the end.
  const ambiguousByNode = new Map<string, Set<string>>();

  function addEdge(source: string, target: string, external: boolean): void {
    if (source === target) return;
    const key = `${source}->${target}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ source, target, ...(external ? { external: true } : {}) });
  }

  function externalIdFor(call: RawCallRef): string {
    const tag = call.qualifier ? `${call.qualifier}.${call.name}` : call.name;
    return `__external__::${tag}`;
  }

  for (const n of nodes) {
    for (const call of n.calls) {
      const { targets, ambiguous } = resolveCall(call, n.id);
      if (ambiguous) {
        const s = ambiguousByNode.get(n.id) ?? new Set<string>();
        s.add(call.name);
        ambiguousByNode.set(n.id, s);
        continue; // skip drawing an edge — multiple candidates, can't pick one
      }
      if (targets.length === 0) {
        // External call — only synthesize a placeholder for interesting
        // nodes (we don't want to bloat the graph with externals reached
        // only via context).
        if (n.kind !== "added" && n.kind !== "removed" && n.kind !== "changed") continue;
        const extId = externalIdFor(call);
        if (!externals.has(extId)) {
          const label = call.qualifier ? `${call.qualifier}.${call.name}` : call.name;
          externals.set(extId, makeExternalNode(extId, label, n.language));
        }
        addEdge(n.id, extId, true);
        continue;
      }
      for (const tid of targets) {
        if (!nodeIds.has(tid)) continue;
        addEdge(n.id, tid, false);
      }
    }
  }

  // Merge ambiguity flags back onto the node objects.
  const finalNodes: ChangedFunction[] = nodes.map((n) => {
    const amb = ambiguousByNode.get(n.id);
    if (!amb || amb.size === 0) return n;
    return {
      ...n,
      disambiguated: false,
      ambiguousCallees: [...amb],
    };
  });

  // Append externals (after the node-id pass to avoid drawing edges into externals as resolutions).
  finalNodes.push(...externals.values());

  // Per-language breakdown: count only "real" functions (interesting +
  // context) — exclude external placeholders so the bar reflects code,
  // not stubs. Keyed by the coarse language group.
  const byLanguage: Record<string, number> = {};
  for (const n of finalNodes) {
    if (n.kind === "external") continue;
    const g = languageGroup(n.language);
    byLanguage[g] = (byLanguage[g] ?? 0) + 1;
  }

  const stats = {
    filesScanned: files.length,
    added: finalNodes.filter((n) => n.kind === "added").length,
    removed: finalNodes.filter((n) => n.kind === "removed").length,
    changed: finalNodes.filter((n) => n.kind === "changed").length,
    contextNodes: finalNodes.filter((n) => (n.kind as ChangeKind) === "neutral").length,
    externalNodes: externals.size,
    byLanguage,
  };

  onProgress?.({ phase: "done", message: "Done." });

  return { pr, functions: finalNodes, edges, stats };
}

function makeExternalNode(id: string, label: string, language: Language): ChangedFunction {
  // The external placeholder masquerades as a ChangedFunction so the
  // renderer doesn't need a separate node shape. It carries a synthetic
  // body for the source panel and a sentinel kind ("external") that the
  // FunctionNode component picks up to render the dimmed-with-badge style.
  return {
    id,
    name: label,
    qualifiedName: label,
    file: "(external)",
    language,
    startLine: 0,
    endLine: 0,
    body: `// External callee — '${label}' lives outside the changed-files set.\n// v0.3 doesn't fetch this file. v0.4+ may.`,
    declKind: "function",
    calls: [],
    kind: "external",
  };
}

// v0.4 alias: the documented public API name.
export const buildCallgraph = buildCallGraphFromPrUrl;
