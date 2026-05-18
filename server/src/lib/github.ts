// Hand-rolled GitHub REST client.
//
// Why no octokit? The constraint is "no new runtime deps on server-side."
// Octokit pulls in ~30 transitive packages. We only need ~8 endpoints with
// pagination + ratelimit awareness, so a 200-line client is the right
// tradeoff.
//
// Auth: token passed to constructor. Caller is responsible for decryption.

import { setTimeout as sleep } from 'timers/promises';

const BASE = 'https://api.github.com';
const UA = 'taskpulse/2.5';

export interface RateLimitState {
  remaining: number | null;
  limit: number | null;
  resetAt: Date | null;
}

export class GitHubError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface GhUser {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
}

export interface GhRepo {
  id: number;
  owner: { login: string };
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  private: boolean;
}

export interface GhPR {
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  merged?: boolean;
  merged_at?: string | null;
  html_url: string;
  user: { login: string } | null;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  body: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  mergeable?: boolean | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels: { name: string }[];
  assignees: { login: string }[];
}

export interface GhIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  user: { login: string } | null;
  body: string | null;
  pull_request?: unknown; // present means it's actually a PR
  labels: { name: string }[];
  assignees: { login: string }[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface GhCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
  };
  author: { login: string } | null;
}

export interface GhPRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url: string;
  raw_url: string;
}

export class GitHubClient {
  private token: string;
  private rate: RateLimitState = { remaining: null, limit: null, resetAt: null };

  constructor(token: string) {
    if (!token || typeof token !== 'string') throw new Error('GitHubClient: token required');
    this.token = token;
  }

  rateLimit(): RateLimitState {
    return { ...this.rate };
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown; raw?: boolean } = {},
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `token ${this.token}`,
      'User-Agent': UA,
    };
    if (init.body) headers['Content-Type'] = 'application/json';

    // Defensive throttle — slow down before hitting the limit.
    if (this.rate.remaining !== null && this.rate.remaining < 100) {
      await sleep(2000);
    }

    let attempt = 0;
    // Exponential backoff: 0, 1s, 2s, 4s (4 tries total).
    // Retry on 429 + 5xx only.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(url, {
        method: init.method || 'GET',
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });

      // Capture rate-limit headers from every response.
      const remaining = res.headers.get('x-ratelimit-remaining');
      const limit = res.headers.get('x-ratelimit-limit');
      const reset = res.headers.get('x-ratelimit-reset');
      if (remaining !== null) this.rate.remaining = parseInt(remaining, 10);
      if (limit !== null) this.rate.limit = parseInt(limit, 10);
      if (reset !== null) {
        const epoch = parseInt(reset, 10);
        if (Number.isFinite(epoch)) this.rate.resetAt = new Date(epoch * 1000);
      }

      if (res.status === 401) {
        throw new GitHubError(401, 'GitHub PAT may be revoked or invalid');
      }
      if (res.status === 403) {
        // Secondary rate limit OR insufficient scope. Both surface with 403.
        const body = await res.json().catch(() => null);
        const msg = (body as { message?: string } | null)?.message || 'GitHub forbidden';
        throw new GitHubError(403, msg, body);
      }
      if (res.status === 404) {
        throw new GitHubError(404, 'GitHub resource not found');
      }
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt >= 3) {
          throw new GitHubError(res.status, `GitHub upstream ${res.status} after retries`);
        }
        attempt++;
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await sleep(delayMs);
        continue;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new GitHubError(res.status, `GitHub ${res.status}`, body);
      }

      if (init.raw) {
        return res as unknown as T;
      }
      const body = await res.json().catch(() => null);
      return body as T;
    }
  }

  async getUser(): Promise<{ user: GhUser; scopes: string[] }> {
    // For the scopes header we need to capture the raw response.
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `token ${this.token}`,
      'User-Agent': UA,
    };
    const res = await fetch(`${BASE}/user`, { headers });
    if (res.status === 401) throw new GitHubError(401, 'GitHub PAT may be revoked or invalid');
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new GitHubError(res.status, `GitHub ${res.status}`, body);
    }
    const scopesHeader = res.headers.get('x-oauth-scopes') || '';
    const scopes = scopesHeader
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const user = (await res.json()) as GhUser;
    // Mirror rate-limit headers.
    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining !== null) this.rate.remaining = parseInt(remaining, 10);
    if (limit !== null) this.rate.limit = parseInt(limit, 10);
    if (reset !== null) {
      const epoch = parseInt(reset, 10);
      if (Number.isFinite(epoch)) this.rate.resetAt = new Date(epoch * 1000);
    }
    return { user, scopes };
  }

  getRepo(owner: string, repo: string): Promise<GhRepo> {
    return this.request<GhRepo>(`/repos/${owner}/${repo}`);
  }

  /** Paginate /repos/:o/:r/pulls?state=open */
  async listOpenPRs(owner: string, repo: string, maxPages = 5): Promise<GhPR[]> {
    const out: GhPR[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.request<GhPR[]>(
        `/repos/${owner}/${repo}/pulls?state=open&per_page=100&page=${page}`,
      );
      if (!Array.isArray(batch) || !batch.length) break;
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  /** Paginate /repos/:o/:r/issues?state=open, filtering out pull_request rows. */
  async listOpenIssues(owner: string, repo: string, maxPages = 5): Promise<GhIssue[]> {
    const out: GhIssue[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.request<GhIssue[]>(
        `/repos/${owner}/${repo}/issues?state=open&per_page=100&page=${page}`,
      );
      if (!Array.isArray(batch) || !batch.length) break;
      for (const i of batch) {
        if (!i.pull_request) out.push(i);
      }
      if (batch.length < 100) break;
    }
    return out;
  }

  getPR(owner: string, repo: string, num: number): Promise<GhPR> {
    return this.request<GhPR>(`/repos/${owner}/${repo}/pulls/${num}`);
  }

  getIssue(owner: string, repo: string, num: number): Promise<GhIssue> {
    return this.request<GhIssue>(`/repos/${owner}/${repo}/issues/${num}`);
  }

  getCommit(owner: string, repo: string, sha: string): Promise<GhCommit> {
    return this.request<GhCommit>(`/repos/${owner}/${repo}/commits/${sha}`);
  }

  async getPRFiles(owner: string, repo: string, num: number, maxPages = 4): Promise<GhPRFile[]> {
    const out: GhPRFile[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.request<GhPRFile[]>(
        `/repos/${owner}/${repo}/pulls/${num}/files?per_page=100&page=${page}`,
      );
      if (!Array.isArray(batch) || !batch.length) break;
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  async getFileContents(
    owner: string,
    repo: string,
    ref: string,
    pathInRepo: string,
  ): Promise<string> {
    interface Blob {
      content: string;
      encoding: string;
      size: number;
    }
    const enc = encodeURIComponent(pathInRepo);
    const blob = await this.request<Blob>(
      `/repos/${owner}/${repo}/contents/${enc}?ref=${encodeURIComponent(ref)}`,
    );
    if (blob.encoding !== 'base64') {
      throw new GitHubError(415, `Unexpected file encoding: ${blob.encoding}`);
    }
    return Buffer.from(blob.content, 'base64').toString('utf8');
  }
}
