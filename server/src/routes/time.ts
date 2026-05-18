import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { broadcast } from '../services/wsHub';
import { fireCardEvent } from '../services/cardEvents';

export const timeRouter = Router();
timeRouter.use(authMiddleware);

async function userOwnsCard(userId: number, cardId: number): Promise<boolean> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { column: { include: { board: true } } },
  });
  return !!card && card.column.board.userId === userId;
}

function shapeEntry(e: {
  id: number;
  cardId: number;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  note: string | null;
  authorUserId: number;
  createdAt: Date;
}) {
  return {
    id: e.id,
    cardId: e.cardId,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt ? e.endedAt.toISOString() : null,
    durationMs: e.durationMs,
    note: e.note,
    authorUserId: e.authorUserId,
    createdAt: e.createdAt.toISOString(),
  };
}

// POST /api/cards/:id/time/start — mounted by index? No, we expose under /api/time
// Per spec, route is POST /api/cards/:id/time/start. We mount this router at
// /api/time AND we additionally re-route from cards. To keep things simple we
// expose all CLI-facing paths under /api/time and also add aliases under /api/cards.

// POST /api/time/cards/:id/start
const startSchema = z.object({ note: z.string().max(500).optional() });

timeRouter.post('/cards/:id/start', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    const parsed = startSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const result = await prisma.$transaction(async (tx) => {
      // Stop any open entry for this user (any card).
      const open = await tx.timeEntry.findFirst({
        where: { authorUserId: req.userId!, endedAt: null },
      });
      let stopped = null;
      if (open) {
        const endedAt = new Date();
        const duration = endedAt.getTime() - open.startedAt.getTime();
        stopped = await tx.timeEntry.update({
          where: { id: open.id },
          data: { endedAt, durationMs: duration },
        });
      }
      const started = await tx.timeEntry.create({
        data: {
          cardId,
          authorUserId: req.userId!,
          startedAt: new Date(),
          note: parsed.data.note ?? null,
        },
      });
      return { started, stopped };
    });

    if (result.stopped) {
      broadcast(req.userId!, { type: 'time.stop', entry: shapeEntry(result.stopped) });
      fireCardEvent({
        cardId: result.stopped.cardId,
        kind: 'time_logged',
        actorUserId: req.userId!,
        meta: { durationMs: result.stopped.durationMs, autoStoppedForSwitch: true },
      });
    }
    broadcast(req.userId!, { type: 'time.start', entry: shapeEntry(result.started) });

    res.json({
      success: true,
      data: {
        started: shapeEntry(result.started),
        stopped: result.stopped ? shapeEntry(result.stopped) : null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[time/start] error:', err);
    res.status(500).json({ success: false, error: 'Time start failed' });
  }
});

// POST /api/time/cards/:id/stop
timeRouter.post('/cards/:id/stop', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const open = await prisma.timeEntry.findFirst({
      where: { cardId, authorUserId: req.userId!, endedAt: null },
    });
    if (!open) {
      return res.status(404).json({ success: false, error: 'No running entry for this card' });
    }
    const endedAt = new Date();
    const duration = endedAt.getTime() - open.startedAt.getTime();
    const stopped = await prisma.timeEntry.update({
      where: { id: open.id },
      data: { endedAt, durationMs: duration },
    });
    broadcast(req.userId!, { type: 'time.stop', entry: shapeEntry(stopped) });
    fireCardEvent({
      cardId,
      kind: 'time_logged',
      actorUserId: req.userId!,
      meta: { durationMs: stopped.durationMs },
    });
    res.json({ success: true, data: shapeEntry(stopped) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[time/stop] error:', err);
    res.status(500).json({ success: false, error: 'Time stop failed' });
  }
});

// GET /api/time/cards/:id
timeRouter.get('/cards/:id', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const rows = await prisma.timeEntry.findMany({
      where: { cardId },
      orderBy: { startedAt: 'desc' },
    });
    res.json({ success: true, data: rows.map(shapeEntry) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[time/list-card] error:', err);
    res.status(500).json({ success: false, error: 'Time list failed' });
  }
});

// GET /api/time/running — the user's current running entry (or null)
timeRouter.get('/running', async (req: AuthedRequest, res) => {
  try {
    const open = await prisma.timeEntry.findFirst({
      where: { authorUserId: req.userId!, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: { card: { select: { id: true, title: true, columnId: true } } },
    });
    if (!open) return res.json({ success: true, data: null });
    res.json({
      success: true,
      data: {
        ...shapeEntry(open),
        card: { id: open.card.id, title: open.card.title, columnId: open.card.columnId },
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[time/running] error:', err);
    res.status(500).json({ success: false, error: 'Time running failed' });
  }
});

// GET /api/time/summary — today, week, byBoard
timeRouter.get('/summary', async (req: AuthedRequest, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Week starts Monday
    const dow = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = (dow + 6) % 7;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMonday);

    const all = await prisma.timeEntry.findMany({
      where: { authorUserId: req.userId!, endedAt: { not: null }, durationMs: { not: null } },
      include: { card: { include: { column: { include: { board: true } } } } },
    });

    let today = 0;
    let week = 0;
    const byBoard: Record<number, { id: number; name: string; durationMs: number }> = {};
    for (const e of all) {
      if (!e.endedAt || e.durationMs == null) continue;
      const d = e.durationMs;
      if (e.startedAt >= startOfDay) today += d;
      if (e.startedAt >= startOfWeek) week += d;
      const board = e.card.column.board;
      if (!byBoard[board.id]) byBoard[board.id] = { id: board.id, name: board.name, durationMs: 0 };
      byBoard[board.id].durationMs += d;
    }

    // Add the currently-running entry's partial duration (today + week).
    const running = await prisma.timeEntry.findFirst({
      where: { authorUserId: req.userId!, endedAt: null },
    });
    if (running) {
      const partial = now.getTime() - running.startedAt.getTime();
      if (running.startedAt >= startOfDay) today += partial;
      if (running.startedAt >= startOfWeek) week += partial;
    }

    res.json({
      success: true,
      data: { today, week, byBoard: Object.values(byBoard) },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[time/summary] error:', err);
    res.status(500).json({ success: false, error: 'Time summary failed' });
  }
});

// PATCH /api/time/:id — edit note/startedAt/endedAt; recompute durationMs
const patchSchema = z.object({
  note: z.string().max(500).nullable().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().nullable().optional(),
});

timeRouter.patch('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid entry id' });
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry || entry.authorUserId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.note !== undefined) data.note = parsed.data.note;
    let newStartedAt = entry.startedAt;
    let newEndedAt = entry.endedAt;
    if (parsed.data.startedAt !== undefined) {
      newStartedAt = new Date(parsed.data.startedAt);
      data.startedAt = newStartedAt;
    }
    if (parsed.data.endedAt !== undefined) {
      newEndedAt = parsed.data.endedAt ? new Date(parsed.data.endedAt) : null;
      data.endedAt = newEndedAt;
    }
    if (newEndedAt) {
      data.durationMs = newEndedAt.getTime() - newStartedAt.getTime();
    } else {
      data.durationMs = null;
    }
    const updated = await prisma.timeEntry.update({ where: { id }, data });
    res.json({ success: true, data: shapeEntry(updated) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[time/patch] error:', err);
    res.status(500).json({ success: false, error: 'Time update failed' });
  }
});

// DELETE /api/time/:id
timeRouter.delete('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid entry id' });
    }
    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry || entry.authorUserId !== req.userId!) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    await prisma.timeEntry.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[time/delete] error:', err);
    res.status(500).json({ success: false, error: 'Time delete failed' });
  }
});
