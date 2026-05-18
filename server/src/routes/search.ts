import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { ensureFtsReady } from '../services/fts';

export const searchRouter = Router();
searchRouter.use(authMiddleware);

// Sanitize FTS5 query — escape double quotes so user input can't break out of
// the quoted term, then wrap each whitespace-separated token in double quotes.
// This gives reliable substring-style behavior while still letting FTS5 do
// stemming via the porter tokenizer.
function buildMatch(q: string): string {
  const tokens = q
    .replace(/"/g, '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return '';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

// GET /api/search?q=&board=&limit=20
searchRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const boardFilter = req.query.board ? parseInt(String(req.query.board), 10) : null;

    if (!q) return res.json({ success: true, data: [] });

    await ensureFtsReady();
    const match = buildMatch(q);
    if (!match) return res.json({ success: true, data: [] });

    type Row = {
      rowid: number;
      title: string;
      description: string;
      comment_bodies: string;
      title_snip: string;
      desc_snip: string;
      comment_snip: string;
      rank: number;
    };

    // bm25() returns lower-is-better; we use rank ASC.
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         cards_fts.rowid as rowid,
         cards_fts.title as title,
         cards_fts.description as description,
         cards_fts.comment_bodies as comment_bodies,
         snippet(cards_fts, 0, '<mark>', '</mark>', '…', 12) as title_snip,
         snippet(cards_fts, 1, '<mark>', '</mark>', '…', 12) as desc_snip,
         snippet(cards_fts, 2, '<mark>', '</mark>', '…', 12) as comment_snip,
         bm25(cards_fts) as rank
       FROM cards_fts
       WHERE cards_fts MATCH ?
       ORDER BY rank ASC
       LIMIT ?`,
      match,
      limit * 4, // overfetch so we can filter by board/user
    );

    if (!rows.length) return res.json({ success: true, data: [] });

    const ids = rows.map((r) => r.rowid);
    const cards = await prisma.card.findMany({
      where: {
        id: { in: ids },
        column: { board: { userId: req.userId! } },
      },
      include: { column: { include: { board: true } } },
    });
    const byId = new Map(cards.map((c) => [c.id, c]));

    const data = rows
      .map((r) => {
        const c = byId.get(r.rowid);
        if (!c) return null;
        if (boardFilter != null && Number.isFinite(boardFilter) && c.column.boardId !== boardFilter) {
          return null;
        }
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          priority: c.priority,
          columnId: c.columnId,
          columnName: c.column.name,
          boardId: c.column.boardId,
          boardName: c.column.board.name,
          rank: r.rank,
          highlights: {
            title: r.title_snip,
            description: r.desc_snip,
            comments: r.comment_snip,
          },
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    res.json({ success: true, data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[search] error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});
