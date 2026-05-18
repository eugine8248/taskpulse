// Shared types for the callmap pipeline.
//
// v0.4: relocated from src/types.ts into @callmap/core so both the
// desktop app and the VS Code extension can pull from a single source.

import type { Language } from "./language";

export type ChangeKind =
  | "added"
  | "removed"
  | "changed"
  | "unchanged"
  | "neutral"
  | "external"; // v0.3: dimmed placeholder for calls outside the changed set

export interface RawCallRef {
  name: string;
  qualifier?: string;
}

export interface ParsedFunction {
  id: string;            // stable hash: file + name + kind
  name: string;          // short name (foo)
  qualifiedName: string; // class- or receiver-qualified name (Foo.bar)
  file: string;
  language: Language;
  startLine: number;
  endLine: number;
  body: string;
  declKind: "function" | "arrow" | "method" | "expression";
  calls: RawCallRef[];   // structured call sites
}

export interface ChangedFunction extends ParsedFunction {
  kind: ChangeKind;
  oldBody?: string;      // present for 'changed' (the base version) so we can diff in the source panel
  /**
   * v0.3 cross-file resolution: false when this node has at least one
   * call that matched multiple candidates in the symbol table. The
   * source-panel renders an info hover explaining the ambiguity.
   */
  disambiguated?: boolean;
  /** Names of callees that were left ambiguous, for hover-tooltip. */
  ambiguousCallees?: string[];
}

export interface PullRequestMeta {
  owner: string;
  repo: string;
  number: number;
  title: string;
  baseSha: string;
  headSha: string;
  url: string;
}

export interface ChangedFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | string;
  previous_filename?: string;
}

export interface CallGraphEdge {
  source: string;
  target: string;
  /** v0.3: edge points at a dimmed external node (callee not in PR set). */
  external?: boolean;
}

export interface CallGraphResult {
  pr: PullRequestMeta;
  functions: ChangedFunction[];
  edges: CallGraphEdge[];
  stats: {
    filesScanned: number;
    added: number;
    removed: number;
    changed: number;
    contextNodes: number;
    /** v0.3: number of dimmed external-call placeholder nodes. */
    externalNodes: number;
    /** v0.3: per-language function counts, keyed by LanguageGroup. */
    byLanguage: Record<string, number>;
  };
}

export interface RecentPr {
  url: string;
  title: string;
  loadedAt: number;
}

/**
 * v0.5: a node bookmark. `prKey` follows the `<owner>/<repo>#<number>`
 * shape so it's easy to read in storage and easy to filter on. `nodeId`
 * matches the `ChangedFunction.id` so the host can re-center on the
 * function when the user clicks the entry.
 */
export interface Bookmark {
  prKey: string;
  nodeId: string;
  name: string;
  file: string;
  startLine: number;
  addedAt: number;
}
