import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';

export const viewsRouter = Router();
viewsRouter.use(authMiddleware);

const filterSchema = z
  .object({
    boardId: z.number().int().optional(),
    columns: z.array(z.number().int()).optional(),
    tags: z.array(z.string()).optional(),
    priority: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
    overdueOnly: z.boolean().optional(),
    search: z.string().optional(),
  })
  .passthrough();

const sortSchema = z
  .object({
    field: z.string(),
    direction: z.enum(['asc', 'desc']),
  })
  .passthrough();

const createSchema = z.object({
  name: z.string().min(1).max(120),
  filter: filterSchema,
  sort: sortSchema,
  isDefault: z.boolean().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  filter: filterSchema.optional(),
  sort: sortSchema.optional(),
  isDefault: z.boolean().optional(),
});

function shape(v: {
  id: number;
  userId: number;
  name: string;
  filter: string;
  sort: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: v.id,
    userId: v.userId,
    name: v.name,
    filter: safeParse(v.filter),
    sort: safeParse(v.sort),
    isDefault: v.isDefault,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}
function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

viewsRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const rows = await prisma.savedView.findMany({
      where: { userId: req.userId! },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, data: rows.map(shape) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[views/list] error:', err);
    res.status(500).json({ success: false, error: 'Views list failed' });
  }
});

viewsRouter.post('/', async (req: AuthedRequest, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const { name, filter, sort, isDefault } = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.savedView.updateMany({
          where: { userId: req.userId!, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.savedView.create({
        data: {
          userId: req.userId!,
          name,
          filter: JSON.stringify(filter),
          sort: JSON.stringify(sort),
          isDefault: !!isDefault,
        },
      });
    });
    res.json({ success: true, data: shape(result) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[views/post] error:', err);
    res.status(500).json({ success: false, error: 'View create failed' });
  }
});

viewsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid view id' });
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'View not found' });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.filter !== undefined) data.filter = JSON.stringify(parsed.data.filter);
    if (parsed.data.sort !== undefined) data.sort = JSON.stringify(parsed.data.sort);

    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault === true) {
        await tx.savedView.updateMany({
          where: { userId: req.userId!, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
        data.isDefault = true;
      } else if (parsed.data.isDefault === false) {
        data.isDefault = false;
      }
      return tx.savedView.update({ where: { id }, data });
    });
    res.json({ success: true, data: shape(updated) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[views/patch] error:', err);
    res.status(500).json({ success: false, error: 'View update failed' });
  }
});

viewsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid view id' });
    }
    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'View not found' });
    }
    await prisma.savedView.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[views/delete] error:', err);
    res.status(500).json({ success: false, error: 'View delete failed' });
  }
});
