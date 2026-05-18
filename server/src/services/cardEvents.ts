// Fire-and-forget activity event recorder.
//
// Used by routes after they've committed their primary write — we never want
// event-recording failures to bubble up and turn a successful mutation into a
// 500. So every helper here is wrapped in catch + console.error.

import { prisma } from '../lib/prisma';
import { broadcast } from './wsHub';

export type CardEventKind =
  | 'created'
  | 'moved'
  | 'priority_changed'
  | 'pinned'
  | 'unpinned'
  | 'completed'
  | 'commented'
  | 'time_logged'
  | 'attached'
  | 'tagged'
  // v2.5 GitHub events
  | 'github_pr_imported'
  | 'github_pr_merged'
  | 'github_pr_closed'
  | 'github_issue_imported'
  | 'github_issue_closed';

export interface FireCardEventArgs {
  cardId: number;
  kind: CardEventKind;
  actorUserId: number;
  meta?: Record<string, unknown> | null;
}

/**
 * Insert a CardEvent row and (best-effort) push a websocket notification.
 * Errors are swallowed and logged — never throw.
 */
export function fireCardEvent(args: FireCardEventArgs): void {
  const { cardId, kind, actorUserId, meta } = args;
  (async () => {
    try {
      const created = await prisma.cardEvent.create({
        data: {
          cardId,
          kind,
          actorUserId,
          meta: meta ? JSON.stringify(meta) : null,
        },
      });
      broadcast(actorUserId, {
        type: 'card.event',
        event: {
          id: created.id,
          cardId,
          kind,
          meta: meta ?? null,
          actorUserId,
          createdAt: created.createdAt.toISOString(),
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[cardEvents] failed to fire event:', kind, cardId, err);
    }
  })();
}

export function shapeEvent(e: {
  id: number;
  cardId: number;
  kind: string;
  meta: string | null;
  actorUserId: number;
  createdAt: Date;
}) {
  let parsedMeta: unknown = null;
  if (e.meta) {
    try {
      parsedMeta = JSON.parse(e.meta);
    } catch {
      parsedMeta = null;
    }
  }
  return {
    id: e.id,
    cardId: e.cardId,
    kind: e.kind,
    meta: parsedMeta,
    actorUserId: e.actorUserId,
    createdAt: e.createdAt.toISOString(),
  };
}
