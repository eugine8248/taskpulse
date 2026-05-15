import { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar } from 'lucide-react';
import { labelColor } from './labelColor';
import type { Card } from './types';

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
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={[
        'w-full text-left bg-surface dark:bg-surface-dark border border-border dark:border-border-dark',
        'rounded-md overflow-hidden cursor-grab active:cursor-grabbing',
        'hover:border-accent transition-colors',
        'min-h-11',
        dragging ? 'shadow-lg' : 'shadow-sm',
      ].join(' ')}
    >
      <div className="flex">
        <div className={`w-1 ${PRIORITY_BAR[card.priority] || 'bg-textMuted'}`} />
        <div className="flex-1 p-3 space-y-2">
          <div className="text-sm font-medium leading-snug">{card.title}</div>
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
