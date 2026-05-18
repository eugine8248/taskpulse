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
import { Github, Plus } from 'lucide-react';
import { api } from '../../api/client';
import FilterBar, { EMPTY_FILTER, type FilterState } from './FilterBar';
import Column from './Column';
import { CardItemBody } from './CardItem';
import CardDetailPanel from './CardDetailPanel';
import type { BoardData, Card, LabelLite } from './types';
import { RunningTimerContext, type RunningTimer } from './runningTimerContext';


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

  // v2.6 cleanup: board↔repo binding + sync removed. The paste-URL importer
  // remains — the only mutation needed for GitHub now.
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

  // After v2.6 cleanup: no persistent binding. The "GitHub" column is
  // identified by case-insensitive name match (auto-created when the
  // paste-URL flow imports anything).
  const githubColumnId =
    board.data.columns.find((c) => c.name.trim().toLowerCase() === 'github')?.id ?? null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FilterBar
        value={filter}
        onChange={setFilter}
        availableLabels={labels.data || []}
      />
      {/* GitHub paste-URL action — single button, no persistent binding. */}
      <div className="flex items-center gap-2 text-xs px-2 py-1.5 border-b border-border-soft">
        <Github className="w-3.5 h-3.5 text-text-muted" />
        <button
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1 text-text-2 hover:text-accent"
          title="Paste a GitHub PR / issue / commit / repo URL"
        >
          <Plus className="w-3 h-3" /> Add from GitHub URL
        </button>
      </div>
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
