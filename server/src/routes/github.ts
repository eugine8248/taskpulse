// GitHub integration routes.
//
// Mount order matters:
//   - The webhook handler is exported as a SEPARATE router (githubWebhookRouter)
//     and mounted PUBLIC, before any authMiddleware. See index.ts.
//   - All other routes go through authMiddleware via githubRouter.

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { GitHubClient, GitHubError } from '../lib/github';
import { encrypt, decrypt, assertEncryptionAvailable } from '../lib/encryption';
import { parseGithubUrl, buildRepoUrl } from '../lib/github-url';
import { syncBoard, importFromUrl } from '../services/githubSync';
import { broadcast } from '../services/wsHub';

export const githubRouter = Router();
githubRouter.use(authMiddleware);

// ---------------------------------------------------------------------------
// PAT lifecycle
// ---------------------------------------------------------------------------

// POST /api/github/pat — store/replace the user's PAT.
githubRouter.post('/pat', async (req: AuthedRequest, res) => {
  try {
    const parsed = z.object({ token: z.string().min(8).max(500) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid token shape' });
    }
    assertEncryptionAvailable();
    const client = new GitHubClient(parsed.data.token);
    let user: { login: string };
    let scopes: string[];
    try {
      const r = await client.getUser();
      user = r.user;
      scopes = r.scopes;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 401) {
        return res.status(401).json({ success: false, error: 'GitHub rejected the PAT' });
      }
      throw err;
    }
    const enc = encrypt(parsed.data.token);
    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        githubPatEncrypted: enc,
        githubLogin: user.login,
        githubScopes: scopes.join(','),
      },
    });
    res.json({ success: true, data: { login: user.login, scopes } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/pat post] error:', err);
    res.status(500).json({ success: false, error: 'PAT store failed' });
  }
});

// DELETE /api/github/pat
githubRouter.delete('/pat', async (req: AuthedRequest, res) => {
  try {
    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        githubPatEncrypted: null,
        githubLogin: null,
        githubScopes: null,
      },
    });
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/pat delete] error:', err);
    res.status(500).json({ success: false, error: 'PAT clear failed' });
  }
});

// GET /api/github/pat/status
githubRouter.get('/pat/status', async (req: AuthedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (!user.githubPatEncrypted) {
      return res.json({ success: true, data: { connected: false } });
    }
    // Best-effort rate-limit fetch. If it fails (e.g. PAT revoked), we still
    // report `connected:true` and let the caller see the error in `rateLimitError`.
    let rateLimit: { remaining: number | null; limit: number | null; resetAt: string | null } | null = null;
    let rateLimitError: string | null = null;
    try {
      const token = decrypt(user.githubPatEncrypted);
      const client = new GitHubClient(token);
      await client.getUser();
      const rl = client.rateLimit();
      rateLimit = {
        remaining: rl.remaining,
        limit: rl.limit,
        resetAt: rl.resetAt ? rl.resetAt.toISOString() : null,
      };
    } catch (err) {
      rateLimitError = (err as Error).message;
    }
    res.json({
      success: true,
      data: {
        connected: true,
        login: user.githubLogin,
        scopes: (user.githubScopes || '').split(',').filter(Boolean),
        rateLimit,
        rateLimitError,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/pat status] error:', err);
    res.status(500).json({ success: false, error: 'PAT status failed' });
  }
});

// ---------------------------------------------------------------------------
// Card refresh
// ---------------------------------------------------------------------------

// POST /api/github/cards/:id/refresh
githubRouter.post('/cards/:id/refresh', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid card id' });
    const card = await prisma.card.findUnique({
      where: { id },
      include: { column: { include: { board: true } } },
    });
    if (!card) return res.status(404).json({ success: false, error: 'Card not found' });
    if (card.column.board.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    if (!card.githubKind || !card.githubUrl) {
      return res.status(400).json({ success: false, error: 'Not a GitHub card' });
    }
    // Re-import via importFromUrl — handles all three kinds.
    const r = await importFromUrl(card.column.boardId, card.githubUrl);
    res.json({ success: true, data: r });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/cards refresh] error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/github/proxy — body { url } where url MUST start with
// https://api.github.com/. The server fetches it with the user's PAT and
// streams the response back. Used by the client-side callmap engine
// (v2.6) so the PAT never crosses to the browser.
githubRouter.post('/proxy', async (req: AuthedRequest, res) => {
  try {
    const parsed = z.object({ url: z.string().min(8).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'url required' });
    const url = parsed.data.url;
    if (!url.startsWith('https://api.github.com/')) {
      return res.status(400).json({ success: false, error: 'Only api.github.com URLs are allowed' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user?.githubPatEncrypted) {
      return res.status(400).json({ success: false, error: 'No PAT stored' });
    }
    const token = decrypt(user.githubPatEncrypted);
    const ghRes = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'taskpulse/2.6',
      },
    });
    const text = await ghRes.text();
    // Forward rate-limit headers in a wrapper.
    res.json({
      success: true,
      data: {
        ok: ghRes.ok,
        status: ghRes.status,
        body: text,
        headers: {
          'x-ratelimit-remaining': ghRes.headers.get('x-ratelimit-remaining'),
          'x-ratelimit-limit': ghRes.headers.get('x-ratelimit-limit'),
          'x-ratelimit-reset': ghRes.headers.get('x-ratelimit-reset'),
          'content-type': ghRes.headers.get('content-type'),
        },
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/proxy] error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export { githubRouter as default };

// ---------------------------------------------------------------------------
// Board-scoped routes — registered on boardsRouter from index.ts
// (mounted under /api/boards/:id/github/*)
// ---------------------------------------------------------------------------

export const githubBoardRouter = Router({ mergeParams: true });
githubBoardRouter.use(authMiddleware);

async function loadBoardForUser(req: AuthedRequest) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return null;
  const board = await prisma.board.findFirst({ where: { id, userId: req.userId! } });
  return board;
}

githubBoardRouter.post('/link', async (req: AuthedRequest, res) => {
  try {
    const board = await loadBoardForUser(req);
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });
    const parsed = z.object({ repoUrl: z.string().min(8).max(300) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'repoUrl required' });
    const parsedUrl = parseGithubUrl(parsed.data.repoUrl);
    if (!parsedUrl) {
      return res.status(400).json({ success: false, error: 'Could not parse GitHub URL' });
    }
    // Verify user has a PAT.
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user?.githubPatEncrypted) {
      return res.status(400).json({ success: false, error: 'Connect a GitHub PAT first (Settings → GitHub)' });
    }
    // Verify the repo is accessible with the PAT.
    try {
      const client = new GitHubClient(decrypt(user.githubPatEncrypted));
      await client.getRepo(parsedUrl.owner, parsedUrl.repo);
    } catch (err) {
      const msg = err instanceof GitHubError ? err.message : (err as Error).message;
      return res.status(400).json({ success: false, error: `Cannot access repo: ${msg}` });
    }
    await prisma.board.update({
      where: { id: board.id },
      data: {
        githubRepoUrl: buildRepoUrl(parsedUrl.owner, parsedUrl.repo),
        githubRepoOwner: parsedUrl.owner,
        githubRepoName: parsedUrl.repo,
        githubAutoSync: true,
      },
    });
    // Fire initial sync (await so the response includes stats).
    const stats = await syncBoard(board.id);
    res.json({
      success: true,
      data: {
        repoUrl: buildRepoUrl(parsedUrl.owner, parsedUrl.repo),
        owner: parsedUrl.owner,
        repo: parsedUrl.repo,
        stats,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/link] error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

githubBoardRouter.delete('/link', async (req: AuthedRequest, res) => {
  try {
    const board = await loadBoardForUser(req);
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });
    await prisma.board.update({
      where: { id: board.id },
      data: {
        githubRepoUrl: null,
        githubRepoOwner: null,
        githubRepoName: null,
        githubLastSyncAt: null,
        // Keep githubColumnId — the user can delete the column manually if
        // they want to drop the cards.
      },
    });
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/unlink] error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

githubBoardRouter.post('/sync', async (req: AuthedRequest, res) => {
  try {
    const board = await loadBoardForUser(req);
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });
    if (!board.githubRepoOwner) {
      return res.status(400).json({ success: false, error: 'Board is not linked to a repo' });
    }
    const stats = await syncBoard(board.id);
    res.json({ success: true, data: stats });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/sync] error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

githubBoardRouter.post('/import-url', async (req: AuthedRequest, res) => {
  try {
    const board = await loadBoardForUser(req);
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });
    const parsed = z.object({ url: z.string().min(8).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'url required' });
    const r = await importFromUrl(board.id, parsed.data.url);
    res.json({ success: true, data: r });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/import-url] error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

githubBoardRouter.patch('/autosync', async (req: AuthedRequest, res) => {
  try {
    const board = await loadBoardForUser(req);
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'enabled:boolean required' });
    await prisma.board.update({
      where: { id: board.id },
      data: { githubAutoSync: parsed.data.enabled },
    });
    res.json({ success: true, data: { autoSync: parsed.data.enabled } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/autosync] error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/boards/:id/github — snapshot of link status
githubBoardRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const board = await loadBoardForUser(req);
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });
    res.json({
      success: true,
      data: {
        repoUrl: board.githubRepoUrl,
        owner: board.githubRepoOwner,
        repo: board.githubRepoName,
        lastSyncAt: board.githubLastSyncAt ? board.githubLastSyncAt.toISOString() : null,
        autoSync: board.githubAutoSync,
        githubColumnId: board.githubColumnId,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[github/board-get] error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// PUBLIC webhook — mounted BEFORE authMiddleware in index.ts.
// ---------------------------------------------------------------------------

export const githubWebhookRouter = Router();

function verifySignature(secret: string, signature: string | undefined, raw: Buffer): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false;
  const provided = signature.slice('sha256='.length);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(raw);
  const expected = hmac.digest('hex');
  // Timing-safe compare.
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

interface PrEvent {
  action: string;
  number: number;
  pull_request: {
    html_url: string;
    state: 'open' | 'closed';
    merged?: boolean;
    title: string;
    body: string | null;
    draft?: boolean;
  };
  repository: { owner: { login: string }; name: string };
}

interface IssueEvent {
  action: string;
  issue: {
    html_url: string;
    state: 'open' | 'closed';
    number: number;
    title: string;
    body: string | null;
    pull_request?: unknown;
  };
  repository: { owner: { login: string }; name: string };
}

// Webhook handler. POST /api/webhooks/github. 404 if GITHUB_WEBHOOK_SECRET unset.
githubWebhookRouter.post(
  '/',
  // We need the RAW body for HMAC. Mount express.raw on this route.
  // (the global JSON parser still runs — but since we mount raw FIRST and
  // re-parse manually, we accept it.)
  (req, res, next) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(404).json({ success: false, error: 'Webhook disabled' });
    }
    next();
  },
  async (req, res) => {
    try {
      const secret = process.env.GITHUB_WEBHOOK_SECRET!;
      // index.ts mounts express.raw on this path so req.body is a Buffer.
      const rawBody: Buffer = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
      const sig = req.headers['x-hub-signature-256'] as string | undefined;
      if (!verifySignature(secret, sig, rawBody)) {
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }
      const event = req.headers['x-github-event'] as string | undefined;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON' });
      }

      if (event === 'ping') {
        return res.json({ success: true, data: { pong: true } });
      }

      if (event === 'pull_request') {
        const pr = payload as unknown as PrEvent;
        const owner = pr.repository.owner.login;
        const repo = pr.repository.name;
        const url = pr.pull_request.html_url;
        // Find linked boards for this repo.
        const boards = await prisma.board.findMany({
          where: { githubRepoOwner: owner, githubRepoName: repo },
        });
        for (const b of boards) {
          if (!b.githubColumnId) continue;
          const existing = await prisma.card.findFirst({
            where: { columnId: b.githubColumnId, githubUrl: url },
          });
          if (existing) {
            const state = pr.pull_request.merged
              ? 'merged'
              : pr.pull_request.state === 'closed'
              ? 'closed'
              : pr.pull_request.draft
              ? 'draft'
              : 'open';
            await prisma.card.update({
              where: { id: existing.id },
              data: { githubState: state, githubLastFetchedAt: new Date() },
            });
            broadcast(b.userId, {
              type: 'github.pr.update',
              boardId: b.id,
              cardId: existing.id,
              state,
            });
          }
        }
      } else if (event === 'issues') {
        const ie = payload as unknown as IssueEvent;
        if (ie.issue.pull_request) {
          // It's actually a PR.
          return res.json({ success: true, data: { ignored: 'pr-event-via-issues' } });
        }
        const owner = ie.repository.owner.login;
        const repo = ie.repository.name;
        const url = ie.issue.html_url;
        const boards = await prisma.board.findMany({
          where: { githubRepoOwner: owner, githubRepoName: repo },
        });
        for (const b of boards) {
          if (!b.githubColumnId) continue;
          const existing = await prisma.card.findFirst({
            where: { columnId: b.githubColumnId, githubUrl: url },
          });
          if (existing) {
            await prisma.card.update({
              where: { id: existing.id },
              data: {
                githubState: ie.issue.state,
                githubLastFetchedAt: new Date(),
              },
            });
            broadcast(b.userId, {
              type: 'github.issue.update',
              boardId: b.id,
              cardId: existing.id,
              state: ie.issue.state,
            });
          }
        }
      } else if (event === 'push') {
        // We don't auto-import commits — that'd flood the column. Just ack.
      }

      res.json({ success: true, data: { ok: true } });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[github webhook] error:', err);
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  },
);
