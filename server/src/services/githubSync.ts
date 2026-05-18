// GitHub paste-URL importer.
//
// v2.5 originally shipped a board-binding + auto-sync + webhook layer.
// The v2.6 cleanup pass removed all of that — solo workflow didn't justify
// the complexity. What survives:
//
//   importFromUrl(boardId, url) — one-shot, on-demand, no scheduled sync.
//
// Supported URL kinds (parseGithubUrl):
//   - PR     → fetch + create one card with full metadata
//   - issue  → fetch + create one card
//   - commit → fetch + create one card (no callgraph for commits — engine is PR-delta)
//   - repo   → fetch open PRs + open issues, create one card per item

import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/encryption';
import { GitHubClient, type GhPR, type GhIssue } from '../lib/github';
import { parseGithubUrl } from '../lib/github-url';

const GITHUB_COLUMN_NAME = 'GitHub';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureGithubColumn(boardId: number): Promise<number> {
  // Find existing "GitHub" column on this board (case-insensitive name match),
  // or create one at the end.
  const cols = await prisma.column.findMany({ where: { boardId } });
  const existing = cols.find((c) => c.name.trim().toLowerCase() === GITHUB_COLUMN_NAME.toLowerCase());
  if (existing) return existing.id;
  const last = await prisma.column.findFirst({ where: { boardId }, orderBy: { order: 'desc' } });
  const order = (last?.order ?? 0) + 1000;
  const col = await prisma.column.create({
    data: { boardId, name: GITHUB_COLUMN_NAME, order },
  });
  return col.id;
}

async function getNextCardOrder(columnId: number): Promise<number> {
  const last = await prisma.card.findFirst({ where: { columnId }, orderBy: { order: 'desc' } });
  return (last?.order ?? 0) + 1000;
}

function prStateLabel(pr: GhPR): string {
  if (pr.merged || pr.merged_at) return 'merged';
  if (pr.state === 'closed') return 'closed';
  if (pr.draft) return 'draft';
  return 'open';
}

function priorityForPR(pr: GhPR): string {
  if (pr.labels?.some((l) => /critical|p0|urgent/i.test(l.name))) return 'urgent';
  if (pr.labels?.some((l) => /high|p1/i.test(l.name))) return 'high';
  if (pr.labels?.some((l) => /low|p3|trivial/i.test(l.name))) return 'low';
  return 'medium';
}

function priorityForIssue(issue: GhIssue): string {
  if (issue.labels?.some((l) => /critical|p0|urgent/i.test(l.name))) return 'urgent';
  if (issue.labels?.some((l) => /high|p1/i.test(l.name))) return 'high';
  if (issue.labels?.some((l) => /low|p3|trivial/i.test(l.name))) return 'low';
  return 'medium';
}

// ---------------------------------------------------------------------------
// Per-kind upserts
// ---------------------------------------------------------------------------

async function upsertPRCard(
  pr: GhPR,
  columnId: number,
  fetchedAt: Date,
): Promise<{ cardId: number; created: boolean }> {
  const existing = await prisma.card.findFirst({ where: { columnId, githubUrl: pr.html_url } });
  const meta = {
    base: pr.base?.ref,
    head: pr.head?.ref,
    additions: pr.additions,
    deletions: pr.deletions,
    changed_files: pr.changed_files,
    mergeable: pr.mergeable,
    author: pr.user?.login,
    labels: (pr.labels || []).map((l) => l.name),
    assignees: (pr.assignees || []).map((a) => a.login),
    draft: pr.draft,
  };
  const state = prStateLabel(pr);
  const data = {
    title: `PR #${pr.number} · ${pr.title}`,
    description: pr.body ?? '',
    priority: priorityForPR(pr),
    githubKind: 'pr',
    githubUrl: pr.html_url,
    githubNumber: pr.number,
    githubState: state,
    githubMetadata: JSON.stringify(meta),
    githubLastFetchedAt: fetchedAt,
  };
  if (existing) {
    await prisma.card.update({ where: { id: existing.id }, data });
    return { cardId: existing.id, created: false };
  }
  const order = await getNextCardOrder(columnId);
  const card = await prisma.card.create({ data: { ...data, columnId, order } });
  return { cardId: card.id, created: true };
}

async function upsertIssueCard(
  issue: GhIssue,
  columnId: number,
  fetchedAt: Date,
): Promise<{ cardId: number; created: boolean }> {
  const existing = await prisma.card.findFirst({ where: { columnId, githubUrl: issue.html_url } });
  const meta = {
    author: issue.user?.login,
    labels: (issue.labels || []).map((l) => l.name),
    assignees: (issue.assignees || []).map((a) => a.login),
  };
  const state = issue.state === 'closed' ? 'closed' : 'open';
  const data = {
    title: `Issue #${issue.number} · ${issue.title}`,
    description: issue.body ?? '',
    priority: priorityForIssue(issue),
    githubKind: 'issue',
    githubUrl: issue.html_url,
    githubNumber: issue.number,
    githubState: state,
    githubMetadata: JSON.stringify(meta),
    githubLastFetchedAt: fetchedAt,
  };
  if (existing) {
    await prisma.card.update({ where: { id: existing.id }, data });
    return { cardId: existing.id, created: false };
  }
  const order = await getNextCardOrder(columnId);
  const card = await prisma.card.create({ data: { ...data, columnId, order } });
  return { cardId: card.id, created: true };
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export async function importFromUrl(
  boardId: number,
  url: string,
): Promise<{ cardId?: number; kind: string; created?: boolean; importedCount?: number }> {
  const parsed = parseGithubUrl(url);
  if (!parsed) throw new Error('Could not parse GitHub URL');

  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) throw new Error('Board not found');
  const user = await prisma.user.findUnique({ where: { id: board.userId } });
  if (!user || !user.githubPatEncrypted) throw new Error('Connect a GitHub PAT first (Settings → GitHub)');

  const client = new GitHubClient(decrypt(user.githubPatEncrypted));
  const fetchedAt = new Date();
  const githubColumnId = await ensureGithubColumn(boardId);

  if (parsed.kind === 'pr') {
    const pr = await client.getPR(parsed.owner, parsed.repo, parsed.number);
    const r = await upsertPRCard(pr, githubColumnId, fetchedAt);
    return { cardId: r.cardId, kind: 'pr', created: r.created };
  }

  if (parsed.kind === 'issue') {
    const issue = await client.getIssue(parsed.owner, parsed.repo, parsed.number);
    const r = await upsertIssueCard(issue, githubColumnId, fetchedAt);
    return { cardId: r.cardId, kind: 'issue', created: r.created };
  }

  if (parsed.kind === 'commit') {
    const commit = await client.getCommit(parsed.owner, parsed.repo, parsed.sha);
    const existing = await prisma.card.findFirst({
      where: { columnId: githubColumnId, githubUrl: commit.html_url },
    });
    const meta = {
      author: commit.author?.login || commit.commit.author?.name,
      date: commit.commit.author?.date,
    };
    const data = {
      title: `Commit ${commit.sha.slice(0, 7)} · ${commit.commit.message.split('\n')[0].slice(0, 80)}`,
      description: commit.commit.message,
      priority: 'low',
      githubKind: 'commit',
      githubUrl: commit.html_url,
      githubSha: commit.sha,
      githubState: 'closed', // commits are immutable
      githubMetadata: JSON.stringify(meta),
      githubLastFetchedAt: fetchedAt,
    };
    if (existing) {
      await prisma.card.update({ where: { id: existing.id }, data });
      return { cardId: existing.id, kind: 'commit', created: false };
    }
    const order = await getNextCardOrder(githubColumnId);
    const card = await prisma.card.create({ data: { ...data, columnId: githubColumnId, order } });
    return { cardId: card.id, kind: 'commit', created: true };
  }

  // 'repo' — bulk import open PRs + open issues. No binding, no scheduled sync;
  // just creates the cards once. Re-pasting the same URL will upsert (no dups).
  const prs = await client.listOpenPRs(parsed.owner, parsed.repo);
  const issues = await client.listOpenIssues(parsed.owner, parsed.repo);
  let imported = 0;
  for (const pr of prs) {
    await upsertPRCard(pr, githubColumnId, fetchedAt);
    imported++;
  }
  for (const issue of issues) {
    // Some Issues endpoints include PRs in the response; filter them.
    if ((issue as { pull_request?: unknown }).pull_request) continue;
    await upsertIssueCard(issue, githubColumnId, fetchedAt);
    imported++;
  }
  return { kind: 'repo', importedCount: imported };
}
