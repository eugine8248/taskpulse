// Hand-rolled GitHub URL parser. Tolerant of:
//   - trailing slashes
//   - www. / leading whitespace
//   - #anchors and ?query strings
//   - .git suffix on the repo segment
//   - http:// or https://
//   - github.com or www.github.com
//
// Returns null for unrecognised shapes. Server-side only — never trusts the
// caller for routing decisions.

export type ParsedGithubUrl =
  | { kind: 'repo'; owner: string; repo: string }
  | { kind: 'pr'; owner: string; repo: string; number: number }
  | { kind: 'issue'; owner: string; repo: string; number: number }
  | { kind: 'commit'; owner: string; repo: string; sha: string };

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const SHA_RE = /^[a-f0-9]{7,40}$/i;

function stripRepoSuffix(s: string): string {
  return s.replace(/\.git$/i, '');
}

export function parseGithubUrl(raw: string): ParsedGithubUrl | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return null;

  // Trim leading/trailing slashes, drop fragment/query (already on URL),
  // then split on '/'.
  const pathParts = u.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) return null;

  const owner = pathParts[0];
  const repo = stripRepoSuffix(pathParts[1]);

  if (!OWNER_RE.test(owner)) return null;
  if (!REPO_RE.test(repo)) return null;

  if (pathParts.length === 2) {
    return { kind: 'repo', owner, repo };
  }

  // pathParts[2] is the verb: pull, issues, commit, etc.
  const verb = pathParts[2];
  if (verb === 'pull' || verb === 'pulls') {
    if (pathParts.length < 4) return null;
    const n = parseInt(pathParts[3], 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { kind: 'pr', owner, repo, number: n };
  }
  if (verb === 'issues') {
    if (pathParts.length < 4) return null;
    const n = parseInt(pathParts[3], 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { kind: 'issue', owner, repo, number: n };
  }
  if (verb === 'commit' || verb === 'commits') {
    if (pathParts.length < 4) return null;
    const sha = pathParts[3];
    if (!SHA_RE.test(sha)) return null;
    return { kind: 'commit', owner, repo, sha };
  }

  // Other verbs (tree, blob, releases…) — treat as a repo link.
  return { kind: 'repo', owner, repo };
}

/** Build the canonical https://github.com/owner/repo URL. */
export function buildRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}
