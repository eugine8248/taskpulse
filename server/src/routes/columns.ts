import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { broadcast } from '../services/wsHub';

export const columnsRouter = Router();
columnsRouter.use(authMiddleware);

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
});

// PATCH /api/columns/:id — rename + wipLimit
columnsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid column id' });
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    // ownership check via Board → User
    const column = await prisma.column.findUnique({
      where: { id },
      include: { board: true },
    });
    if (!column || column.board.userId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Column not found' });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.wipLimit !== undefined) data.wipLimit = parsed.data.wipLimit;

    const updated = await prisma.column.update({ where: { id }, data });

    broadcast(req.userId!, {
      type: 'column.update',
      column: {
        id: updated.id,
        name: updated.name,
        wipLimit: updated.wipLimit,
        order: updated.order,
      },
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        wipLimit: updated.wipLimit,
        order: updated.order,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[columns/patch] error:', err);
    res.status(500).json({ success: false, error: 'Column update failed' });
  }
});
