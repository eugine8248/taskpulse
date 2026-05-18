// GitHub → board sync. Two entry points:
//
//   syncBoard(boardId)        — manual + initial-link path
//   syncAllLinkedBoards()     — scheduler path (every 15 min)
//
// The "GitHub" column is auto-created on first sync. Closed PRs / issues
// are moved to the user's Done column (case-insensitive name match,
// fallback to the last column). Stale cards (open on our side, closed
// upstream) are reconciled by `githubLastFetchedAt` < syncStart.

import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/encryption';
import { GitHubClient, type GhPR, type GhIssue } from '../lib/github';
import { buildRepoUrl, parseGithubUrl } from '../lib/github-url';
import { fireCardEvent } from './cardEvents';

const GITHUB_COLUMN_NAME = 'GitHub';

export interface SyncStats {
  prsImported: number;
  prsUpdated: number;
  prsClosed: number;
  issuesImported: number;
  issuesUpdated: number;
  issuesClosed: number;
  errors: string[];
}

function emptyStats(): SyncStats {
  return {
    prsImported: 0,
    prsUpdated: 0,
    prsClosed: 0,
    issuesImported: 0,
    issuesUpdated: 0,
    issuesClosed: 0,
    errors: [],
  };
}

async function getDoneColumnId(boardId: number, githubColumnId: number): Promise<number | null> {
  const cols = await prisma.column.findMany({
    where: { boardId },
    orderBy: { order: 'asc' },
  });
  const done = cols.find((c) => c.name.trim().toLowerCase() === 'done');
  if (done) return done.id;
  // Fallback: last column that isn't the GitHub column itself.
  const fallback = [...cols].reverse().find((c) => c.id !== githubColumnId);
  return fallback?.id ?? null;
}

async function ensureGithubColumn(boardId: number, existingId: number | null): Promise<number> {
  if (existingId) {
    const existing = await prisma.column.findUnique({ where: { id: existingId } });
    if (existing && existing.boardId === boardId) return existing.id;
  }
  // Look for a column named "GitHub" first.
  const byName = await prisma.column.findFirst({
    where: { boardId, name: GITHUB_COLUMN_NAME },
  });
  if (byName) {
    await prisma.board.update({
      where: { id: boardId },
      data: { githubColumnId: byName.id },
    });
    return byName.id;
  }
  // Create one at the end.
  const last = await prisma.column.findFirst({
    where: { boardId },
    orderBy: { order: 'desc' },
  });
  const order = (last?.order ?? 0) + 1000;
  const col = await prisma.column.create({
    data: { boardId, name: GITHUB_COLUMN_NAME, order },
  });
  await prisma.board.update({
    where: { id: boardId },
    data: { githubColumnId: col.id },
  });
  return col.id;
}

function prStateLabel(pr: GhPR): string {
  if (pr.merged || pr.merged_at) return 'merged';
  if (pr.state === 'closed') return 'closed';
  if (pr.draft) return 'draft';
  return 'open';
}

function priorityForPR(pr: GhPR): string {
  if (pr.draft) return 'low';
  const titleLower = pr.title.toLowerCase();
  if (/(fix|hotfix|security|urgent|crit)/i.test(titleLower)) return 'high';
  return 'medium';
}

function priorityForIssue(issue: GhIssue): string {
  const labels = (issue.labels || []).map((l) => l.name.toLowerCase());
  if (labels.some((l) => /(bug|crit|urgent|security)/.test(l))) return 'high';
  return 'medium';
}

async function getNextCardOrder(columnId: number): Promise<number> {
  const last = await prisma.card.findFirst({
    where: { columnId },
    orderBy: { order: 'desc' },
  });
  return (last?.order ?? 0) + 1000;
}

async function upsertPRCard(
  pr: GhPR,
  columnId: number,
  ownerLogin: string,
  boardOwnerUserId: number,
  stats: SyncStats,
  syncStartedAt: Date,
): Promise<void> {
  void ownerLogin;
  const existing = await prisma.card.findFirst({
    where: { columnId, githubUrl: pr.html_url },
  });

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
  const prio = priorityForPR(pr);

  if (existing) {
    const stateChanged = existing.githubState !== state;
    await prisma.card.update({
      where: { id: existing.id },
      data: {
        title: `PR #${pr.number} · ${pr.title}`,
        description: pr.body ?? '',
        githubKind: 'pr',
        githubNumber: pr.number,
        githubState: state,
        githubMetadata: JSON.stringify(meta),
        githubLastFetchedAt: syncStartedAt,
      },
    });
    stats.prsUpdated++;
    if (stateChanged) {
      const evt = state === 'merged' ? 'github_pr_merged' : state === 'closed' ? 'github_pr_closed' : null;
      if (evt) {
        fireCardEvent({
          cardId: existing.id,
          kind: evt,
          actorUserId: boardOwnerUserId,
          meta: { number: pr.number, url: pr.html_url, state },
        });
      }
    }
  } else {
    const order = await getNextCardOrder(columnId);
    const created = await prisma.card.create({
      data: {
        columnId,
        title: `PR #${pr.number} · ${pr.title}`,
        description: pr.body ?? '',
        priority: prio,
        order,
        githubKind: 'pr',
        githubUrl: pr.html_url,
        githubNumber: pr.number,
        githubState: state,
        githubMetadata: JSON.stringify(meta),
        githubLastFetchedAt: syncStartedAt,
      },
    });
    stats.prsImported++;
    fireCardEvent({
      cardId: created.id,
      kind: 'github_pr_imported',
      actorUserId: boardOwnerUserId,
      meta: { number: pr.number, url: pr.html_url, state },
    });
  }
}

async function upsertIssueCard(
  issue: GhIssue,
  columnId: number,
  boardOwnerUserId: number,
  stats: SyncStats,
  syncStartedAt: Date,
): Promise<void> {
  const existing = await prisma.card.findFirst({
    where: { columnId, githubUrl: issue.html_url },
  });

  const meta = {
    author: issue.user?.login,
    labels: (issue.labels || []).map((l) => l.name),
    assignees: (issue.assignees || []).map((a) => a.login),
  };
  const state = issue.state === 'closed' ? 'closed' : 'open';
  const prio = priorityForIssue(issue);

  if (existing) {
    const stateChanged = existing.githubState !== state;
    await prisma.card.update({
      where: { id: existing.id },
      data: {
        title: `Issue #${issue.number} · ${issue.title}`,
        description: issue.body ?? '',
        githubKind: 'issue',
        githubNumber: issue.number,
        githubState: state,
        githubMetadata: JSON.stringify(meta),
        githubLastFetchedAt: syncStartedAt,
      },
    });
    stats.issuesUpdated++;
    if (stateChanged && state === 'closed') {
      fireCardEvent({
        cardId: existing.id,
        kind: 'github_issue_closed',
        actorUserId: boardOwnerUserId,
        meta: { number: issue.number, url: issue.html_url },
      });
    }
  } else {
    const order = await getNextCardOrder(columnId);
    const created = await prisma.card.create({
      data: {
        columnId,
        title: `Issue #${issue.number} · ${issue.title}`,
        description: issue.body ?? '',
        priority: prio,
        order,
        githubKind: 'issue',
        githubUrl: issue.html_url,
        githubNumber: issue.number,
        githubState: state,
        githubMetadata: JSON.stringify(meta),
        githubLastFetchedAt: syncStartedAt,
      },
    });
    stats.issuesImported++;
    fireCardEvent({
      cardId: created.id,
      kind: 'github_issue_imported',
      actorUserId: boardOwnerUserId,
      meta: { number: issue.number, url: issue.html_url },
    });
  }
}

/**
 * Move stale cards (open on our side, NOT seen in the latest open-list fetch)
 * to Done. We detect them by checking which existing githubKind cards in the
 * GitHub column have `githubLastFetchedAt < syncStartedAt`.
 *
 * For PRs we fetch the upstream state to distinguish merged vs closed; for
 * issues we just mark closed.
 */
async function reconcileStale(
  boardId: number,
  githubColumnId: number,
  doneColumnId: number | null,
  client: GitHubClient,
  owner: string,
  repo: string,
  boardOwnerUserId: number,
  stats: SyncStats,
  syncStartedAt: Date,
): Promise<void> {
  const stale = await prisma.card.findMany({
    where: {
      columnId: githubColumnId,
      githubKind: { in: ['pr', 'issue'] },
      githubState: { in: ['open', 'draft'] },
      githubLastFetchedAt: { lt: syncStartedAt },
    },
  });

  for (const card of stale) {
    try {
      if (!card.githubNumber) continue;
      let nextState = 'closed';
      if (card.githubKind === 'pr') {
        const pr = await client.getPR(owner, repo, card.githubNumber);
        nextState = prStateLabel(pr);
        // Skip if upstream says still open (shouldn't happen given the list
        // filter, but defensive). This catches the race where a PR was just
        // re-opened between list and detail.
        if (nextState === 'open' || nextState === 'draft') {
          await prisma.card.update({
            where: { id: card.id },
            data: { githubLastFetchedAt: syncStartedAt, githubState: nextState },
          });
          continue;
        }
        await prisma.card.update({
          where: { id: card.id },
          data: {
            columnId: doneColumnId ?? card.columnId,
            githubState: nextState,
            githubLastFetchedAt: syncStartedAt,
          },
        });
        stats.prsClosed++;
        fireCardEvent({
          cardId: card.id,
          kind: nextState === 'merged' ? 'github_pr_merged' : 'github_pr_closed',
          actorUserId: boardOwnerUserId,
          meta: { number: card.githubNumber, url: card.githubUrl, state: nextState },
        });
      } else {
        const issue = await client.getIssue(owner, repo, card.githubNumber);
        nextState = issue.state === 'closed' ? 'closed' : 'open';
        if (nextState === 'open') {
          await prisma.card.update({
            where: { id: card.id },
            data: { githubLastFetchedAt: syncStartedAt, githubState: nextState },
          });
          continue;
        }
        await prisma.card.update({
          where: { id: card.id },
          data: {
            columnId: doneColumnId ?? card.columnId,
            githubState: 'closed',
            githubLastFetchedAt: syncStartedAt,
          },
        });
        stats.issuesClosed++;
        fireCardEvent({
          cardId: card.id,
          kind: 'github_issue_closed',
          actorUserId: boardOwnerUserId,
          meta: { number: card.githubNumber, url: card.githubUrl },
        });
      }
    } catch (err) {
      stats.errors.push(`reconcile #${card.githubNumber}: ${(err as Error).message}`);
    }
  }
  void boardId;
}

/** Sync one board. Returns stats; logs but does not throw on per-item failures. */
export async function syncBoard(boardId: number): Promise<SyncStats> {
  const stats = emptyStats();
  const syncStartedAt = new Date();

  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) {
    stats.errors.push('Board not found');
    return stats;
  }
  if (!board.githubRepoOwner || !board.githubRepoName) {
    stats.errors.push('Board is not linked to a GitHub repo');
    return stats;
  }
  const user = await prisma.user.findUnique({ where: { id: board.userId } });
  if (!user || !user.githubPatEncrypted) {
    stats.errors.push('No GitHub PAT for board owner');
    return stats;
  }

  let token: string;
  try {
    token = decrypt(user.githubPatEncrypted);
  } catch (err) {
    stats.errors.push(`PAT decryption failed: ${(err as Error).message}`);
    return stats;
  }

  const client = new GitHubClient(token);
  const owner = board.githubRepoOwner;
  const repo = board.githubRepoName;

  const githubColumnId = await ensureGithubColumn(boardId, board.githubColumnId);
  const doneColumnId = await getDoneColumnId(boardId, githubColumnId);

  // Fetch open PRs + open issues. Upsert each.
  try {
    const prs = await client.listOpenPRs(owner, repo);
    for (const pr of prs) {
      try {
        await upsertPRCard(pr, githubColumnId, owner, board.userId, stats, syncStartedAt);
      } catch (err) {
        stats.errors.push(`PR #${pr.number}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    stats.errors.push(`listOpenPRs: ${(err as Error).message}`);
  }

  try {
    const issues = await client.listOpenIssues(owner, repo);
    for (const issue of issues) {
      try {
        await upsertIssueCard(issue, githubColumnId, board.userId, stats, syncStartedAt);
      } catch (err) {
        stats.errors.push(`Issue #${issue.number}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    stats.errors.push(`listOpenIssues: ${(err as Error).message}`);
  }

  // Reconcile stale cards (existed on our side but not in the open lists).
  try {
    await reconcileStale(
      boardId,
      githubColumnId,
      doneColumnId,
      client,
      owner,
      repo,
      board.userId,
      stats,
      syncStartedAt,
    );
  } catch (err) {
    stats.errors.push(`reconcile: ${(err as Error).message}`);
  }

  await prisma.board.update({
    where: { id: boardId },
    data: { githubLastSyncAt: new Date() },
  });

  return stats;
}

/** Iterate every auto-sync-enabled linked board. */
export async function syncAllLinkedBoards(): Promise<void> {
  const boards = await prisma.board.findMany({
    where: {
      githubRepoUrl: { not: null },
      githubAutoSync: true,
    },
    select: { id: true, name: true },
  });
  for (const b of boards) {
    // jitter 0-120s per board so 50 boards don't fire simultaneously.
    const delay = Math.floor(Math.random() * 120_000);
    setTimeout(() => {
      syncBoard(b.id)
        .then((stats) => {
          if (stats.errors.length) {
            // eslint-disable-next-line no-console
            console.warn(`[githubSync] board ${b.id} (${b.name}) errors:`, stats.errors);
          } else {
            // eslint-disable-next-line no-console
            console.log(
              `[githubSync] board ${b.id} (${b.name}) ok — prs:+${stats.prsImported}/~${stats.prsUpdated}/-${stats.prsClosed} issues:+${stats.issuesImported}/~${stats.issuesUpdated}/-${stats.issuesClosed}`,
            );
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[githubSync] board ${b.id} failed:`, err);
        });
    }, delay).unref();
  }
}

/** Add a single card from a paste-URL. Returns the created/updated card. */
export async function importFromUrl(
  boardId: number,
  url: string,
): Promise<{ cardId: number; kind: string; created: boolean }> {
  const parsed = parseGithubUrl(url);
  if (!parsed) throw new Error('Could not parse GitHub URL');

  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) throw new Error('Board not found');
  const user = await prisma.user.findUnique({ where: { id: board.userId } });
  if (!user || !user.githubPatEncrypted) throw new Error('Connect a GitHub PAT first');

  const token = decrypt(user.githubPatEncrypted);
  const client = new GitHubClient(token);
  const syncStartedAt = new Date();
  const githubColumnId = await ensureGithubColumn(boardId, board.githubColumnId);
  const stats = emptyStats();

  if (parsed.kind === 'pr') {
    const pr = await client.getPR(parsed.owner, parsed.repo, parsed.number);
    const before = await prisma.card.findFirst({
      where: { columnId: githubColumnId, githubUrl: pr.html_url },
    });
    await upsertPRCard(pr, githubColumnId, parsed.owner, board.userId, stats, syncStartedAt);
    const after = await prisma.card.findFirst({
      where: { columnId: githubColumnId, githubUrl: pr.html_url },
    });
    if (!after) throw new Error('Upsert failed (race)');
    return { cardId: after.id, kind: 'pr', created: !before };
  }
  if (parsed.kind === 'issue') {
    const issue = await client.getIssue(parsed.owner, parsed.repo, parsed.number);
    const before = await prisma.card.findFirst({
      where: { columnId: githubColumnId, githubUrl: issue.html_url },
    });
    await upsertIssueCard(issue, githubColumnId, board.userId, stats, syncStartedAt);
    const after = await prisma.card.findFirst({
      where: { columnId: githubColumnId, githubUrl: issue.html_url },
    });
    if (!after) throw new Error('Upsert failed (race)');
    return { cardId: after.id, kind: 'issue', created: !before };
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
    if (existing) {
      await prisma.card.update({
        where: { id: existing.id },
        data: {
          title: `Commit ${commit.sha.slice(0, 7)} · ${commit.commit.message.split('\n')[0].slice(0, 80)}`,
          description: commit.commit.message,
          githubMetadata: JSON.stringify(meta),
          githubLastFetchedAt: syncStartedAt,
        },
      });
      return { cardId: existing.id, kind: 'commit', created: false };
    }
    const order = await getNextCardOrder(githubColumnId);
    const card = await prisma.card.create({
      data: {
        columnId: githubColumnId,
        title: `Commit ${commit.sha.slice(0, 7)} · ${commit.commit.message.split('\n')[0].slice(0, 80)}`,
        description: commit.commit.message,
        priority: 'low',
        order,
        githubKind: 'commit',
        githubUrl: commit.html_url,
        githubSha: commit.sha,
        githubState: 'closed', // commits are immutable
        githubMetadata: JSON.stringify(meta),
        githubLastFetchedAt: syncStartedAt,
      },
    });
    return { cardId: card.id, kind: 'commit', created: true };
  }
  // 'repo' — treat as a link-the-board operation instead.
  await prisma.board.update({
    where: { id: boardId },
    data: {
      githubRepoUrl: buildRepoUrl(parsed.owner, parsed.repo),
      githubRepoOwner: parsed.owner,
      githubRepoName: parsed.repo,
    },
  });
  await syncBoard(boardId);
  // Pick any card we just synced for return; if none, throw.
  const any = await prisma.card.findFirst({
    where: { columnId: githubColumnId, githubKind: { in: ['pr', 'issue'] } },
    orderBy: { id: 'desc' },
  });
  if (!any) {
    throw new Error('Linked repo has no open PRs / issues to import');
  }
  return { cardId: any.id, kind: 'repo', created: true };
}
