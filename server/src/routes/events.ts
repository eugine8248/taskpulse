import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { shapeEvent } from '../services/cardEvents';

export const eventsRouter = Router();
eventsRouter.use(authMiddleware);

// GET /api/events?boardId=&days=&limit= — board-wide or user-wide activity
eventsRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const boardId = req.query.boardId ? parseInt(String(req.query.boardId), 10) : null;
    const days = Math.min(parseInt(String(req.query.days ?? '7'), 10) || 7, 90);
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Constrain by the user's ownership through the Card -> Column -> Board chain.
    const where: Record<string, unknown> = {
      createdAt: { gte: since },
      card: {
        column: {
          board: {
            userId: req.userId!,
            ...(boardId != null && Number.isFinite(boardId) ? { id: boardId } : {}),
          },
        },
      },
    };

    const rows = await prisma.cardEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        card: {
          select: {
            id: true,
            title: true,
            columnId: true,
            column: { select: { id: true, name: true, boardId: true, board: { select: { name: true } } } },
          },
        },
      },
    });

    const data = rows.map((r) => ({
      ...shapeEvent(r),
      card: {
        id: r.card.id,
        title: r.card.title,
        columnId: r.card.columnId,
        columnName: r.card.column.name,
        boardId: r.card.column.boardId,
        boardName: r.card.column.board.name,
      },
    }));

    res.json({ success: true, data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[events/list] error:', err);
    res.status(500).json({ success: false, error: 'Events fetch failed' });
  }
});
