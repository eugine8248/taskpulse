// Language detection by filename extension. The parser and source
// panel both consult this to pick the right grammar / syntax highlighter.
//
// v0.3 ships TS / JS / TSX / JSX / Python / Go. Anything else returns
// "unknown" and the caller treats the file as unsupported.

export type Language = "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "unknown";

/**
 * The grammar key passed to the tree-sitter loader. Several Languages
 * collapse onto the same grammar (e.g. ts + tsx → "typescript").
 */
export type GrammarKey = "typescript" | "javascript" | "python" | "go";

export function detectLanguage(filename: string): Language {
  const ext = filename.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
  switch (ext) {
    case "ts":
      return "ts";
    case "tsx":
      return "tsx";
    case "js":
    case "mjs":
    case "cjs":
      return "js";
    case "jsx":
      return "jsx";
    case "py":
    case "pyi":
      return "py";
    case "go":
      return "go";
    default:
      return "unknown";
  }
}

export function grammarFor(lang: Language): GrammarKey | null {
  switch (lang) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "go":
      return "go";
    default:
      return null;
  }
}

/** A human label suitable for UI badges and the languages view. */
export function languageLabel(lang: Language): string {
  switch (lang) {
    case "ts":
      return "TS";
    case "tsx":
      return "TSX";
    case "js":
      return "JS";
    case "jsx":
      return "JSX";
    case "py":
      return "Py";
    case "go":
      return "Go";
    default:
      return "?";
  }
}

/** Coarser grouping used by status-bar breakdown — TSX/JSX collapse into TS/JS. */
export type LanguageGroup = "ts" | "js" | "py" | "go" | "unknown";

export function languageGroup(lang: Language): LanguageGroup {
  switch (lang) {
    case "ts":
    case "tsx":
      return "ts";
    case "js":
    case "jsx":
      return "js";
    case "py":
      return "py";
    case "go":
      return "go";
    default:
      return "unknown";
  }
}

export function groupLabel(g: LanguageGroup): string {
  switch (g) {
    case "ts":
      return "ts";
    case "js":
      return "js";
    case "py":
      return "py";
    case "go":
      return "go";
    default:
      return "?";
  }
}

export function isSupported(lang: Language): boolean {
  return lang !== "unknown";
}

export function isSupportedFilename(filename: string): boolean {
  return isSupported(detectLanguage(filename));
}
