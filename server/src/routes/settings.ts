import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';

export const settingsRouter = Router();
settingsRouter.use(authMiddleware);

// GET /api/settings — returns flat key->value map
settingsRouter.get('/', async (_req, res) => {
  try {
    const rows = await prisma.appSetting.findMany();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    res.json({ success: true, data: out });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[settings/get] error:', err);
    res.status(500).json({ success: false, error: 'Settings fetch failed' });
  }
});

// PUT /api/settings — upsert each key->value
settingsRouter.put('/', async (req, res) => {
  try {
    const parsed = z.record(z.string()).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const entries = Object.entries(parsed.data);
    for (const [key, value] of entries) {
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    res.json({ success: true, data: { updated: entries.length } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[settings/put] error:', err);
    res.status(500).json({ success: false, error: 'Settings update failed' });
  }
});
