import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Github, RefreshCw, Plus } from 'lucide-react';
import { api } from '../../api/client';
import FilterBar, { EMPTY_FILTER, type FilterState } from './FilterBar';
import Column from './Column';
import { CardItemBody } from './CardItem';
import CardDetailPanel from './CardDetailPanel';
import type { BoardData, Card, LabelLite } from './types';
import { RunningTimerContext, type RunningTimer } from './runningTimerContext';

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function filterCards(cards: Card[], filter: FilterState): Card[] {
  const search = filter.search.trim().toLowerCase();
  return cards.filter((c) => {
    if (filter.priorities.length && !filter.priorities.includes(c.priority)) return false;
    if (filter.labels.length) {
      const has = c.labels.some((l) => filter.labels.includes(l.id));
      if (!has) return false;
    }
    if (search) {
      const hay = `${c.title}\n${c.description}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

// Pinned cards float to the top of each column; within-pinned use the
// existing card.order so the drag-drop UX inside the pinned cluster
// matches non-pinned cards.
function sortPinnedFirst(cards: Card[]): Card[] {
  const pinned = cards.filter((c) => !!c.pinnedAt).sort((a, b) => a.order - b.order);
  const rest = cards.filter((c) => !c.pinnedAt).sort((a, b) => a.order - b.order);
  return [...pinned, ...rest];
}

export default function BoardView({ boardId }: { boardId: number }) {
  const qc = useQueryClient();
  const board = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.get<BoardData>(`/api/boards/${boardId}`),
  });
  const labels = useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<LabelLite[]>('/api/labels'),
  });

  // Pulled once at board level so every CardItem can read it cheaply via
  // context. Tanstack polls every 30s and we also refetch on focus.
  const runningTimer = useQuery({
    queryKey: ['time-running'],
    queryFn: () => api.get<RunningTimer | null>('/api/time/running'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const syncMutation = useMutation({
    mutationFn: () => api.post(`/api/boards/${boardId}/github/sync`, {}),
    onSettled: () => qc.invalidateQueries({ queryKey: ['board', boardId] }),
  });
  const importMutation = useMutation({
    mutationFn: (url: string) =>
      api.post(`/api/boards/${boardId}/github/import-url`, { url }),
    onSuccess: () => {
      setImportOpen(false);
      setImportUrl('');
      setImportError(null);
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
    onError: (err: Error) => setImportError(err.message),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkMutation = useMutation({
    mutationFn: (repoUrl: string) =>
      api.post(`/api/boards/${boardId}/github/link`, { repoUrl }),
    onSuccess: () => {
      setLinkOpen(false);
      setLinkUrl('');
      setLinkError(null);
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
    onError: (err: Error) => setLinkError(err.message),
  });
  const unlinkMutation = useMutation({
    mutationFn: () => api.del(`/api/boards/${boardId}/github/link`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['board', boardId] }),
  });

  // Deep-link: ?card=<id> opens that card on board load.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const c = params.get('card');
    if (c) {
      const n = parseInt(c, 10);
      if (Number.isFinite(n)) setOpenCardId(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  function closeCardPanel() {
    setOpenCardId(null);
    // Strip ?card= from URL for clean back-button behavior
    const params = new URLSearchParams(location.search);
    if (params.has('card')) {
      params.delete('card');
      const qs = params.toString();
      navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const draggingCard = useMemo(() => {
    if (!draggingId || !board.data) return null;
    for (const col of board.data.columns) {
      const found = col.cards.find((c) => c.id === draggingId);
      if (found) return found;
    }
    return null;
  }, [draggingId, board.data]);

  function onDragStart(e: DragStartEvent) {
    const id = typeof e.active.id === 'number' ? e.active.id : parseInt(String(e.active.id), 10);
    if (Number.isFinite(id)) setDraggingId(id);
  }

  async function onDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    if (!e.over || !board.data) return;
    const cardId = Number(e.active.id);
    const overId = String(e.over.id);

    // Resolve destination column
    let targetColumnId: number | null = null;
    if (overId.startsWith('col-')) {
      targetColumnId = parseInt(overId.slice(4), 10);
    } else {
      // dropped on another card — find its column
      const overCardId = Number(overId);
      for (const col of board.data.columns) {
        if (col.cards.some((c) => c.id === overCardId)) {
          targetColumnId = col.id;
          break;
        }
      }
    }
    if (targetColumnId == null) return;

    // Compute new order: append to end of column for simplicity in v0.1.
    // (Within-column reorder still works correctly because dnd-kit's SortableContext
    // animates the move; persistence-side we set order = lastOrder + 1000.)
    const targetCol = board.data.columns.find((c) => c.id === targetColumnId);
    if (!targetCol) return;
    const lastOrder = targetCol.cards.length
      ? Math.max(...targetCol.cards.filter((c) => c.id !== cardId).map((c) => c.order))
      : 0;
    const toOrder = lastOrder + 1000;

    // Optimistic update
    qc.setQueryData<BoardData>(['board', boardId], (prev) => {
      if (!prev) return prev;
      let movingCard: Card | undefined;
      const nextCols = prev.columns.map((col) => {
        const filtered = col.cards.filter((c) => {
          if (c.id === cardId) {
            movingCard = c;
            return false;
          }
          return true;
        });
        return { ...col, cards: filtered };
      });
      if (movingCard) {
        const updated: Card = { ...movingCard, columnId: targetColumnId, order: toOrder };
        const out = nextCols.map((col) =>
          col.id === targetColumnId
            ? { ...col, cards: [...col.cards, updated].sort((a, b) => a.order - b.order) }
            : col,
        );
        return { ...prev, columns: out };
      }
      return prev;
    });

    try {
      await api.post(`/api/cards/${cardId}/move`, { toColumnId: targetColumnId, toOrder });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('move failed', err);
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    }
  }

  async function renameColumn(id: number, name: string) {
    qc.setQueryData<BoardData>(['board', boardId], (prev) =>
      prev ? { ...prev, columns: prev.columns.map((c) => (c.id === id ? { ...c, name } : c)) } : prev,
    );
    try {
      await api.patch(`/api/columns/${id}`, { name });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    }
  }

  async function setWipLimit(id: number, wipLimit: number | null) {
    qc.setQueryData<BoardData>(['board', boardId], (prev) =>
      prev
        ? { ...prev, columns: prev.columns.map((c) => (c.id === id ? { ...c, wipLimit } : c)) }
        : prev,
    );
    try {
      await api.patch(`/api/columns/${id}`, { wipLimit });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    }
  }

  if (board.isLoading) {
    return <div className="text-text-muted text-sm">Loading board…</div>;
  }
  if (board.error || !board.data) {
    return (
      <div className="text-error text-sm">
        Failed to load board: {String((board.error as Error)?.message || 'unknown')}
      </div>
    );
  }

  const gh = board.data.github;
  const githubColumnId = gh?.githubColumnId ?? null;
  const isLinked = !!gh?.owner && !!gh?.repo;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FilterBar
        value={filter}
        onChange={setFilter}
        availableLabels={labels.data || []}
      />
      {/* GitHub strip. */}
      {isLinked ? (
        <div className="flex items-center gap-2 text-xs px-2 py-1.5 border-b border-border-soft bg-surface-muted/40">
          <Github className="w-3.5 h-3.5 text-accent" />
          <a
            href={gh!.repoUrl || '#'}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-text-2 hover:text-accent"
          >
            {gh!.owner}/{gh!.repo}
          </a>
          <span className="text-text-muted">· synced {relativeTime(gh!.lastSyncAt)}</span>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface text-text-2 hover:text-text"
            title="Sync now"
          >
            <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing…' : 'Sync'}
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface text-text-2 hover:text-text"
            title="Add from a GitHub URL"
          >
            <Plus className="w-3 h-3" /> Add from URL
          </button>
          <button
            onClick={() => {
              if (confirm('Unlink this board from the GitHub repo? Cards stay; auto-sync stops.')) {
                unlinkMutation.mutate();
              }
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-error/10 text-text-muted hover:text-error"
            title="Unlink repo"
          >
            Unlink
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs px-2 py-1.5 border-b border-border-soft">
          <Github className="w-3.5 h-3.5 text-text-muted" />
          <button
            onClick={() => setLinkOpen(true)}
            className="text-text-2 hover:text-accent"
          >
            Link to a GitHub repo…
          </button>
        </div>
      )}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pt-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <RunningTimerContext.Provider value={runningTimer.data ?? null}>
            <div className="flex gap-3 sm:gap-4 h-full pb-4 px-1 sm:px-0 min-w-max">
              {board.data.columns.map((col) => {
                const visible = sortPinnedFirst(filterCards(col.cards, filter));
                return (
                  <Column
                    key={col.id}
                    column={col}
                    cards={visible}
                    totalCount={col.cards.length}
                    onCardClick={(id) => setOpenCardId(id)}
                    onAfterMutate={() => qc.invalidateQueries({ queryKey: ['board', boardId] })}
                    onRename={renameColumn}
                    onSetWipLimit={setWipLimit}
                    isGithubColumn={col.id === githubColumnId}
                  />
                );
              })}
            </div>
          </RunningTimerContext.Provider>
          <DragOverlay>
            {draggingCard ? (
              <RunningTimerContext.Provider value={runningTimer.data ?? null}>
                <CardItemBody card={draggingCard} dragging />
              </RunningTimerContext.Provider>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      {openCardId != null && (
        <CardDetailPanel cardId={openCardId} boardId={boardId} onClose={closeCardPanel} />
      )}
      {linkOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4"
          onClick={() => setLinkOpen(false)}
        >
          <div
            className="bg-surface rounded-md p-5 max-w-md w-full space-y-3 border border-border-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold flex items-center gap-2">
              <Github className="w-4 h-4 text-accent" /> Link board to a GitHub repo
            </h3>
            <p className="text-xs text-text-muted">
              Open PRs + issues get mirrored into a dedicated "GitHub" column.
              Auto-syncs every 15 min once linked. Requires a PAT in Settings.
            </p>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="input w-full font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && linkUrl.trim()) linkMutation.mutate(linkUrl.trim());
                if (e.key === 'Escape') setLinkOpen(false);
              }}
            />
            {linkError && <div className="text-xs text-error">{linkError}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setLinkOpen(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button
                onClick={() => linkUrl.trim() && linkMutation.mutate(linkUrl.trim())}
                disabled={linkMutation.isPending || !linkUrl.trim()}
                className="btn btn-primary btn-sm"
              >
                {linkMutation.isPending ? 'Linking…' : 'Link'}
              </button>
            </div>
          </div>
        </div>
      )}
      {importOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4"
          onClick={() => setImportOpen(false)}
        >
          <div
            className="bg-surface rounded-md p-5 max-w-md w-full space-y-3 border border-border-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold flex items-center gap-2">
              <Github className="w-4 h-4 text-accent" /> Add from GitHub
            </h3>
            <p className="text-xs text-text-muted">
              Paste a PR, issue, or commit URL. The card lands in the GitHub column.
            </p>
            <input
              autoFocus
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="input w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && importUrl.trim()) importMutation.mutate(importUrl.trim());
                if (e.key === 'Escape') setImportOpen(false);
              }}
            />
            {importError && <div className="text-xs text-error">{importError}</div>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setImportOpen(false)}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => importUrl.trim() && importMutation.mutate(importUrl.trim())}
                disabled={importMutation.isPending || !importUrl.trim()}
                className="btn btn-primary btn-sm"
              >
                {importMutation.isPending ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
