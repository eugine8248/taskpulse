// GitHub integration routes.
//
// All endpoints under authMiddleware. PAT lifecycle + per-card refresh +
// the PAT proxy (used by the embedded callgraph engine) + the paste-URL
// flow. The board-level binding + auto-sync + webhook layer was removed
// in the v2.6.x cleanup pass — solo workflow didn't justify the complexity.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { GitHubClient, GitHubError } from '../lib/github';
import { encrypt, decrypt, assertEncryptionAvailable } from '../lib/encryption';
import { parseGithubUrl } from '../lib/github-url';
import { importFromUrl } from '../services/githubSync';

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
// Paste-URL flow — board-scoped only because the new card needs to land
// somewhere. The endpoint detects the URL kind (repo/PR/issue/commit) and
// creates the right card(s) on the given board's "GitHub" column
// (auto-created if missing). No persistent board↔repo binding.
// ---------------------------------------------------------------------------

export const githubBoardRouter = Router({ mergeParams: true });
githubBoardRouter.use(authMiddleware);

async function loadBoardForUser(req: AuthedRequest) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return null;
  const board = await prisma.board.findFirst({ where: { id, userId: req.userId! } });
  return board;
}

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

// parseGithubUrl is imported for runtime use by importFromUrl chains; keep ref
// available so TS doesn't tree-shake the import.
void parseGithubUrl;
