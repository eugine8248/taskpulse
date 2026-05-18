import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { broadcast } from '../services/wsHub';
import { fireCardEvent, shapeEvent } from '../services/cardEvents';
import { upsertCardFts, deleteCardFts } from '../services/fts';

export const cardsRouter = Router();
cardsRouter.use(authMiddleware);

const DEFAULT_PIN_CAP = 3;

async function getPinCap(): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: 'maxPins' } });
    if (!row) return DEFAULT_PIN_CAP;
    const n = parseInt(row.value, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_PIN_CAP;
  } catch {
    return DEFAULT_PIN_CAP;
  }
}

const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;

const createSchema = z.object({
  columnId: z.number().int(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  dueDate: z.string().nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(20000).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  dueDate: z.string().nullable().optional(),
  columnId: z.number().int().optional(),
});

const moveSchema = z.object({
  toColumnId: z.number().int(),
  toOrder: z.number(),
});

async function userOwnsColumn(userId: number, columnId: number): Promise<boolean> {
  const col = await prisma.column.findUnique({
    where: { id: columnId },
    include: { board: true },
  });
  return !!col && col.board.userId === userId;
}

async function userOwnsCard(userId: number, cardId: number): Promise<boolean> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { column: { include: { board: true } } },
  });
  return !!card && card.column.board.userId === userId;
}

function shape(card: Awaited<ReturnType<typeof fetchFullCard>>) {
  if (!card) return null;
  return {
    id: card.id,
    columnId: card.columnId,
    title: card.title,
    description: card.description,
    priority: card.priority,
    dueDate: card.dueDate ? card.dueDate.toISOString() : null,
    pinnedAt: card.pinnedAt ? card.pinnedAt.toISOString() : null,
    order: card.order,
    labels: card.cardLabels.map((cl) => ({ id: cl.label.id, name: cl.label.name })),
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

async function fetchFullCard(id: number) {
  return prisma.card.findUnique({
    where: { id },
    include: { cardLabels: { include: { label: true } } },
  });
}

// POST /api/cards — create at end of column
cardsRouter.post('/', async (req: AuthedRequest, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const { columnId, title, description, priority, dueDate } = parsed.data;
    if (!(await userOwnsColumn(req.userId!, columnId))) {
      return res.status(404).json({ success: false, error: 'Column not found' });
    }

    const last = await prisma.card.findFirst({
      where: { columnId },
      orderBy: { order: 'desc' },
    });
    const nextOrder = last ? last.order + 1000 : 1000;

    const created = await prisma.card.create({
      data: {
        columnId,
        title,
        description: description ?? '',
        priority: priority ?? 'medium',
        dueDate: dueDate ? new Date(dueDate) : null,
        order: nextOrder,
      },
    });
    const full = await fetchFullCard(created.id);
    const out = shape(full);

    broadcast(req.userId!, { type: 'card.create', card: out });
    fireCardEvent({
      cardId: created.id,
      kind: 'created',
      actorUserId: req.userId!,
      meta: { title, columnId },
    });
    upsertCardFts(created.id);

    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/create] error:', err);
    res.status(500).json({ success: false, error: 'Card create failed' });
  }
});

// PATCH /api/cards/:id — partial update
cardsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const existing = await prisma.card.findUnique({
      where: { id },
      include: { column: { include: { board: true } } },
    });
    if (!existing || existing.column.board.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
    if (parsed.data.dueDate !== undefined) {
      data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    }
    // Optional column move via PATCH (used by CLI `tp move`).
    let destColumn: { id: number; name: string; boardId: number } | null = null;
    if (parsed.data.columnId !== undefined && parsed.data.columnId !== existing.columnId) {
      const target = await prisma.column.findUnique({
        where: { id: parsed.data.columnId },
        include: { board: true },
      });
      if (!target || target.board.userId !== req.userId!) {
        return res.status(404).json({ success: false, error: 'Target column not found' });
      }
      destColumn = { id: target.id, name: target.name, boardId: target.boardId };
      // append to end of destination
      const last = await prisma.card.findFirst({
        where: { columnId: target.id },
        orderBy: { order: 'desc' },
      });
      data.columnId = target.id;
      data.order = last ? last.order + 1000 : 1000;
    }

    await prisma.card.update({ where: { id }, data });

    // Auto-clear pin + fire 'completed' if moved into a "Done" column.
    if (destColumn && destColumn.name.trim().toLowerCase() === 'done') {
      await prisma.card.update({ where: { id }, data: { pinnedAt: null } });
      fireCardEvent({ cardId: id, kind: 'completed', actorUserId: req.userId! });
    }

    const full = await fetchFullCard(id);
    const out = shape(full);

    broadcast(req.userId!, { type: 'card.update', card: out });

    if (destColumn) {
      fireCardEvent({
        cardId: id,
        kind: 'moved',
        actorUserId: req.userId!,
        meta: { from: existing.columnId, to: destColumn.id, fromName: existing.column.name, toName: destColumn.name },
      });
    }
    if (parsed.data.priority !== undefined && parsed.data.priority !== existing.priority) {
      fireCardEvent({
        cardId: id,
        kind: 'priority_changed',
        actorUserId: req.userId!,
        meta: { from: existing.priority, to: parsed.data.priority },
      });
    }
    if (parsed.data.title !== undefined || parsed.data.description !== undefined) {
      upsertCardFts(id);
    }

    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/patch] error:', err);
    res.status(500).json({ success: false, error: 'Card update failed' });
  }
});

// DELETE /api/cards/:id
cardsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    if (!(await userOwnsCard(req.userId!, id))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    await prisma.card.delete({ where: { id } });
    deleteCardFts(id);
    broadcast(req.userId!, { type: 'card.delete', cardId: id });
    res.json({ success: true, data: { id } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/delete] error:', err);
    res.status(500).json({ success: false, error: 'Card delete failed' });
  }
});

// POST /api/cards/:id/move — move (and reorder within / across columns)
cardsRouter.post('/:id/move', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const existing = await prisma.card.findUnique({
      where: { id },
      include: { column: { include: { board: true } } },
    });
    if (!existing || existing.column.board.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const target = await prisma.column.findUnique({
      where: { id: parsed.data.toColumnId },
      include: { board: true },
    });
    if (!target || target.board.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Target column not found' });
    }
    await prisma.card.update({
      where: { id },
      data: { columnId: parsed.data.toColumnId, order: parsed.data.toOrder },
    });

    const isColumnChange = existing.columnId !== target.id;
    if (isColumnChange && target.name.trim().toLowerCase() === 'done') {
      await prisma.card.update({ where: { id }, data: { pinnedAt: null } });
      fireCardEvent({ cardId: id, kind: 'completed', actorUserId: req.userId! });
    }

    const full = await fetchFullCard(id);
    const out = shape(full);

    broadcast(req.userId!, { type: 'card.move', card: out });

    if (isColumnChange) {
      fireCardEvent({
        cardId: id,
        kind: 'moved',
        actorUserId: req.userId!,
        meta: {
          from: existing.columnId,
          to: target.id,
          fromName: existing.column.name,
          toName: target.name,
        },
      });
    }

    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/move] error:', err);
    res.status(500).json({ success: false, error: 'Card move failed' });
  }
});

// POST /api/cards/:id/labels — attach a label (idempotent)
cardsRouter.post('/:id/labels', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    const parsed = z.object({ labelId: z.number().int() }).safeParse(req.body);
    if (!Number.isFinite(cardId) || !parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const label = await prisma.label.findFirst({
      where: { id: parsed.data.labelId, userId: req.userId! },
    });
    if (!label) return res.status(404).json({ success: false, error: 'Label not found' });

    await prisma.cardLabel.upsert({
      where: { cardId_labelId: { cardId, labelId: label.id } },
      create: { cardId, labelId: label.id },
      update: {},
    });
    const full = await fetchFullCard(cardId);
    const out = shape(full);
    broadcast(req.userId!, { type: 'card.update', card: out });
    fireCardEvent({
      cardId,
      kind: 'tagged',
      actorUserId: req.userId!,
      meta: { added: label.name },
    });
    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/labels/attach] error:', err);
    res.status(500).json({ success: false, error: 'Attach label failed' });
  }
});

// DELETE /api/cards/:id/labels/:labelId
cardsRouter.delete('/:id/labels/:labelId', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    const labelId = parseInt(req.params.labelId, 10);
    if (!Number.isFinite(cardId) || !Number.isFinite(labelId)) {
      return res.status(400).json({ success: false, error: 'Invalid ids' });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const lbl = await prisma.label.findUnique({ where: { id: labelId } });
    await prisma.cardLabel
      .delete({ where: { cardId_labelId: { cardId, labelId } } })
      .catch(() => {
        /* idempotent — already detached */
      });
    const full = await fetchFullCard(cardId);
    const out = shape(full);
    broadcast(req.userId!, { type: 'card.update', card: out });
    if (lbl) {
      fireCardEvent({
        cardId,
        kind: 'tagged',
        actorUserId: req.userId!,
        meta: { removed: lbl.name },
      });
    }
    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/labels/detach] error:', err);
    res.status(500).json({ success: false, error: 'Detach label failed' });
  }
});

// ============================================================================
// Pinned cards — capped at AppSetting.maxPins (default 3)
// ============================================================================

// GET /api/cards/pinned — list all pinned cards across all user boards
cardsRouter.get('/pinned', async (req: AuthedRequest, res) => {
  try {
    const cards = await prisma.card.findMany({
      where: {
        pinnedAt: { not: null },
        column: { board: { userId: req.userId! } },
      },
      include: {
        cardLabels: { include: { label: true } },
        column: { include: { board: true } },
      },
      orderBy: { pinnedAt: 'desc' },
    });
    const data = cards.map((c) => ({
      ...shape({ ...c, cardLabels: c.cardLabels } as Awaited<ReturnType<typeof fetchFullCard>>),
      boardId: c.column.boardId,
      boardName: c.column.board.name,
      columnName: c.column.name,
    }));
    res.json({ success: true, data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/pinned] error:', err);
    res.status(500).json({ success: false, error: 'Pinned fetch failed' });
  }
});

// POST /api/cards/:id/pin — atomically enforce pin cap
cardsRouter.post('/:id/pin', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    if (!(await userOwnsCard(req.userId!, id))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const cap = await getPinCap();

    // Use a transaction so the pin-count read and the pin-write are atomic
    // (SQLite default isolation is serializable, so this is enough).
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.card.findUnique({ where: { id } });
      if (!existing) return { error: 'not_found' as const };
      // Already pinned? Re-pin idempotently with refreshed timestamp.
      const pinnedCount = await tx.card.count({
        where: {
          pinnedAt: { not: null },
          column: { board: { userId: req.userId! } },
        },
      });
      const isAlreadyPinned = existing.pinnedAt !== null;
      if (!isAlreadyPinned && pinnedCount >= cap) {
        return { error: 'cap' as const };
      }
      const updated = await tx.card.update({
        where: { id },
        data: { pinnedAt: new Date() },
      });
      return { updated };
    });

    if ('error' in result && result.error === 'not_found') {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    if ('error' in result && result.error === 'cap') {
      return res.status(409).json({ error: 'pin_cap_reached', cap });
    }

    const full = await fetchFullCard(id);
    const out = shape(full);
    broadcast(req.userId!, { type: 'card.update', card: out });
    fireCardEvent({ cardId: id, kind: 'pinned', actorUserId: req.userId! });

    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/pin] error:', err);
    res.status(500).json({ success: false, error: 'Pin failed' });
  }
});

// POST /api/cards/:id/unpin
cardsRouter.post('/:id/unpin', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    if (!(await userOwnsCard(req.userId!, id))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    await prisma.card.update({ where: { id }, data: { pinnedAt: null } });
    const full = await fetchFullCard(id);
    const out = shape(full);
    broadcast(req.userId!, { type: 'card.update', card: out });
    fireCardEvent({ cardId: id, kind: 'unpinned', actorUserId: req.userId! });
    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/unpin] error:', err);
    res.status(500).json({ success: false, error: 'Unpin failed' });
  }
});

// ============================================================================
// Comments
// ============================================================================

const commentSchema = z.object({ body: z.string().min(1).max(10000) });

// POST /api/cards/:id/comments
cardsRouter.post('/:id/comments', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const created = await prisma.cardComment.create({
      data: { cardId, body: parsed.data.body, authorUserId: req.userId! },
    });
    const data = {
      id: created.id,
      cardId: created.cardId,
      body: created.body,
      authorUserId: created.authorUserId,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
    broadcast(req.userId!, { type: 'card.comment.create', comment: data });
    fireCardEvent({
      cardId,
      kind: 'commented',
      actorUserId: req.userId!,
      meta: { commentId: created.id, preview: parsed.data.body.slice(0, 80) },
    });
    upsertCardFts(cardId);
    res.json({ success: true, data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/comments/create] error:', err);
    res.status(500).json({ success: false, error: 'Comment create failed' });
  }
});

// GET /api/cards/:id/comments
cardsRouter.get('/:id/comments', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const rows = await prisma.cardComment.findMany({
      where: { cardId },
      orderBy: { createdAt: 'asc' },
    });
    const data = rows.map((c) => ({
      id: c.id,
      cardId: c.cardId,
      body: c.body,
      authorUserId: c.authorUserId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
    res.json({ success: true, data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/comments/list] error:', err);
    res.status(500).json({ success: false, error: 'Comment list failed' });
  }
});

// PATCH /api/cards/:id/comments/:commentId — author only
cardsRouter.patch('/:id/comments/:commentId', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    const commentId = parseInt(req.params.commentId, 10);
    if (!Number.isFinite(cardId) || !Number.isFinite(commentId)) {
      return res.status(400).json({ success: false, error: 'Invalid ids' });
    }
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const comment = await prisma.cardComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.cardId !== cardId) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }
    if (comment.authorUserId !== req.userId!) {
      return res.status(403).json({ success: false, error: 'Not author' });
    }
    const updated = await prisma.cardComment.update({
      where: { id: commentId },
      data: { body: parsed.data.body },
    });
    upsertCardFts(cardId);
    res.json({
      success: true,
      data: {
        id: updated.id,
        cardId: updated.cardId,
        body: updated.body,
        authorUserId: updated.authorUserId,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/comments/patch] error:', err);
    res.status(500).json({ success: false, error: 'Comment update failed' });
  }
});

// DELETE /api/cards/:id/comments/:commentId — author only
cardsRouter.delete('/:id/comments/:commentId', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    const commentId = parseInt(req.params.commentId, 10);
    if (!Number.isFinite(cardId) || !Number.isFinite(commentId)) {
      return res.status(400).json({ success: false, error: 'Invalid ids' });
    }
    const comment = await prisma.cardComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.cardId !== cardId) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }
    if (comment.authorUserId !== req.userId!) {
      return res.status(403).json({ success: false, error: 'Not author' });
    }
    await prisma.cardComment.delete({ where: { id: commentId } });
    upsertCardFts(cardId);
    res.json({ success: true, data: { id: commentId } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/comments/delete] error:', err);
    res.status(500).json({ success: false, error: 'Comment delete failed' });
  }
});

// ============================================================================
// Per-card events
// ============================================================================

// GET /api/cards/:id/events — timeline for one card
cardsRouter.get('/:id/events', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const rows = await prisma.cardEvent.findMany({
      where: { cardId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, data: rows.map(shapeEvent) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/events] error:', err);
    res.status(500).json({ success: false, error: 'Event fetch failed' });
  }
});
