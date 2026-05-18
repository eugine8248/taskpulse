// Given two sets of parsed functions (base vs head) for the same file,
// classify each function as added / removed / changed / unchanged.
//
// Matching strategy: match by qualifiedName (class/receiver-qualified
// in v0.3). For top-level functions, qualifiedName == name so the
// behavior is unchanged from v0.2. For class methods, `Foo.bar` and
// `Baz.bar` no longer collide.

import type { ChangedFunction, ParsedFunction } from "./types";
import type { RawFn } from "./parser";
import type { Language } from "./language";

export interface DiffInput {
  file: string;
  language: Language;
  baseFns: RawFn[];
  headFns: RawFn[];
}

export function diffFile(input: DiffInput): ChangedFunction[] {
  const { file, language, baseFns, headFns } = input;
  const baseByName = new Map<string, RawFn>();
  baseFns.forEach((f) => baseByName.set(f.qualifiedName, f));

  const out: ChangedFunction[] = [];
  const seenInHead = new Set<string>();

  for (const head of headFns) {
    seenInHead.add(head.qualifiedName);
    const base = baseByName.get(head.qualifiedName);
    if (!base) {
      out.push(toChanged(head, file, language, "added"));
    } else if (normalize(base.body) !== normalize(head.body)) {
      out.push({ ...toChanged(head, file, language, "changed"), oldBody: base.body });
    } else {
      out.push(toChanged(head, file, language, "unchanged"));
    }
  }

  // removed: in base, missing in head
  for (const base of baseFns) {
    if (!seenInHead.has(base.qualifiedName)) {
      out.push(toChanged(base, file, language, "removed"));
    }
  }
  return out;
}

function normalize(body: string): string {
  // Whitespace-insensitive comparison so reformatting alone doesn't count as a change.
  return body.replace(/\s+/g, " ").trim();
}

function toChanged(
  raw: RawFn,
  file: string,
  language: Language,
  kind: ChangedFunction["kind"]
): ChangedFunction {
  const id = `${file}::${raw.qualifiedName}::${raw.declKind}`;
  const parsed: ParsedFunction = {
    id,
    name: raw.name,
    qualifiedName: raw.qualifiedName,
    file,
    language,
    startLine: raw.startLine,
    endLine: raw.endLine,
    body: raw.body,
    declKind: raw.declKind,
    calls: raw.calls.map((c) => ({ name: c.name, qualifier: c.qualifier })),
  };
  return { ...parsed, kind };
}

// v0.4 alias: analyzeDiff is the spec-named entry point.
export const analyzeDiff = diffFile;
