// Admin surface — owner-only. "Owner" is defined as the very first user
// (id = 1) which is the user created by /api/auth/setup on first launch.

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';

export const adminRouter = Router();

function isOwner(userId: number | undefined): boolean {
  return userId === 1;
}

adminRouter.use(authMiddleware);
adminRouter.use((req: AuthedRequest, res, next) => {
  if (!isOwner(req.userId)) {
    return res.status(403).json({ success: false, error: 'Owner only' });
  }
  next();
});

adminRouter.get('/audit-log', async (_req, res) => {
  try {
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin/audit-log] error:', err);
    res.status(500).json({ success: false, error: 'Audit log fetch failed' });
  }
});
