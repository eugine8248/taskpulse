import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Trash2, Tag, Plus } from 'lucide-react';
import { api } from '../../api/client';
import { labelColor } from './labelColor';
import type { Card, LabelLite, Priority } from './types';

interface Props {
  cardId: number;
  onClose: () => void;
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

export default function CardDetailPanel({ cardId, onClose }: Props) {
  const qc = useQueryClient();

  // We pull the card from the cached board query rather than hitting the
  // server again. This keeps the panel synced with the kanban view.
  type BoardEnvelope = { columns: { cards: Card[] }[] };
  const board = qc.getQueryData<BoardEnvelope>(['board']);
  const card = board?.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);

  const labels = useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<LabelLite[]>('/api/labels'),
  });

  // Local draft mirrors server, debounced PATCH
  const [title, setTitle] = useState(card?.title ?? '');
  const [description, setDescription] = useState(card?.description ?? '');
  const [priority, setPriority] = useState<Priority>(card?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState<string>(
    card?.dueDate ? card.dueDate.slice(0, 10) : '',
  );
  const [newLabel, setNewLabel] = useState('');
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description);
      setPriority(card.priority);
      setDueDate(card.dueDate ? card.dueDate.slice(0, 10) : '');
    }
    // we intentionally don't list `card` as dep — only resync when id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  function schedulePatch(patch: Partial<Card>) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        await api.patch(`/api/cards/${cardId}`, patch);
        qc.invalidateQueries({ queryKey: ['board'] });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('card patch failed', e);
      }
    }, 600);
  }

  const deleteCard = useMutation({
    mutationFn: () => api.del(`/api/cards/${cardId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      onClose();
    },
  });

  async function attachLabel(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await api.post<{ id: number; name: string }>('/api/labels', {
        name: trimmed,
      });
      await api.post(`/api/cards/${cardId}/labels`, { labelId: created.id });
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['board'] });
      setNewLabel('');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('attach label failed', e);
    }
  }

  async function detachLabel(labelId: number) {
    try {
      await api.del(`/api/cards/${cardId}/labels/${labelId}`);
      qc.invalidateQueries({ queryKey: ['board'] });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('detach label failed', e);
    }
  }

  if (!card) {
    // Card was removed (e.g. via WS event from another tab) — close.
    return null;
  }

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* panel — slides from right on >=sm, bottom sheet on <sm */}
      <div
        className={[
          'fixed z-50 bg-surface dark:bg-surface-dark text-text dark:text-text-dark',
          'border-l border-border dark:border-border-dark',
          'flex flex-col overflow-hidden',
          // mobile bottom sheet
          'left-0 right-0 bottom-0 max-h-[85vh] rounded-t-xl anim-slide-bottom safe-pb',
          // desktop side panel
          'sm:top-0 sm:bottom-0 sm:right-0 sm:left-auto sm:w-[420px] sm:max-h-none sm:rounded-none sm:anim-slide-right',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border-dark">
          <h2 className="text-sm text-textMuted dark:text-textMuted-dark font-semibold">
            Card details
          </h2>
          <button
            onClick={onClose}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded hover:bg-elevated dark:hover:bg-elevated-dark"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs text-textMuted dark:text-textMuted-dark mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                schedulePatch({ title: e.target.value });
              }}
              className="w-full bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-3 py-2 text-base sm:text-sm font-medium focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-textMuted dark:text-textMuted-dark mb-1">
              Priority
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPriority(p);
                    schedulePatch({ priority: p });
                  }}
                  className={[
                    'min-h-11 px-3 rounded text-xs uppercase font-semibold tracking-wide',
                    priority === p
                      ? 'bg-accent text-white'
                      : 'bg-elevated dark:bg-elevated-dark text-textMuted dark:text-textMuted-dark',
                  ].join(' ')}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-textMuted dark:text-textMuted-dark mb-1">
              Due date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                schedulePatch({
                  // PATCH expects an ISO string or null
                  dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                } as Partial<Card>);
              }}
              className="bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-textMuted dark:text-textMuted-dark mb-1">
              Labels
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {card.labels.map((l) => {
                const c = labelColor(l.name);
                return (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase px-2 py-1 rounded"
                    style={{ backgroundColor: c.bg, color: c.fg }}
                  >
                    {l.name}
                    <button
                      onClick={() => detachLabel(l.id)}
                      className="hover:opacity-80"
                      aria-label={`Remove label ${l.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              <button
                onClick={() => setLabelsOpen((v) => !v)}
                className="text-xs text-textMuted dark:text-textMuted-dark hover:text-text dark:hover:text-text-dark inline-flex items-center gap-1 min-h-11 px-2"
              >
                <Tag className="w-4 h-4" /> Add label
              </button>
            </div>
            {labelsOpen && (
              <div className="space-y-2 bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded p-2">
                {(labels.data || [])
                  .filter((l) => !card.labels.some((cl) => cl.id === l.id))
                  .map((l) => (
                    <button
                      key={l.id}
                      onClick={async () => {
                        try {
                          await api.post(`/api/cards/${cardId}/labels`, { labelId: l.id });
                          qc.invalidateQueries({ queryKey: ['board'] });
                        } catch (e) {
                          // eslint-disable-next-line no-console
                          console.error(e);
                        }
                      }}
                      className="block w-full text-left text-xs min-h-11 px-2 hover:bg-elevated dark:hover:bg-elevated-dark rounded"
                    >
                      {l.name}
                    </button>
                  ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="new label…"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') attachLabel(newLabel);
                    }}
                    className="flex-1 bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded px-2 py-1 text-base sm:text-xs focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => attachLabel(newLabel)}
                    className="min-h-11 px-2 bg-accent text-white text-xs rounded hover:bg-accentHover inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> add
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-textMuted dark:text-textMuted-dark mb-1">
              Description (markdown OK)
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                schedulePatch({ description: e.target.value });
              }}
              rows={8}
              className="w-full bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded p-3 text-base sm:text-sm font-mono leading-relaxed focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="border-t border-border dark:border-border-dark p-4 flex items-center justify-between gap-2 safe-pb">
          {confirmDelete ? (
            <>
              <span className="text-xs text-textMuted dark:text-textMuted-dark">Delete this card?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-textMuted dark:text-textMuted-dark px-3 min-h-11"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteCard.mutate()}
                  disabled={deleteCard.isPending}
                  className="bg-danger text-white text-xs px-3 py-2 rounded disabled:opacity-50 min-h-11"
                >
                  {deleteCard.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-[11px] text-textFaint">
                Created {new Date(card.createdAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 text-danger hover:bg-danger/10 text-xs px-3 py-2 rounded min-h-11"
              >
                <Trash2 className="w-4 h-4" /> Delete card
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
