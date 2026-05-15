import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';

export const labelsRouter = Router();
labelsRouter.use(authMiddleware);

labelsRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const labels = await prisma.label.findMany({
      where: { userId: req.userId! },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: labels.map((l) => ({ id: l.id, name: l.name })) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[labels/list] error:', err);
    res.status(500).json({ success: false, error: 'Labels fetch failed' });
  }
});

labelsRouter.post('/', async (req: AuthedRequest, res) => {
  try {
    const parsed = z
      .object({ name: z.string().min(1).max(60).trim() })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const label = await prisma.label.upsert({
      where: { userId_name: { userId: req.userId!, name: parsed.data.name } },
      create: { userId: req.userId!, name: parsed.data.name },
      update: {},
    });
    res.json({ success: true, data: { id: label.id, name: label.name } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[labels/create] error:', err);
    res.status(500).json({ success: false, error: 'Label create failed' });
  }
});

labelsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid label id' });
    }
    const label = await prisma.label.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!label) return res.status(404).json({ success: false, error: 'Label not found' });
    await prisma.label.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[labels/delete] error:', err);
    res.status(500).json({ success: false, error: 'Label delete failed' });
  }
});
