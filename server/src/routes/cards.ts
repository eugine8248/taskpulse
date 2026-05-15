import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { broadcast } from '../services/wsHub';

export const cardsRouter = Router();
cardsRouter.use(authMiddleware);

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
    if (!(await userOwnsCard(req.userId!, id))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
    if (parsed.data.dueDate !== undefined) {
      data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    }
    await prisma.card.update({ where: { id }, data });
    const full = await fetchFullCard(id);
    const out = shape(full);

    broadcast(req.userId!, { type: 'card.update', card: out });

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
    if (!(await userOwnsCard(req.userId!, id))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    if (!(await userOwnsColumn(req.userId!, parsed.data.toColumnId))) {
      return res.status(404).json({ success: false, error: 'Target column not found' });
    }
    await prisma.card.update({
      where: { id },
      data: { columnId: parsed.data.toColumnId, order: parsed.data.toOrder },
    });
    const full = await fetchFullCard(id);
    const out = shape(full);

    broadcast(req.userId!, { type: 'card.move', card: out });

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
    await prisma.cardLabel
      .delete({ where: { cardId_labelId: { cardId, labelId } } })
      .catch(() => {
        /* idempotent — already detached */
      });
    const full = await fetchFullCard(cardId);
    const out = shape(full);
    broadcast(req.userId!, { type: 'card.update', card: out });
    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cards/labels/detach] error:', err);
    res.status(500).json({ success: false, error: 'Detach label failed' });
  }
});
