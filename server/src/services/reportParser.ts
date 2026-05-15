// Generic markdown parser for agent-generated audit reports.
//
// Recognises H1 title, H2 sections, and extracts headline finding counts
// (Critical / Important / Minor) via permissive regex over the document text.
//
// Designed so that a file written by stockpulse's Code Quality PM, UI Layout PM,
// or QA PM can be opened and rendered without per-PM-flavored conditional
// branches. Missing sections / counts return zero rather than throwing.

export interface ParsedReport {
  project: string;
  date: string;          // YYYY-MM-DD
  category: string;      // 'code-quality' | 'ui-layout' | 'qa'
  title: string;         // H1 line, or filename-derived fallback
  sections: { heading: string; body: string }[];
  counts: { critical: number; important: number; minor: number };
  rawMarkdown: string;
}

export interface ReportFileMeta {
  project: string;
  date: string;
  category: string;
}

export function parseReport(markdown: string, meta: ReportFileMeta): ParsedReport {
  // H1: first '# ...' line
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  const title = h1Match?.[1]?.trim() || `${meta.project} ${meta.date} ${meta.category}`;

  return {
    project: meta.project,
    date: meta.date,
    category: meta.category,
    title,
    sections: splitH2Sections(markdown),
    counts: extractCounts(markdown),
    rawMarkdown: markdown,
  };
}

function splitH2Sections(md: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  const lines = md.split(/\r?\n/);
  let current: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      if (current) out.push({ heading: current.heading, body: current.body.join('\n').trim() });
      current = { heading: h2[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
    // lines before the first H2 are deliberately discarded — they're the H1 + intro
  }
  if (current) out.push({ heading: current.heading, body: current.body.join('\n').trim() });
  return out;
}

/**
 * Extracts finding counts by looking for "**Critical:** N" or
 * "Critical: N" style markers anywhere in the document. Reports
 * from all three PM flavors follow one of these conventions.
 *
 * Strategy: capture every occurrence and SUM them. The stockpulse
 * code-quality report shows counts both in the FE-review section
 * and the BE-review section — we want the total. The UI Layout and
 * QA reports show counts once. Either way, summing produces a
 * comparable headline. If absolutely no markers are found, we fall
 * back to a row-counting heuristic over markdown tables that contain
 * the literal column "Critical".
 */
function extractCounts(md: string): { critical: number; important: number; minor: number } {
  const sum = (label: 'Critical' | 'Important' | 'Minor'): number => {
    // Match all common shapes:
    //   **Critical:** 4
    //   Critical: 4
    //   **Critical**: 4
    //   - Critical: 4
    // The two `\*{0,2}` halves cover the markdown bold delimiters in any
    // position; `:` is the only stable anchor.
    const re = new RegExp(`\\*{0,2}${label}\\*{0,2}\\s*:\\s*\\*{0,2}\\s*(\\d+)`, 'gi');
    let total = 0;
    let m: RegExpExecArray | null;
    let any = false;
    while ((m = re.exec(md)) !== null) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) {
        total += n;
        any = true;
      }
    }
    if (any) return total;
    return 0;
  };

  let critical = sum('Critical');
  let important = sum('Important');
  let minor = sum('Minor');

  // Fallback heuristic — look for a count from the QA-style top-line table
  // ("Visual findings | V = 5", "Cross-device findings | D = 28", etc.)
  if (critical + important + minor === 0) {
    const findingsLines = md.match(/findings.*=\s*\d+/gi) || [];
    for (const line of findingsLines) {
      const n = parseInt(line.match(/(\d+)/)?.[1] || '0', 10);
      if (line.match(/regression/i)) continue;
      if (Number.isFinite(n)) important += n;
    }
  }

  return { critical, important, minor };
}
