import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';

export const boardsRouter = Router();
boardsRouter.use(authMiddleware);

const DEFAULT_COLUMNS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];

async function ensureDefaultBoard(userId: number) {
  let board = await prisma.board.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  if (!board) {
    // Use AppSetting for a customizable default name if present
    const setting = await prisma.appSetting.findUnique({ where: { key: 'default_board_name' } });
    const name = setting?.value || 'Project';
    board = await prisma.board.create({
      data: {
        userId,
        name,
        columns: {
          create: DEFAULT_COLUMNS.map((n, i) => ({ name: n, order: i * 1000 })),
        },
      },
    });
  }
  return board;
}

// GET /api/boards — returns the default board with nested columns + cards + labels
boardsRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!;
    const board = await ensureDefaultBoard(userId);

    const columns = await prisma.column.findMany({
      where: { boardId: board.id },
      orderBy: { order: 'asc' },
      include: {
        cards: {
          orderBy: { order: 'asc' },
          include: {
            cardLabels: { include: { label: true } },
          },
        },
      },
    });

    const shaped = columns.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      wipLimit: c.wipLimit,
      cards: c.cards.map((card) => ({
        id: card.id,
        columnId: card.columnId,
        title: card.title,
        description: card.description,
        priority: card.priority,
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        order: card.order,
        labels: card.cardLabels.map((cl) => ({
          id: cl.label.id,
          name: cl.label.name,
        })),
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
      })),
    }));

    res.json({
      success: true,
      data: {
        board: { id: board.id, name: board.name },
        columns: shaped,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boards/get] error:', err);
    res.status(500).json({ success: false, error: 'Board fetch failed' });
  }
});

// PATCH /api/boards/:id — rename
boardsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid board id' });
    }
    const parsed = z.object({ name: z.string().min(1).max(120) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const board = await prisma.board.findFirst({ where: { id, userId: req.userId! } });
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });

    const updated = await prisma.board.update({
      where: { id },
      data: { name: parsed.data.name },
    });
    res.json({ success: true, data: { id: updated.id, name: updated.name } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boards/patch] error:', err);
    res.status(500).json({ success: false, error: 'Board update failed' });
  }
});
