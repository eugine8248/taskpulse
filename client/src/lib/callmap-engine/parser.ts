// Tree-sitter wrapper. Loads the runtime + grammar WASM files lazily —
// a grammar is only fetched when the first file of that language is
// encountered. Returns a fresh Parser per call.
//
// v0.3 added Python and Go alongside TS/JS. Each language has its
// own AST walker because tree-sitter node-type names diverge across
// grammars (function_definition vs function_declaration, etc.).
//
// v0.4: the WASM-path resolution moved behind a caller-supplied loader.
// The desktop app loads from /public/*.wasm; the VS Code extension uses
// the webview's URI-rewriting (asWebviewUri) so the renderer process can
// fetch from the extension's media directory through the CSP-safe URI.
// If no loader is set we fall back to fetching from "/<filename>" which
// is the v0.3 desktop behavior — keeps the package usable standalone.

import Parser from "web-tree-sitter";
import type { GrammarKey } from "./language";

type Language = Parser.Language;

// ── WASM loader injection ───────────────────────────────────────────
// The runtime (`tree-sitter.wasm`) and grammar (`tree-sitter-<lang>.wasm`)
// files are fetched via the same loader. The default loader uses a
// browser-style fetch from the page root, so the desktop app keeps the
// v0.3 behavior with zero config.

export type WasmLoader = (file: string) => Promise<ArrayBuffer | Uint8Array | string>;

const defaultLoader: WasmLoader = async (file) => {
  // Resolve `file` relative to the document root. Works for both Vite dev
  // and the Tauri-bundled production app (public/ → /).
  return `/${file}`;
};

let activeLoader: WasmLoader = defaultLoader;

/**
 * Inject a host-specific WASM loader. The desktop app does not need to
 * call this (the default loader matches its layout); the VS Code
 * extension uses it to resolve `media/*.wasm` via `asWebviewUri`.
 *
 * The loader may return either a URL string (passed through to
 * `Parser.init({ locateFile })` / `Parser.Language.load`) or a raw
 * ArrayBuffer / Uint8Array. The latter is the only safe option in
 * VS Code webviews because cross-origin file:// fetches are blocked
 * even after `asWebviewUri`.
 */
export function setWasmLoader(loader: WasmLoader): void {
  activeLoader = loader;
  // Clear cached state so a re-load picks up the new loader.
  initPromise = null;
  langCache.clear();
}

let initPromise: Promise<void> | null = null;
const langCache = new Map<GrammarKey, Language | null>();

async function ensureRuntime(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Resolve the runtime first so locateFile() can route the grammar
    // requests through the same loader.
    const resolved = await activeLoader("tree-sitter.wasm");
    if (typeof resolved === "string") {
      await Parser.init({ locateFile: () => resolved });
    } else {
      // ArrayBuffer / Uint8Array path — emscripten accepts a binary
      // blob via wasmBinary. We forward it through the locateFile API
      // by stashing it on a sentinel URL the bundler won't try to fetch.
      const buf = resolved instanceof Uint8Array ? resolved : new Uint8Array(resolved);
      await Parser.init({
        // emscripten consults locateFile for the .wasm path; returning a
        // data: URL would force another fetch, so we hand back the
        // resolved bytes via `wasmBinary` on the same options object.
        // web-tree-sitter forwards extra keys straight to the Module.
        // (cast through unknown to bypass the narrow public types)
        wasmBinary: buf,
      } as unknown as Parameters<typeof Parser.init>[0]);
    }
  })();
  return initPromise;
}

const WASM_FILES: Record<GrammarKey, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
};

async function loadLanguage(lang: GrammarKey): Promise<Language | null> {
  const cached = langCache.get(lang);
  if (cached !== undefined) return cached;
  await ensureRuntime();
  try {
    const resolved = await activeLoader(WASM_FILES[lang]);
    let language: Language;
    if (typeof resolved === "string") {
      language = await Parser.Language.load(resolved);
    } else {
      const buf = resolved instanceof Uint8Array ? resolved : new Uint8Array(resolved);
      // Parser.Language.load accepts both URL strings and Uint8Array
      // (undocumented but present in the runtime).
      language = await Parser.Language.load(buf as unknown as string);
    }
    langCache.set(lang, language);
    return language;
  } catch (err) {
    console.warn(`[callmap/core] failed to load ${lang} grammar:`, err);
    langCache.set(lang, null);
    return null;
  }
}

export async function getParser(lang: GrammarKey): Promise<Parser | null> {
  const language = await loadLanguage(lang);
  if (!language) return null;
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

export interface RawFn {
  name: string;             // simple short name (foo)
  qualifiedName: string;    // class- or receiver-qualified name (Foo.bar, *Receiver.Method)
  startLine: number;
  endLine: number;
  body: string;
  declKind: "function" | "arrow" | "method" | "expression";
  calls: RawCall[];
}

export interface RawCall {
  /** The bare callee name (e.g. `foo` or `bar` in `pkg.bar()`). */
  name: string;
  /** Optional qualifier on the call site — class/receiver/package prefix. */
  qualifier?: string;
}

// Public API: parse a source string and return all top-level + nested functions.
export async function extractFunctions(
  source: string,
  lang: GrammarKey
): Promise<RawFn[]> {
  const parser = await getParser(lang);
  if (!parser) {
    // Only JS/TS have a usable regex fallback. Python/Go return [].
    if (lang === "typescript" || lang === "javascript") return regexExtractJs(source);
    return [];
  }
  const tree = parser.parse(source);
  if (!tree) return [];
  const fns: RawFn[] = [];
  if (lang === "python") {
    walkPython(tree.rootNode, source, fns, null);
  } else if (lang === "go") {
    walkGo(tree.rootNode, source, fns);
  } else {
    walkJs(tree.rootNode, source, fns);
  }
  return fns;
}

// v0.4 alias matching the documented public API (parser.ts already exports
// extractFunctions; parseSource keeps the docs-readable surface area).
export const parseSource = extractFunctions;

/**
 * Convenience helper: parse `source` once and return the list of
 * functions detected in the resulting tree. Used by tooling that wants
 * the function list without re-running the whole pipeline.
 */
export async function getFunctionsInTree(
  source: string,
  lang: GrammarKey
): Promise<RawFn[]> {
  return extractFunctions(source, lang);
}

// ───────────────────────────── JS / TS ────────────────────────────
// AST walk. We recognize:
//   function_declaration                              -> function foo() {}
//   method_definition                                 -> class X { foo() {} }
//   variable_declarator with arrow_function/function  -> const foo = () => {}
//   public_field_definition with arrow                -> class X { foo = () => {} }
//   export_statement wrapping any of the above        -> handled by recursion
function walkJs(node: any, source: string, out: RawFn[]): void {
  const t = node.type as string;

  if (t === "function_declaration" || t === "generator_function_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) out.push(makeJsFn(nameNode.text, nameNode.text, "function", node, source));
  } else if (t === "method_definition") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const cls = enclosingClassNameJs(node);
      const qual = cls ? `${cls}.${nameNode.text}` : nameNode.text;
      out.push(makeJsFn(nameNode.text, qual, "method", node, source));
    }
  } else if (t === "variable_declarator" || t === "public_field_definition") {
    const nameNode = node.childForFieldName("name");
    const valueNode = node.childForFieldName("value");
    if (
      nameNode &&
      valueNode &&
      (valueNode.type === "arrow_function" ||
        valueNode.type === "function_expression" ||
        valueNode.type === "function")
    ) {
      const kind: RawFn["declKind"] =
        valueNode.type === "arrow_function" ? "arrow" : "expression";
      const isField = t === "public_field_definition";
      const cls = isField ? enclosingClassNameJs(node) : null;
      const qual = cls ? `${cls}.${nameNode.text}` : nameNode.text;
      out.push(makeJsFn(nameNode.text, qual, kind, valueNode, source));
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    walkJs(node.child(i), source, out);
  }
}

function enclosingClassNameJs(node: any): string | null {
  let cur = node.parent;
  while (cur) {
    if (cur.type === "class_declaration" || cur.type === "class") {
      const n = cur.childForFieldName("name");
      if (n) return n.text;
    }
    cur = cur.parent;
  }
  return null;
}

function makeJsFn(
  name: string,
  qualifiedName: string,
  declKind: RawFn["declKind"],
  bodyNode: any,
  source: string
): RawFn {
  const start = bodyNode.startPosition.row + 1;
  const end = bodyNode.endPosition.row + 1;
  const body = source.slice(bodyNode.startIndex, bodyNode.endIndex);
  const calls = extractCallsJs(bodyNode);
  return { name, qualifiedName, declKind, startLine: start, endLine: end, body, calls };
}

function extractCallsJs(node: any): RawCall[] {
  const calls: RawCall[] = [];
  const queue: any[] = [node];
  while (queue.length) {
    const n = queue.shift();
    if (!n) continue;
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function") ?? n.child(0);
      const c = calleeJs(fn);
      if (c) calls.push(c);
    }
    for (let i = 0; i < n.childCount; i++) queue.push(n.child(i));
  }
  return calls;
}

function calleeJs(n: any): RawCall | null {
  if (!n) return null;
  if (n.type === "identifier" || n.type === "property_identifier") {
    return { name: n.text };
  }
  if (n.type === "member_expression") {
    const obj = n.childForFieldName("object");
    const prop = n.childForFieldName("property");
    if (!prop) return null;
    const qualifier =
      obj && (obj.type === "identifier" || obj.type === "this_expression")
        ? obj.text
        : undefined;
    return { name: prop.text, qualifier };
  }
  // Optional chain: foo?.() — descend into the expression child
  if (n.childCount > 0) return calleeJs(n.child(0));
  return null;
}

// ─────────────────────────────── Python ───────────────────────────
// def fn(): ...                      -> function_definition
// class X: def fn(): ...             -> function_definition nested under class_definition
function walkPython(node: any, source: string, out: RawFn[], cls: string | null): void {
  const t = node.type as string;
  if (t === "class_definition") {
    const nameNode = node.childForFieldName("name");
    const className = nameNode ? nameNode.text : null;
    const body = node.childForFieldName("body");
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        walkPython(body.child(i), source, out, className);
      }
    }
    return;
  }
  if (t === "function_definition") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const name = nameNode.text;
      const qual = cls ? `${cls}.${name}` : name;
      const declKind: RawFn["declKind"] = cls ? "method" : "function";
      out.push(makePyFn(name, qual, declKind, node, source));
    }
    // Don't descend into the function body for nested-def discovery —
    // matches the v0.3 design (top-level + class methods only).
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    walkPython(node.child(i), source, out, cls);
  }
}

function makePyFn(
  name: string,
  qualifiedName: string,
  declKind: RawFn["declKind"],
  node: any,
  source: string
): RawFn {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  const body = source.slice(node.startIndex, node.endIndex);
  const calls = extractCallsPython(node);
  return { name, qualifiedName, declKind, startLine: start, endLine: end, body, calls };
}

function extractCallsPython(node: any): RawCall[] {
  const calls: RawCall[] = [];
  const queue: any[] = [node];
  while (queue.length) {
    const n = queue.shift();
    if (!n) continue;
    if (n.type === "call") {
      const fn = n.childForFieldName("function") ?? n.child(0);
      const c = calleePython(fn);
      if (c) calls.push(c);
    }
    for (let i = 0; i < n.childCount; i++) queue.push(n.child(i));
  }
  return calls;
}

function calleePython(n: any): RawCall | null {
  if (!n) return null;
  if (n.type === "identifier") return { name: n.text };
  if (n.type === "attribute") {
    // obj.method — child "object" is the receiver, "attribute" is the name
    const obj = n.childForFieldName("object");
    const attr = n.childForFieldName("attribute");
    if (!attr) return null;
    const qualifier =
      obj && obj.type === "identifier" ? obj.text : undefined;
    return { name: attr.text, qualifier };
  }
  if (n.childCount > 0) return calleePython(n.child(0));
  return null;
}

// ───────────────────────────────── Go ─────────────────────────────
// func Foo() {}              -> function_declaration
// func (r *T) Foo() {}       -> method_declaration with receiver field
function walkGo(node: any, source: string, out: RawFn[]): void {
  const t = node.type as string;
  if (t === "function_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      out.push(makeGoFn(nameNode.text, nameNode.text, "function", node, source));
    }
  } else if (t === "method_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const recvType = goReceiverType(node);
      const qual = recvType ? `${recvType}.${nameNode.text}` : nameNode.text;
      out.push(makeGoFn(nameNode.text, qual, "method", node, source));
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    walkGo(node.child(i), source, out);
  }
}

function goReceiverType(methodNode: any): string | null {
  // method_declaration has a "receiver" field — a parameter_list with a
  // single parameter_declaration whose type is either a pointer_type
  // (*T) or a type_identifier (T).
  const recv = methodNode.childForFieldName("receiver");
  if (!recv) return null;
  // Walk descendants for the first type_identifier we can find.
  const queue: any[] = [recv];
  while (queue.length) {
    const n = queue.shift();
    if (!n) continue;
    if (n.type === "type_identifier") return n.text;
    for (let i = 0; i < n.childCount; i++) queue.push(n.child(i));
  }
  return null;
}

function makeGoFn(
  name: string,
  qualifiedName: string,
  declKind: RawFn["declKind"],
  node: any,
  source: string
): RawFn {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  const body = source.slice(node.startIndex, node.endIndex);
  const calls = extractCallsGo(node);
  return { name, qualifiedName, declKind, startLine: start, endLine: end, body, calls };
}

function extractCallsGo(node: any): RawCall[] {
  const calls: RawCall[] = [];
  const queue: any[] = [node];
  while (queue.length) {
    const n = queue.shift();
    if (!n) continue;
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function") ?? n.child(0);
      const c = calleeGo(fn);
      if (c) calls.push(c);
    }
    for (let i = 0; i < n.childCount; i++) queue.push(n.child(i));
  }
  return calls;
}

function calleeGo(n: any): RawCall | null {
  if (!n) return null;
  if (n.type === "identifier") return { name: n.text };
  if (n.type === "selector_expression") {
    // `pkg.Func` or `obj.Method`. Strip the prefix into qualifier and
    // keep the bare method name for name-only resolution.
    const operand = n.childForFieldName("operand");
    const field = n.childForFieldName("field");
    if (!field) return null;
    const qualifier =
      operand && operand.type === "identifier" ? operand.text : undefined;
    return { name: field.text, qualifier };
  }
  if (n.childCount > 0) return calleeGo(n.child(0));
  return null;
}

// ─────────────────── Regex fallback (JS/TS only) ──────────────────
function regexExtractJs(source: string): RawFn[] {
  const fns: RawFn[] = [];
  const lines = source.split("\n");
  const reFn = /(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const reArrow =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  const seen = new Set<string>();
  for (const re of [reFn, reArrow]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      const idx = m.index;
      const startLine = source.slice(0, idx).split("\n").length;
      const endLine = Math.min(lines.length, startLine + 30);
      const body = lines.slice(startLine - 1, endLine).join("\n");
      const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
      const calls: RawCall[] = [];
      let c: RegExpExecArray | null;
      while ((c = callRe.exec(body)) !== null) {
        if (
          c[1] !== name &&
          c[1] !== "function" &&
          c[1] !== "if" &&
          c[1] !== "for" &&
          c[1] !== "while" &&
          c[1] !== "switch" &&
          c[1] !== "return"
        ) {
          calls.push({ name: c[1] });
        }
      }
      fns.push({
        name,
        qualifiedName: name,
        declKind: re === reFn ? "function" : "arrow",
        startLine,
        endLine,
        body,
        calls,
      });
    }
  }
  return fns;
}
