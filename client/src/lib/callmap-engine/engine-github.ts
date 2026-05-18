// Minimal GitHub REST client for the callmap pipeline:
//   - parse PR URL
//   - fetch PR metadata (base/head SHAs)
//   - fetch list of changed files
//   - fetch raw file content at a given SHA
//
// Rate limit awareness: we surface X-RateLimit-Remaining/Limit
// via the `rateLimit` field on every response.
//
// v0.4: the token provider is injected by the host. The desktop app
// supplies a function that reads the user's PAT from localStorage;
// the VS Code extension uses the GitHub Authentication session token
// (vscode.authentication.getSession('github')). Optionally, the host
// can replace the entire fetch pipeline via setHttp — VS Code uses
// this to proxy requests through the extension host (postMessage),
// sidestepping the webview CSP.

import type { ChangedFile, PullRequestMeta } from "./types";

const GH_API = "https://api.github.com";

export interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: number; // unix seconds
}

export interface PrUrlParts {
  owner: string;
  repo: string;
  number: number;
}

let lastRateLimit: RateLimit | null = null;

export function getLastRateLimit(): RateLimit | null {
  return lastRateLimit;
}

// ── Token injection ────────────────────────────────────────────────
// Hosts override the token provider. Default: no token (anonymous
// 60 req/hr GitHub limit) — useful for smoke tests and the dev server.
let tokenProvider: () => string | null = () => null;

export function setTokenProvider(p: () => string | null | undefined): void {
  tokenProvider = () => p() ?? null;
}

// ── HTTP injection ─────────────────────────────────────────────────
// The webview can't talk to api.github.com directly (CSP), so the
// VS Code extension supplies a custom fetcher that proxies through the
// extension host via postMessage.

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<any>;
  headers: { get(name: string): string | null };
}

export type HttpFetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<HttpResponse>;

let httpFetcher: HttpFetcher | null = null;

export function setHttp(fetcher: HttpFetcher | null): void {
  httpFetcher = fetcher;
}

async function doFetch(url: string, headers: Record<string, string>): Promise<HttpResponse> {
  if (httpFetcher) return httpFetcher(url, { headers });
  // Built-in fetch path — works in browsers, Tauri, Node 18+, and
  // VS Code's extension host (Node-side).
  const res = await fetch(url, { headers });
  return {
    ok: res.ok,
    status: res.status,
    text: () => res.text(),
    json: () => res.json(),
    headers: { get: (n: string) => res.headers.get(n) },
  };
}

export function parsePrUrl(input: string): PrUrlParts | null {
  const trimmed = input.trim();
  // Accept: https://github.com/<owner>/<repo>/pull/<number>  (with optional /files or trailing slash)
  const m = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:\b|\/)/i
  );
  if (!m) return null;
  return {
    owner: m[1],
    repo: m[2],
    number: parseInt(m[3], 10),
  };
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
  const token = tokenProvider();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function captureRateLimit(res: HttpResponse): void {
  const remaining = res.headers.get("X-RateLimit-Remaining");
  const limit = res.headers.get("X-RateLimit-Limit");
  const reset = res.headers.get("X-RateLimit-Reset");
  if (remaining !== null && limit !== null && reset !== null) {
    lastRateLimit = {
      remaining: parseInt(remaining, 10),
      limit: parseInt(limit, 10),
      resetAt: parseInt(reset, 10),
    };
  }
}

export class GithubError extends Error {
  status: number;
  isRateLimit: boolean;
  constructor(message: string, status: number, isRateLimit = false) {
    super(message);
    this.status = status;
    this.isRateLimit = isRateLimit;
  }
}

async function ghFetch<T>(url: string, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await doFetch(url, buildHeaders(extraHeaders));
  captureRateLimit(res);
  if (!res.ok) {
    const rl = res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0";
    const body = await res.text().catch(() => "");
    throw new GithubError(
      `GitHub API ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      rl
    );
  }
  return (await res.json()) as T;
}

// v0.5: parse `Link: <…>; rel="next"` headers to walk paginated endpoints.
// We only need rel="next" — the absence of that link means we're done.
function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  // Link headers come as: <url1>; rel="next", <url2>; rel="last"
  // Use a tolerant split — commas inside <> would break a naive .split(",").
  const re = /<([^>]+)>\s*;\s*rel="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(link)) !== null) {
    if (m[2] === "next") return m[1];
  }
  return null;
}

async function ghFetchAllPages<T>(url: string, extraHeaders?: Record<string, string>): Promise<T[]> {
  // Sequential pagination — keeps us within the secondary-rate-limit
  // budget (one in-flight request at a time) and lets each page's
  // Link header dictate the next URL.
  const acc: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await doFetch(next, buildHeaders(extraHeaders));
    captureRateLimit(res);
    if (!res.ok) {
      const rl = res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0";
      const body = await res.text().catch(() => "");
      throw new GithubError(
        `GitHub API ${res.status}: ${body.slice(0, 200)}`,
        res.status,
        rl
      );
    }
    const page = (await res.json()) as T[];
    if (Array.isArray(page)) acc.push(...page);
    next = parseNextLink(res.headers.get("Link"));
  }
  return acc;
}

export async function fetchPrMeta(parts: PrUrlParts): Promise<PullRequestMeta> {
  const url = `${GH_API}/repos/${parts.owner}/${parts.repo}/pulls/${parts.number}`;
  const data = await ghFetch<any>(url);
  return {
    owner: parts.owner,
    repo: parts.repo,
    number: parts.number,
    title: data.title,
    baseSha: data.base.sha,
    headSha: data.head.sha,
    url: data.html_url,
  };
}

export async function fetchChangedFiles(parts: PrUrlParts): Promise<ChangedFile[]> {
  // v0.5: walk Link: rel="next" until exhausted. GitHub returns up to
  // 3000 files per PR (hard cap); we hit one page at a time to respect
  // the secondary rate-limit guidance.
  const url = `${GH_API}/repos/${parts.owner}/${parts.repo}/pulls/${parts.number}/files?per_page=100`;
  const data = await ghFetchAllPages<any>(url);
  return data.map((f) => ({
    filename: f.filename,
    status: f.status,
    previous_filename: f.previous_filename,
  }));
}

export async function fetchFileAtSha(
  owner: string,
  repo: string,
  sha: string,
  path: string
): Promise<string | null> {
  // Raw content via the contents API. We use the raw media type to skip base64.
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(
    path
  )}?ref=${encodeURIComponent(sha)}`;
  const res = await doFetch(url, buildHeaders({ Accept: "application/vnd.github.raw" }));
  captureRateLimit(res);
  if (res.status === 404) return null; // file doesn't exist at this SHA (added/removed case)
  if (!res.ok) {
    const rl = res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0";
    throw new GithubError(`GitHub raw fetch ${res.status}`, res.status, rl);
  }
  return await res.text();
}

// v0.4: public alias matching the documented API in the v0.4 spec.
// fetchPullRequest returns the metadata; fetchFileContent returns raw text.
export const fetchPullRequest = fetchPrMeta;
export async function fetchFileContent(
  owner: string,
  repo: string,
  sha: string,
  path: string
): Promise<string | null> {
  return fetchFileAtSha(owner, repo, sha, path);
}

// v0.3: supported source detection now delegates to language.ts so
// .py and .go files flow through the pipeline alongside JS/TS.
export { isSupportedFilename as isSupportedSource } from "./language";

// List the open PRs on a repo. Used by the VS Code "open current repo PR"
// quick pick and by future desktop-side discovery flows.
export async function listOpenPullRequests(
  owner: string,
  repo: string,
  limit = 30
): Promise<Array<{ number: number; title: string; url: string }>> {
  const url = `${GH_API}/repos/${owner}/${repo}/pulls?state=open&per_page=${limit}`;
  const data = await ghFetch<any[]>(url);
  return data.map((p) => ({
    number: p.number,
    title: p.title,
    url: p.html_url,
  }));
}
