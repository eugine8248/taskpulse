import { Search, X } from 'lucide-react';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

export interface FilterState {
  search: string;
  priorities: Priority[];
  labels: number[]; // label ids
}

export const EMPTY_FILTER: FilterState = { search: '', priorities: [], labels: [] };

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
  availableLabels: { id: number; name: string }[];
}

const PRIORITY_CLASS: Record<Priority, string> = {
  low:    'border-border text-text-2',
  medium: 'border-accent text-accent',
  high:   'border-warning text-warning',
  urgent: 'border-error text-error',
};

export default function FilterBar({ value, onChange, availableLabels }: Props) {
  const togglePriority = (p: Priority) => {
    const next = value.priorities.includes(p)
      ? value.priorities.filter((x) => x !== p)
      : [...value.priorities, p];
    onChange({ ...value, priorities: next });
  };

  const toggleLabel = (id: number) => {
    const next = value.labels.includes(id)
      ? value.labels.filter((x) => x !== id)
      : [...value.labels, id];
    onChange({ ...value, labels: next });
  };

  const isActive =
    value.search.length > 0 || value.priorities.length > 0 || value.labels.length > 0;

  return (
    <div className="sticky top-14 z-30 bg-bg border-b border-border-soft py-3">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            placeholder="Search cards…"
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            className="input pl-9 min-h-11 text-base sm:text-sm"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
          {PRIORITIES.map((p) => {
            const active = value.priorities.includes(p);
            return (
              <button
                key={p}
                onClick={() => togglePriority(p)}
                className={[
                  'shrink-0 min-h-11 px-3 rounded-full border text-xs font-semibold uppercase tracking-wide transition',
                  active
                    ? `${PRIORITY_CLASS[p]} bg-surface-muted`
                    : 'border-border-soft text-text-muted hover:border-border hover:text-text-2',
                ].join(' ')}
              >
                {p}
              </button>
            );
          })}
        </div>

        {availableLabels.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            {availableLabels.map((l) => {
              const active = value.labels.includes(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => toggleLabel(l.id)}
                  className={[
                    'shrink-0 min-h-11 px-3 rounded-full border text-xs transition',
                    active
                      ? 'border-accent text-accent bg-accent-soft'
                      : 'border-border-soft text-text-muted hover:border-border hover:text-text-2',
                  ].join(' ')}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        )}

        {isActive && (
          <button
            onClick={() => onChange(EMPTY_FILTER)}
            className="btn btn-ghost btn-sm"
            title="Clear filters"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
