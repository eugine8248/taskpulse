// FTS5 virtual table maintenance helpers.
//
// We keep these helpers self-contained so call-sites can call them
// fire-and-forget without bringing down a request if FTS fails.

import { prisma } from '../lib/prisma';

let ftsReady = false;

/**
 * Idempotent — safe to call repeatedly. Creates the virtual table on first
 * call and rebuilds it from Card + CardComment so server restarts always
 * land with a populated index. We use `content=''` (contentless table)
 * because Prisma owns the source rows; we always write directly via this
 * service.
 */
export async function ensureFtsReady(): Promise<void> {
  if (ftsReady) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
        title, description, comment_bodies,
        content='', tokenize='porter unicode61'
      )
    `);
    // Idempotent rebuild — re-upsert every card.
    const cards = await prisma.card.findMany({
      select: { id: true, title: true, description: true },
    });
    for (const c of cards) {
      const comments = await prisma.cardComment.findMany({
        where: { cardId: c.id },
        select: { body: true },
      });
      const commentText = comments.map((cc) => cc.body).join('\n');
      await prisma.$executeRawUnsafe(
        `INSERT OR REPLACE INTO cards_fts(rowid, title, description, comment_bodies) VALUES (?, ?, ?, ?)`,
        c.id,
        c.title ?? '',
        c.description ?? '',
        commentText,
      );
    }
    ftsReady = true;
    // eslint-disable-next-line no-console
    console.log(`[fts] ready — indexed ${cards.length} cards`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[fts] ensureFtsReady failed:', err);
  }
}

/** Re-index a single card. Fire-and-forget. */
export function upsertCardFts(cardId: number): void {
  (async () => {
    try {
      if (!ftsReady) await ensureFtsReady();
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { id: true, title: true, description: true },
      });
      if (!card) return;
      const comments = await prisma.cardComment.findMany({
        where: { cardId },
        select: { body: true },
      });
      const commentText = comments.map((c) => c.body).join('\n');
      await prisma.$executeRawUnsafe(
        `INSERT OR REPLACE INTO cards_fts(rowid, title, description, comment_bodies) VALUES (?, ?, ?, ?)`,
        cardId,
        card.title ?? '',
        card.description ?? '',
        commentText,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[fts] upsertCardFts failed:', cardId, err);
    }
  })();
}

/** Drop a card from the index. Fire-and-forget. */
export function deleteCardFts(cardId: number): void {
  (async () => {
    try {
      if (!ftsReady) await ensureFtsReady();
      await prisma.$executeRawUnsafe(`DELETE FROM cards_fts WHERE rowid = ?`, cardId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[fts] deleteCardFts failed:', cardId, err);
    }
  })();
}
