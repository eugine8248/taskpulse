import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Trash2, Tag, Plus, Target, Play, Square, Paperclip, MessageCircle, Activity,
} from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../store';
import { labelColor } from './labelColor';
import type {
  Card,
  LabelLite,
  Priority,
  CardComment,
  CardEventDTO,
  TimeEntryDTO,
  AttachmentDTO,
} from './types';

interface Props {
  cardId: number;
  boardId: number;
  onClose: () => void;
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CardDetailPanel({ cardId, boardId, onClose }: Props) {
  const qc = useQueryClient();

  // We pull the card from the cached board query rather than hitting the
  // server again. This keeps the panel synced with the kanban view.
  type BoardEnvelope = { columns: { cards: Card[] }[] };
  const board = qc.getQueryData<BoardEnvelope>(['board', boardId]);
  const card = board?.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);

  const labels = useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<LabelLite[]>('/api/labels'),
  });
  const comments = useQuery({
    queryKey: ['card', cardId, 'comments'],
    queryFn: () => api.get<CardComment[]>(`/api/cards/${cardId}/comments`),
  });
  const events = useQuery({
    queryKey: ['card', cardId, 'events'],
    queryFn: () => api.get<CardEventDTO[]>(`/api/cards/${cardId}/events`),
  });
  const timeEntries = useQuery({
    queryKey: ['card', cardId, 'time'],
    queryFn: () => api.get<TimeEntryDTO[]>(`/api/time/cards/${cardId}`),
  });
  const attachments = useQuery({
    queryKey: ['card', cardId, 'attachments'],
    queryFn: () => api.get<AttachmentDTO[]>(`/api/attachments/cards/${cardId}`),
  });
  const running = useQuery({
    queryKey: ['time-running'],
    queryFn: () => api.get<{ id: number; cardId: number; startedAt: string } | null>('/api/time/running'),
    refetchInterval: 30_000,
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
  const [newComment, setNewComment] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // 1Hz tick for the running timer display
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running.data || running.data.cardId !== cardId) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [running.data, cardId]);

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description);
      setPriority(card.priority);
      setDueDate(card.dueDate ? card.dueDate.slice(0, 10) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  function schedulePatch(patch: Partial<Card>) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        await api.patch(`/api/cards/${cardId}`, patch);
        qc.invalidateQueries({ queryKey: ['board'] });
        qc.invalidateQueries({ queryKey: ['card', cardId, 'events'] });
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

  const togglePin = useMutation({
    mutationFn: async () => {
      if (!card) return;
      if (card.pinnedAt) {
        await api.post(`/api/cards/${cardId}/unpin`);
      } else {
        // Raw fetch so we can read the 409 body shape.
        const token = useStore.getState().token;
        const res = await fetch(`/api/cards/${cardId}/pin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.status === 409) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.error === 'pin_cap_reached'
              ? `Pin cap reached (max ${body.cap}). Unpin a card first.`
              : 'Pin cap reached.',
          );
        }
        if (!res.ok) {
          throw new Error(`Pin failed (${res.status})`);
        }
      }
    },
    onSuccess: () => {
      setPinError(null);
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['pinned-cards'] });
      qc.invalidateQueries({ queryKey: ['card', cardId, 'events'] });
    },
    onError: (err: Error) => {
      setPinError(err.message);
      window.setTimeout(() => setPinError(null), 4000);
    },
  });

  const startTimer = useMutation({
    mutationFn: () => api.post(`/api/time/cards/${cardId}/start`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card', cardId, 'time'] });
      qc.invalidateQueries({ queryKey: ['time-running'] });
      qc.invalidateQueries({ queryKey: ['card', cardId, 'events'] });
    },
  });
  const stopTimer = useMutation({
    mutationFn: () => api.post(`/api/time/cards/${cardId}/stop`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card', cardId, 'time'] });
      qc.invalidateQueries({ queryKey: ['time-running'] });
      qc.invalidateQueries({ queryKey: ['card', cardId, 'events'] });
    },
  });

  const submitComment = useMutation({
    mutationFn: () => api.post<CardComment>(`/api/cards/${cardId}/comments`, { body: newComment }),
    onSuccess: () => {
      setNewComment('');
      qc.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      qc.invalidateQueries({ queryKey: ['card', cardId, 'events'] });
    },
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    const token = useStore.getState().token;
    const res = await fetch(`/api/attachments/cards/${cardId}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      // eslint-disable-next-line no-console
      console.error('upload failed', body);
      return;
    }
    qc.invalidateQueries({ queryKey: ['card', cardId, 'attachments'] });
    qc.invalidateQueries({ queryKey: ['card', cardId, 'events'] });
  }

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

  const isPinned = !!card?.pinnedAt;
  const isTimerRunning = running.data?.cardId === cardId;
  const runningElapsed = useMemo(() => {
    if (!running.data || running.data.cardId !== cardId) return 0;
    return Date.now() - new Date(running.data.startedAt).getTime();
  }, [running.data, cardId]);

  if (!card) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={[
          'fixed z-50 bg-surface dark:bg-surface-dark text-text dark:text-text-dark',
          'border-l border-border dark:border-border-dark',
          'flex flex-col overflow-hidden',
          'left-0 right-0 bottom-0 max-h-[85vh] rounded-t-xl anim-slide-bottom safe-pb',
          'sm:top-0 sm:bottom-0 sm:right-0 sm:left-auto sm:w-[480px] sm:max-h-none sm:rounded-none sm:anim-slide-right',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <h2 className="text-sm text-textMuted dark:text-textMuted-dark font-semibold">
              Card details
            </h2>
            <button
              onClick={() => togglePin.mutate()}
              disabled={togglePin.isPending}
              className={[
                'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors',
                isPinned
                  ? 'bg-warning text-bg dark:text-bg-dark hover:bg-warning/80'
                  : 'bg-elevated dark:bg-elevated-dark text-textMuted dark:text-textMuted-dark hover:bg-warning hover:text-bg dark:hover:text-bg-dark',
              ].join(' ')}
              title={isPinned ? 'Unpin from Focus list' : 'Pin to Focus list'}
            >
              <Target className="w-3.5 h-3.5" />
              {isPinned ? 'Pinned' : 'Pin'}
            </button>
          </div>
          <button
            onClick={onClose}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded hover:bg-elevated dark:hover:bg-elevated-dark"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {pinError && (
          <div className="px-4 py-2 bg-warning/10 border-b border-warning/30 text-xs text-warning">
            {pinError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
              rows={6}
              className="w-full bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded p-3 text-base sm:text-sm font-mono leading-relaxed focus:outline-none focus:border-accent"
            />
          </div>

          {/* ---------- Time tracking ---------- */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs text-textMuted dark:text-textMuted-dark font-semibold uppercase tracking-wide">
                Time
              </h3>
              <button
                onClick={() => (isTimerRunning ? stopTimer.mutate() : startTimer.mutate())}
                className={[
                  'inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold',
                  isTimerRunning
                    ? 'bg-danger text-white'
                    : 'bg-accent text-white hover:bg-accentHover',
                ].join(' ')}
              >
                {isTimerRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isTimerRunning ? `Stop · ${formatMs(runningElapsed)}` : 'Start'}
              </button>
            </div>
            <div className="space-y-1 text-xs">
              {(timeEntries.data || []).slice(0, 8).map((te) => (
                <div key={te.id} className="flex justify-between text-textMuted dark:text-textMuted-dark">
                  <span>{new Date(te.startedAt).toLocaleString()}</span>
                  <span className="font-mono">
                    {te.durationMs ? formatMs(te.durationMs) : 'running…'}
                  </span>
                </div>
              ))}
              {!(timeEntries.data || []).length && (
                <div className="text-textFaint italic">No sessions yet</div>
              )}
            </div>
          </section>

          {/* ---------- Attachments ---------- */}
          <section>
            <h3 className="text-xs text-textMuted dark:text-textMuted-dark font-semibold uppercase tracking-wide mb-2">
              Attachments
            </h3>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border dark:border-border-dark rounded p-3 text-center text-xs text-textMuted dark:text-textMuted-dark cursor-pointer hover:border-accent"
            >
              <Paperclip className="w-4 h-4 inline-block mr-1" />
              Drop files here or click to upload (25 MB / file, 100 MB total)
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
            <div className="mt-2 space-y-2">
              {(attachments.data || []).map((a) => {
                const isImg = a.mimeType.startsWith('image/');
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 text-xs bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-2 py-1"
                  >
                    {isImg && (
                      <img
                        src={a.fileUrl}
                        alt={a.originalName}
                        className="w-10 h-10 object-cover rounded"
                      />
                    )}
                    <a
                      href={a.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 truncate text-accent hover:underline"
                    >
                      {a.originalName}
                    </a>
                    <span className="text-textFaint">{formatBytes(a.byteSize)}</span>
                    <button
                      onClick={async () => {
                        await api.del(`/api/attachments/${a.id}`);
                        qc.invalidateQueries({ queryKey: ['card', cardId, 'attachments'] });
                      }}
                      className="text-danger hover:opacity-80"
                      aria-label="Delete attachment"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------- Comments ---------- */}
          <section>
            <h3 className="text-xs text-textMuted dark:text-textMuted-dark font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" /> Comments
            </h3>
            <div className="space-y-2 mb-2">
              {(comments.data || []).map((c) => (
                <div
                  key={c.id}
                  className="bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded p-2"
                >
                  <div className="text-[10px] text-textFaint mb-1">
                    {new Date(c.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs whitespace-pre-wrap">{c.body}</div>
                </div>
              ))}
              {!(comments.data || []).length && (
                <div className="text-xs text-textFaint italic">No comments yet</div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newComment.trim()) submitComment.mutate();
                }}
                placeholder="Add a comment…"
                className="flex-1 bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => submitComment.mutate()}
                disabled={!newComment.trim() || submitComment.isPending}
                className="px-3 py-1.5 bg-accent text-white text-xs rounded hover:bg-accentHover disabled:opacity-50"
              >
                Post
              </button>
            </div>
          </section>

          {/* ---------- Activity ---------- */}
          <section>
            <h3 className="text-xs text-textMuted dark:text-textMuted-dark font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Activity
            </h3>
            <div className="space-y-1.5">
              {(events.data || []).map((ev) => (
                <div key={ev.id} className="text-[11px] flex justify-between gap-2">
                  <span className="text-text dark:text-text-dark">
                    <span className="font-mono text-accent">{ev.kind}</span>
                    {renderEventMeta(ev)}
                  </span>
                  <span className="text-textFaint shrink-0">
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
              {!(events.data || []).length && (
                <div className="text-xs text-textFaint italic">No activity yet</div>
              )}
            </div>
          </section>
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

function renderEventMeta(ev: CardEventDTO): string {
  const m = ev.meta as Record<string, unknown> | null;
  if (!m) return '';
  switch (ev.kind) {
    case 'moved':
      return ` ${m.fromName ?? '?'} → ${m.toName ?? '?'}`;
    case 'priority_changed':
      return ` ${m.from ?? '?'} → ${m.to ?? '?'}`;
    case 'time_logged':
      return typeof m.durationMs === 'number' ? ` ${formatMs(m.durationMs)}` : '';
    case 'attached':
      return m.originalName ? ` ${m.originalName}` : '';
    case 'tagged':
      return m.added ? ` +${m.added}` : m.removed ? ` -${m.removed}` : '';
    case 'commented':
      return m.preview ? `: ${m.preview}` : '';
    default:
      return '';
  }
}
