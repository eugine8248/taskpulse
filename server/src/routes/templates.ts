import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { fireCardEvent } from '../services/cardEvents';
import { upsertCardFts } from '../services/fts';

export const templatesRouter = Router();
templatesRouter.use(authMiddleware);

const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;

const templateCardSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  cards: z.array(templateCardSchema).min(1).max(100),
});

function shape(t: {
  id: number;
  userId: number;
  name: string;
  cards: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  let parsed: unknown = [];
  try { parsed = JSON.parse(t.cards); } catch { /* ignore */ }
  return {
    id: t.id,
    userId: t.userId,
    name: t.name,
    cards: parsed,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

templatesRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const rows = await prisma.cardTemplate.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: rows.map(shape) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[templates/list] error:', err);
    res.status(500).json({ success: false, error: 'Template list failed' });
  }
});

templatesRouter.post('/', async (req: AuthedRequest, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const created = await prisma.cardTemplate.create({
      data: {
        userId: req.userId!,
        name: parsed.data.name,
        cards: JSON.stringify(parsed.data.cards),
      },
    });
    res.json({ success: true, data: shape(created) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[templates/post] error:', err);
    res.status(500).json({ success: false, error: 'Template create failed' });
  }
});

templatesRouter.post('/from-card/:cardId', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.cardId, 10);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    const parsed = z.object({ name: z.string().min(1).max(120) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } }, cardLabels: { include: { label: true } } },
    });
    if (!card || card.column.board.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const cards = [{
      title: card.title,
      description: card.description,
      priority: card.priority,
      tags: card.cardLabels.map((cl) => cl.label.name),
    }];
    const created = await prisma.cardTemplate.create({
      data: { userId: req.userId!, name: parsed.data.name, cards: JSON.stringify(cards) },
    });
    res.json({ success: true, data: shape(created) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[templates/from-card] error:', err);
    res.status(500).json({ success: false, error: 'Template-from-card failed' });
  }
});

templatesRouter.post('/:id/apply', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid template id' });
    }
    const parsed = z.object({
      boardId: z.number().int(),
      columnId: z.number().int(),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const tpl = await prisma.cardTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    const col = await prisma.column.findUnique({
      where: { id: parsed.data.columnId },
      include: { board: true },
    });
    if (!col || col.board.userId !== req.userId! || col.boardId !== parsed.data.boardId) {
      return res.status(404).json({ success: false, error: 'Column not found' });
    }

    let cards: z.infer<typeof templateCardSchema>[] = [];
    try { cards = JSON.parse(tpl.cards); } catch { /* keep empty */ }

    const last = await prisma.card.findFirst({
      where: { columnId: col.id },
      orderBy: { order: 'desc' },
    });
    let nextOrder = (last?.order ?? 0) + 1000;

    const spawned = [];
    for (const tc of cards) {
      const card = await prisma.card.create({
        data: {
          columnId: col.id,
          title: tc.title,
          description: tc.description ?? '',
          priority: tc.priority ?? 'medium',
          order: nextOrder,
        },
      });
      nextOrder += 1000;

      // attach tags (creating labels if missing).
      if (tc.tags && tc.tags.length) {
        for (const tag of tc.tags) {
          const label = await prisma.label.upsert({
            where: { userId_name: { userId: req.userId!, name: tag } },
            create: { userId: req.userId!, name: tag },
            update: {},
          });
          await prisma.cardLabel.upsert({
            where: { cardId_labelId: { cardId: card.id, labelId: label.id } },
            create: { cardId: card.id, labelId: label.id },
            update: {},
          });
        }
      }
      fireCardEvent({
        cardId: card.id,
        kind: 'created',
        actorUserId: req.userId!,
        meta: { fromTemplate: tpl.name },
      });
      upsertCardFts(card.id);
      spawned.push({ id: card.id, title: card.title });
    }
    res.json({ success: true, data: { templateId: id, spawned } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[templates/apply] error:', err);
    res.status(500).json({ success: false, error: 'Template apply failed' });
  }
});

templatesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid template id' });
    }
    const tpl = await prisma.cardTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    await prisma.cardTemplate.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[templates/delete] error:', err);
    res.status(500).json({ success: false, error: 'Template delete failed' });
  }
});
