import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Trash2, Tag, Plus, Target, Play, Square, Paperclip, MessageCircle, Activity,
  Github, GitPullRequest, AlertCircle, GitCommit, ExternalLink, RefreshCw, Network,
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

// v2.6 — lazy-load the callgraph panel so the engine + grammars don't ship
// in the initial bundle.
const CardCallgraphPanel = lazy(() => import('./CardCallgraphPanel'));

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
  type BoardEnvelope = { columns: { id: number; name: string; cards: Card[] }[] };
  const board = qc.getQueryData<BoardEnvelope>(['board', boardId]);
  const card = board?.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
  const columns = board?.columns ?? [];

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
  const [callgraphOpen, setCallgraphOpen] = useState(false);
  const refreshGithub = useMutation({
    mutationFn: () => api.post(`/api/github/cards/${cardId}/refresh`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['board', boardId] }),
  });

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
          'fixed z-50 bg-surface text-text',
          'border-l border-border-soft',
          'flex flex-col overflow-hidden',
          'left-0 right-0 bottom-0 max-h-[85vh] rounded-t-xl anim-slide-bottom safe-pb',
          'sm:top-0 sm:bottom-0 sm:right-0 sm:left-auto sm:w-[480px] sm:max-h-none sm:rounded-none sm:anim-slide-right',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-text-muted uppercase tracking-wide">
              Card · {String(card.id)}
            </span>
            <button
              onClick={() => togglePin.mutate()}
              disabled={togglePin.isPending}
              className={[
                'inline-flex items-center gap-1 px-2 h-7 rounded-full text-[11px] font-semibold transition',
                isPinned
                  ? 'bg-warning text-bg hover:brightness-95'
                  : 'bg-surface-muted text-text-2 hover:bg-warning hover:text-bg',
              ].join(' ')}
              title={isPinned ? 'Unpin from Focus list' : 'Pin to Focus list'}
            >
              <Target className="w-3.5 h-3.5" />
              {isPinned ? 'Pinned' : 'Pin'}
            </button>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {pinError && (
          <div className="px-4 py-2 bg-warning/10 border-b border-warning/30 text-xs text-warning">
            {pinError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {card.githubKind && (
            <GithubCardSection
              card={card}
              onRefresh={() => refreshGithub.mutate()}
              refreshing={refreshGithub.isPending}
              onShowCallgraph={() => setCallgraphOpen(true)}
            />
          )}
          <div>
            <label className="label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                schedulePatch({ title: e.target.value });
              }}
              className="input"
            />
          </div>

          {/* Column picker — keyboard + mobile-friendly alternative to
              cross-column drag-and-drop. Especially useful on mobile where
              only one column is visible at a time. */}
          {card && columns.length > 1 && (
            <div>
              <label className="label">Column</label>
              <select
                className="input"
                value={card.columnId}
                onChange={async (e) => {
                  const toColumnId = parseInt(e.target.value, 10);
                  if (!Number.isFinite(toColumnId) || toColumnId === card.columnId) return;
                  const targetCol = columns.find((c) => c.id === toColumnId);
                  const lastOrder = targetCol?.cards.length
                    ? Math.max(...targetCol.cards.map((c) => c.order))
                    : 0;
                  const toOrder = lastOrder + 1000;
                  try {
                    await api.post(`/api/cards/${cardId}/move`, { toColumnId, toOrder });
                    qc.invalidateQueries({ queryKey: ['board', boardId] });
                    qc.invalidateQueries({ queryKey: ['card', cardId, 'events'] });
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('column move failed', err);
                  }
                }}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Priority</label>
            <div className="flex gap-1.5 flex-wrap">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPriority(p);
                    schedulePatch({ priority: p });
                  }}
                  className={`rounded-full ${priority === p ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`}
                >
                  <span className={`pill pill-priority-${p} capitalize`}>{p}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                schedulePatch({
                  dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                } as Partial<Card>);
              }}
              className="input"
            />
          </div>

          <div>
            <label className="label">Labels</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {card.labels.map((l) => {
                const c = labelColor(l.name);
                return (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 h-6 rounded-full"
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
                className="btn btn-ghost btn-sm"
              >
                <Tag className="w-3.5 h-3.5" /> Add label
              </button>
            </div>
            {labelsOpen && (
              <div className="surface-muted p-2 space-y-1.5">
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
                      className="block w-full text-left text-xs min-h-9 px-2 hover:bg-surface rounded transition"
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
                    className="input flex-1 h-8 text-xs"
                  />
                  <button onClick={() => attachLabel(newLabel)} className="btn btn-primary btn-sm">
                    <Plus className="w-3 h-3" /> add
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label">Description (markdown OK)</label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                schedulePatch({ description: e.target.value });
              }}
              rows={6}
              className="textarea font-mono text-sm leading-relaxed"
            />
          </div>

          {/* ---------- Time tracking ---------- */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="label-inline uppercase tracking-wide">Time</h3>
              <button
                onClick={() => (isTimerRunning ? stopTimer.mutate() : startTimer.mutate())}
                className={`btn btn-sm ${isTimerRunning ? 'btn-danger' : 'btn-primary'}`}
              >
                {isTimerRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isTimerRunning ? `Stop · ${formatMs(runningElapsed)}` : 'Start'}
              </button>
            </div>
            <div className="space-y-1 text-xs">
              {(timeEntries.data || []).slice(0, 8).map((te) => (
                <div key={te.id} className="flex justify-between text-text-2">
                  <span>{new Date(te.startedAt).toLocaleString()}</span>
                  <span className="font-mono">
                    {te.durationMs ? formatMs(te.durationMs) : 'running…'}
                  </span>
                </div>
              ))}
              {!(timeEntries.data || []).length && (
                <div className="text-text-muted italic">No sessions yet</div>
              )}
            </div>
          </section>

          {/* ---------- Attachments ---------- */}
          <section>
            <h3 className="label-inline uppercase tracking-wide mb-2">Attachments</h3>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border-soft rounded-md p-3 text-center text-xs text-text-muted cursor-pointer hover:border-accent transition"
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
            <div className="mt-2 space-y-1.5">
              {(attachments.data || []).map((a) => {
                const isImg = a.mimeType.startsWith('image/');
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 text-xs surface px-2 py-1.5"
                  >
                    {isImg && (
                      <img
                        src={a.fileUrl}
                        alt={a.originalName}
                        className="w-10 h-10 object-cover rounded-sm"
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
                    <span className="text-text-muted font-mono">{formatBytes(a.byteSize)}</span>
                    <button
                      onClick={async () => {
                        await api.del(`/api/attachments/${a.id}`);
                        qc.invalidateQueries({ queryKey: ['card', cardId, 'attachments'] });
                      }}
                      className="text-error hover:opacity-80"
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
            <h3 className="label-inline uppercase tracking-wide mb-2 flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" /> Comments
            </h3>
            <div className="space-y-2 mb-2">
              {(comments.data || []).map((c) => (
                <div key={c.id} className="surface-muted p-2.5">
                  <div className="text-[10px] text-text-muted mb-1 font-mono">
                    {new Date(c.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs whitespace-pre-wrap leading-relaxed">{c.body}</div>
                </div>
              ))}
              {!(comments.data || []).length && (
                <div className="text-xs text-text-muted italic">No comments yet</div>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newComment.trim()) submitComment.mutate();
                }}
                placeholder="Add a comment…"
                className="input pr-16"
              />
              <button
                onClick={() => submitComment.mutate()}
                disabled={!newComment.trim() || submitComment.isPending}
                className="absolute right-1 top-1 btn btn-primary btn-sm"
              >
                Post
              </button>
            </div>
          </section>

          {/* ---------- Activity ---------- */}
          <section>
            <h3 className="label-inline uppercase tracking-wide mb-2 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Activity
            </h3>
            <div className="space-y-1.5">
              {(events.data || []).map((ev) => (
                <div key={ev.id} className="text-[11px] flex justify-between gap-2">
                  <span className="text-text-2">
                    <span className="font-mono text-accent">{ev.kind}</span>
                    {renderEventMeta(ev)}
                  </span>
                  <span className="text-text-muted shrink-0 font-mono">
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
              {!(events.data || []).length && (
                <div className="text-xs text-text-muted italic">No activity yet</div>
              )}
            </div>
          </section>
        </div>

        <div className="border-t border-border-soft p-3 flex items-center justify-between gap-2 safe-pb">
          {confirmDelete ? (
            <>
              <span className="text-xs text-text-2">Delete this card?</span>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="btn btn-ghost btn-sm">
                  Cancel
                </button>
                <button
                  onClick={() => deleteCard.mutate()}
                  disabled={deleteCard.isPending}
                  className="btn btn-danger btn-sm"
                >
                  {deleteCard.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-[11px] text-text-muted font-mono">
                Created {new Date(card.createdAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn btn-ghost btn-sm text-error hover:bg-error/10"
              >
                <Trash2 className="w-4 h-4" /> Delete card
              </button>
            </>
          )}
        </div>
      </div>
      {callgraphOpen && card.githubKind === 'pr' && card.githubUrl && (
        <Suspense fallback={<CallgraphLoader />}>
          <CardCallgraphPanel
            cardId={card.id}
            githubUrl={card.githubUrl}
            onClose={() => setCallgraphOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}

function CallgraphLoader() {
  return (
    <div className="fixed inset-0 z-[60] bg-bg/95 flex items-center justify-center">
      <div className="text-sm text-text-2">Preparing graph…</div>
    </div>
  );
}

function GithubCardSection({
  card,
  onRefresh,
  refreshing,
  onShowCallgraph,
}: {
  card: Card;
  onRefresh: () => void;
  refreshing: boolean;
  onShowCallgraph: () => void;
}) {
  let meta: Record<string, unknown> = {};
  if (card.githubMetadata) {
    try {
      meta = JSON.parse(card.githubMetadata);
    } catch {
      // tolerate stale rows
    }
  }
  const Icon =
    card.githubKind === 'pr'
      ? GitPullRequest
      : card.githubKind === 'issue'
      ? AlertCircle
      : GitCommit;
  const state = card.githubState || 'open';
  const stateBadge =
    state === 'merged'
      ? 'bg-accent/15 text-accent border-accent/30'
      : state === 'closed'
      ? 'bg-error/10 text-error border-error/30'
      : state === 'draft'
      ? 'bg-text-muted/15 text-text-2 border-text-muted/30'
      : 'bg-success/10 text-success border-success/30';
  return (
    <section className="surface-muted p-3 rounded-md border border-accent/20 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-accent" />
        <span className="font-semibold text-sm capitalize">{card.githubKind}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-medium uppercase ${stateBadge}`}
        >
          {state}
        </span>
        {card.githubUrl && (
          <a
            href={card.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Open on GitHub <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      {card.githubKind === 'pr' && (
        <>
          <div className="text-xs text-text-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {meta.author != null && meta.author !== '' ? (
              <div>
                Author: <span className="font-mono text-text">{String(meta.author)}</span>
              </div>
            ) : null}
            {(meta.base != null || meta.head != null) ? (
              <div>
                <span className="font-mono">{String(meta.base ?? '?')}</span> ←{' '}
                <span className="font-mono">{String(meta.head ?? '?')}</span>
              </div>
            ) : null}
            {typeof meta.additions === 'number' && (
              <div>
                <span className="text-success">+{Number(meta.additions)}</span>{' '}
                <span className="text-error">-{Number(meta.deletions ?? 0)}</span>
              </div>
            )}
            {typeof meta.changed_files === 'number' && (
              <div>Files: {Number(meta.changed_files)}</div>
            )}
            {meta.mergeable != null && (
              <div>
                Mergeable: <span className="font-mono">{String(meta.mergeable)}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onShowCallgraph}
              className="btn btn-secondary btn-sm"
              title="Open inline callgraph (lazy-loaded)"
            >
              <Network className="w-3.5 h-3.5" /> Show callgraph
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="btn btn-ghost btn-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{' '}
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </>
      )}
      {card.githubKind === 'issue' && (
        <>
          <div className="text-xs text-text-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {meta.author != null && meta.author !== '' ? (
              <div>
                Author: <span className="font-mono text-text">{String(meta.author)}</span>
              </div>
            ) : null}
            {Array.isArray(meta.assignees) && meta.assignees.length > 0 && (
              <div>Assignees: {(meta.assignees as string[]).join(', ')}</div>
            )}
          </div>
          {Array.isArray(meta.labels) && meta.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(meta.labels as string[]).map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface text-text-2"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="btn btn-ghost btn-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{' '}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </>
      )}
      {card.githubKind === 'commit' && (
        <>
          <div className="text-xs text-text-2 space-y-1">
            <div>
              SHA: <span className="font-mono text-text">{card.githubSha?.slice(0, 12)}</span>
            </div>
            {meta.author != null && meta.author !== '' ? (
              <div>
                Author: <span className="font-mono text-text">{String(meta.author)}</span>
              </div>
            ) : null}
            {meta.date != null && meta.date !== '' ? (
              <div className="text-text-muted">{new Date(String(meta.date)).toLocaleString()}</div>
            ) : null}
          </div>
        </>
      )}
    </section>
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
    case 'github_pr_imported':
    case 'github_pr_merged':
    case 'github_pr_closed':
    case 'github_issue_imported':
    case 'github_issue_closed':
      return m.number ? ` #${m.number}` : '';
    default:
      return '';
  }
}
