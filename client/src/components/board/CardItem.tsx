import { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Target, GitPullRequest, AlertCircle, GitCommit } from 'lucide-react';
import { labelColor } from './labelColor';
import type { Card } from './types';
import { useRunningTimer } from './runningTimerContext';

// Color tokens for the GitHub state pill — kept neutral so they read in both
// warm-cream light and cool-slate dark.
const GH_STATE_STYLE: Record<string, string> = {
  open: 'bg-success/10 text-success border-success/30',
  draft: 'bg-text-muted/15 text-text-2 border-text-muted/30',
  merged: 'bg-accent/15 text-accent border-accent/30',
  closed: 'bg-error/10 text-error border-error/30',
};

function GithubBadge({ card }: { card: Card }) {
  if (!card.githubKind) return null;
  const Icon =
    card.githubKind === 'pr'
      ? GitPullRequest
      : card.githubKind === 'issue'
      ? AlertCircle
      : GitCommit;
  const state = card.githubState || 'open';
  const tone = GH_STATE_STYLE[state] || GH_STATE_STYLE.open;
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium',
        tone,
      ].join(' ')}
      title={`${card.githubKind.toUpperCase()} · ${state}`}
    >
      <Icon className="w-3 h-3" />
      {card.githubNumber ? `#${card.githubNumber}` : state}
    </span>
  );
}

/**
 * Kanban card — framedeck idiom.
 *   - surface bg, soft border, 8-10 px padding
 *   - 4 px priority bar on the left (urgent=red, high=amber, medium=accent, low=muted)
 *   - pinned cards get a yellow ring + target glyph (top-right)
 *   - running timer shows a small pulsing red dot (top-right)
 *   - labels render as chip-style pills at the bottom
 *   - due date is right-aligned italic text, red if overdue
 *   - hover: subtle scale + accent border + shadow-md
 */
const PRIORITY_BAR: Record<string, string> = {
  low: 'bg-text-muted',
  medium: 'bg-accent',
  high: 'bg-warning',
  urgent: 'bg-error',
};

interface Props {
  card: Card;
  onClick: () => void;
  dragging?: boolean;
}

export default function SortableCardItem({ card, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardItemBody card={card} onClick={onClick} />
    </div>
  );
}

export function CardItemBody({
  card,
  onClick,
  dragging,
}: {
  card: Card;
  onClick?: () => void;
  dragging?: boolean;
}) {
  const hasLabels = card.labels && card.labels.length > 0;
  const due = card.dueDate ? new Date(card.dueDate) : null;
  const isOverdue =
    due != null &&
    due.getTime() < Date.now() &&
    due.toISOString().slice(0, 10) !== new Date().toISOString().slice(0, 10);
  const isPinned = !!card.pinnedAt;
  const running = useRunningTimer();
  const hasRunningTimer = running && running.cardId === card.id;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={[
        'group relative w-full text-left bg-surface rounded-md overflow-hidden',
        'cursor-grab active:cursor-grabbing transition min-h-11 border',
        isPinned
          ? 'border-warning ring-1 ring-warning/40'
          : 'border-border-soft hover:border-accent',
        'hover:shadow-md',
        dragging ? 'shadow-lg' : 'shadow-xs',
      ].join(' ')}
    >
      <div className="flex">
        <div className={`w-1 ${PRIORITY_BAR[card.priority] || 'bg-text-muted'}`} />
        <div className="flex-1 p-2.5 space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="text-sm font-medium leading-snug flex-1 min-w-0">{card.title}</div>
            {/* Top-right cluster: timer dot + pin glyph. Positioned absolutely so
                the title can flow under them without wrapping into the indicator
                area. */}
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              {hasRunningTimer && (
                <span
                  className="inline-block w-2 h-2 rounded-full bg-error animate-pulse"
                  aria-label="Timer running"
                  title="Timer running"
                />
              )}
              {isPinned && (
                <Target
                  className="w-3.5 h-3.5 text-warning"
                  aria-label="Pinned"
                />
              )}
            </div>
          </div>
          {(hasLabels || card.githubKind) && (
            <div className="flex flex-wrap gap-1">
              {card.githubKind && <GithubBadge card={card} />}
              {card.labels.slice(0, 4).map((l) => {
                const c = labelColor(l.name);
                return (
                  <span
                    key={l.id}
                    className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: c.bg, color: c.fg }}
                  >
                    {l.name}
                  </span>
                );
              })}
              {card.labels.length > 4 && (
                <span className="text-[10px] text-text-muted">
                  +{card.labels.length - 4}
                </span>
              )}
            </div>
          )}
          {due && (
            <div className="flex items-center justify-end gap-1 text-[11px] italic">
              <Calendar className={`w-3 h-3 ${isOverdue ? 'text-error' : 'text-text-muted'}`} />
              <span className={isOverdue ? 'text-error' : 'text-text-muted'}>
                {due.toISOString().slice(0, 10)}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
