import { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Target } from 'lucide-react';
import { labelColor } from './labelColor';
import type { Card } from './types';
import { useRunningTimer } from './runningTimerContext';

const PRIORITY_BAR: Record<string, string> = {
  low: 'bg-textMuted',
  medium: 'bg-accent',
  high: 'bg-warning',
  urgent: 'bg-danger',
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
        'w-full text-left bg-surface dark:bg-surface-dark border rounded-md overflow-hidden',
        'cursor-grab active:cursor-grabbing transition-colors min-h-11',
        isPinned
          ? 'border-warning ring-1 ring-warning/40 bg-warning/5 dark:bg-warning/10'
          : 'border-border dark:border-border-dark hover:border-accent',
        dragging ? 'shadow-lg' : 'shadow-sm',
      ].join(' ')}
    >
      <div className="flex">
        <div className={`w-1 ${PRIORITY_BAR[card.priority] || 'bg-textMuted'}`} />
        <div className="flex-1 p-3 space-y-2">
          <div className="flex items-start gap-2">
            {isPinned && (
              <Target className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" aria-label="Pinned" />
            )}
            {hasRunningTimer && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-danger animate-pulse mt-1.5 shrink-0"
                aria-label="Timer running"
              />
            )}
            <div className="text-sm font-medium leading-snug flex-1 min-w-0">{card.title}</div>
          </div>
          {hasLabels && (
            <div className="flex flex-wrap gap-1">
              {card.labels.slice(0, 4).map((l) => {
                const c = labelColor(l.name);
                return (
                  <span
                    key={l.id}
                    className="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: c.bg, color: c.fg }}
                  >
                    {l.name}
                  </span>
                );
              })}
              {card.labels.length > 4 && (
                <span className="text-[10px] text-textMuted dark:text-textMuted-dark">
                  +{card.labels.length - 4}
                </span>
              )}
            </div>
          )}
          {due && (
            <div className="flex items-center gap-1 text-[11px] text-textMuted dark:text-textMuted-dark">
              <Calendar className="w-3 h-3" />
              {due.toISOString().slice(0, 10)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
