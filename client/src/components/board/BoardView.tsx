import { useMemo, useState } from 'react';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import FilterBar, { EMPTY_FILTER, type FilterState } from './FilterBar';
import Column from './Column';
import { CardItemBody } from './CardItem';
import CardDetailPanel from './CardDetailPanel';
import type { BoardData, Card, LabelLite } from './types';

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

  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

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
    return (
      <div className="text-textMuted dark:text-textMuted-dark text-sm">Loading board…</div>
    );
  }
  if (board.error || !board.data) {
    return (
      <div className="text-danger text-sm">
        Failed to load board: {String((board.error as Error)?.message || 'unknown')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FilterBar
        value={filter}
        onChange={setFilter}
        availableLabels={labels.data || []}
      />
      <div className="flex-1 overflow-x-auto overflow-y-hidden pt-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-3 sm:gap-4 h-full pb-4 px-1 sm:px-0 min-w-max">
            {board.data.columns.map((col) => {
              const visible = filterCards(col.cards, filter);
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
                />
              );
            })}
          </div>
          <DragOverlay>
            {draggingCard ? <CardItemBody card={draggingCard} dragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>
      {openCardId != null && (
        <CardDetailPanel cardId={openCardId} boardId={boardId} onClose={() => setOpenCardId(null)} />
      )}
    </div>
  );
}
