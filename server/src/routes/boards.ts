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

async function shapeBoardResponse(boardId: number) {
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) return null;
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
      pinnedAt: card.pinnedAt ? card.pinnedAt.toISOString() : null,
      order: card.order,
      labels: card.cardLabels.map((cl) => ({
        id: cl.label.id,
        name: cl.label.name,
      })),
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
      githubKind: card.githubKind,
      githubUrl: card.githubUrl,
      githubNumber: card.githubNumber,
      githubSha: card.githubSha,
      githubState: card.githubState,
      githubMetadata: card.githubMetadata,
      githubLastFetchedAt: card.githubLastFetchedAt ? card.githubLastFetchedAt.toISOString() : null,
    })),
  }));
  return {
    board: { id: board.id, name: board.name },
    columns: shaped,
    github: {
      repoUrl: board.githubRepoUrl,
      owner: board.githubRepoOwner,
      repo: board.githubRepoName,
      lastSyncAt: board.githubLastSyncAt ? board.githubLastSyncAt.toISOString() : null,
      autoSync: board.githubAutoSync,
      githubColumnId: board.githubColumnId,
    },
  };
}

// GET /api/boards/list — returns lightweight list of all boards for the authed user
boardsRouter.get('/list', async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!;
    const boards = await prisma.board.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { columns: true } },
        columns: { select: { _count: { select: { cards: true } } } },
      },
    });
    const data = boards.map((b) => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      columnCount: b._count.columns,
      cardCount: b.columns.reduce((sum, c) => sum + c._count.cards, 0),
      githubRepoUrl: b.githubRepoUrl,
      githubLastSyncAt: b.githubLastSyncAt ? b.githubLastSyncAt.toISOString() : null,
    }));
    res.json({ success: true, data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boards/list] error:', err);
    res.status(500).json({ success: false, error: 'Board list failed' });
  }
});

// GET /api/boards — legacy: returns the default (first) board with nested columns + cards + labels
boardsRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!;
    const board = await ensureDefaultBoard(userId);
    const shaped = await shapeBoardResponse(board.id);
    res.json({ success: true, data: shaped });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boards/get] error:', err);
    res.status(500).json({ success: false, error: 'Board fetch failed' });
  }
});

// GET /api/boards/:id — fetch a specific board (scoped to authed user)
boardsRouter.get('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid board id' });
    }
    const board = await prisma.board.findFirst({ where: { id, userId: req.userId! } });
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });
    const shaped = await shapeBoardResponse(board.id);
    res.json({ success: true, data: shaped });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boards/get-by-id] error:', err);
    res.status(500).json({ success: false, error: 'Board fetch failed' });
  }
});

// POST /api/boards — create a new board with the default 5 columns
boardsRouter.post('/', async (req: AuthedRequest, res) => {
  try {
    const parsed = z.object({ name: z.string().min(1).max(120) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const board = await prisma.board.create({
      data: {
        userId: req.userId!,
        name: parsed.data.name,
        columns: {
          create: DEFAULT_COLUMNS.map((n, i) => ({ name: n, order: i * 1000 })),
        },
      },
    });
    res.json({
      success: true,
      data: {
        id: board.id,
        name: board.name,
        createdAt: board.createdAt.toISOString(),
        updatedAt: board.updatedAt.toISOString(),
        columnCount: DEFAULT_COLUMNS.length,
        cardCount: 0,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boards/post] error:', err);
    res.status(500).json({ success: false, error: 'Board create failed' });
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

// DELETE /api/boards/:id — delete a board (scoped to authed user; cannot delete the last board)
boardsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid board id' });
    }
    const board = await prisma.board.findFirst({ where: { id, userId: req.userId! } });
    if (!board) return res.status(404).json({ success: false, error: 'Board not found' });

    const total = await prisma.board.count({ where: { userId: req.userId! } });
    if (total <= 1) {
      return res
        .status(400)
        .json({ success: false, error: 'Cannot delete your only project' });
    }

    // Schema has onDelete: Cascade on Board -> Column -> Card -> CardLabel
    await prisma.board.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boards/delete] error:', err);
    res.status(500).json({ success: false, error: 'Board delete failed' });
  }
});
