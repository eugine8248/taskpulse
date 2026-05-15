import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { api } from '../../api/client';
import SortableCardItem from './CardItem';
import type { Card, Column as ColumnType } from './types';

interface Props {
  column: ColumnType;
  cards: Card[];          // already filtered
  totalCount: number;     // unfiltered count for WIP-limit calc
  onCardClick: (id: number) => void;
  onAfterMutate: () => void;
  onRename: (id: number, name: string) => void;
  onSetWipLimit: (id: number, limit: number | null) => void;
}

export default function Column({
  column,
  cards,
  totalCount,
  onCardClick,
  onAfterMutate,
  onRename,
  onSetWipLimit,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState(column.wipLimit?.toString() ?? '');

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `col-${column.id}`,
    data: { type: 'column', columnId: column.id },
  });

  const overLimit = column.wipLimit != null && totalCount > column.wipLimit;

  async function addCard() {
    const title = newTitle.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    try {
      await api.post('/api/cards', { columnId: column.id, title });
      setNewTitle('');
      setAdding(false);
      onAfterMutate();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('add card failed', e);
    }
  }

  async function commitName() {
    setEditingName(false);
    const name = nameDraft.trim();
    if (!name || name === column.name) return;
    onRename(column.id, name);
  }

  async function commitLimit() {
    setEditingLimit(false);
    const trimmed = limitDraft.trim();
    const parsed = trimmed === '' ? null : Math.max(1, parseInt(trimmed, 10));
    if (parsed === null) {
      onSetWipLimit(column.id, null);
    } else if (Number.isFinite(parsed)) {
      onSetWipLimit(column.id, parsed);
    }
  }

  return (
    <div className="w-[280px] sm:w-[300px] shrink-0 flex flex-col bg-elevated dark:bg-elevated-dark rounded-md border border-border dark:border-border-dark max-h-full">
      <div
        className={[
          'flex items-center justify-between gap-2 px-3 py-2 border-b border-border dark:border-border-dark',
          overLimit ? 'bg-warning/10 text-warning' : '',
        ].join(' ')}
      >
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setNameDraft(column.name);
                setEditingName(false);
              }
            }}
            className="bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-2 py-1 text-sm flex-1 min-h-11"
          />
        ) : (
          <button
            onDoubleClick={() => {
              setNameDraft(column.name);
              setEditingName(true);
            }}
            className="text-sm font-semibold flex-1 text-left min-h-11 flex items-center"
            title="Double-click to rename"
          >
            {column.name}
          </button>
        )}

        {editingLimit ? (
          <input
            autoFocus
            type="number"
            min={1}
            placeholder="—"
            value={limitDraft}
            onChange={(e) => setLimitDraft(e.target.value)}
            onBlur={commitLimit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLimit();
              if (e.key === 'Escape') {
                setLimitDraft(column.wipLimit?.toString() ?? '');
                setEditingLimit(false);
              }
            }}
            className="w-16 bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-2 py-1 text-xs min-h-11"
          />
        ) : (
          <button
            onClick={() => {
              setLimitDraft(column.wipLimit?.toString() ?? '');
              setEditingLimit(true);
            }}
            className="text-xs font-mono text-textMuted dark:text-textMuted-dark hover:text-text dark:hover:text-text-dark min-h-11 px-2"
            title="Click to set WIP limit"
          >
            {totalCount}
            {column.wipLimit != null ? `/${column.wipLimit}` : ''}
          </button>
        )}
      </div>

      <div
        ref={setDroppableRef}
        className={[
          'flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]',
          isOver ? 'bg-accent/5' : '',
        ].join(' ')}
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((c) => (
            <SortableCardItem key={c.id} card={c} onClick={() => onCardClick(c.id)} />
          ))}
        </SortableContext>
      </div>

      <div className="p-2 border-t border-border dark:border-border-dark">
        {adding ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addCard();
                }
                if (e.key === 'Escape') {
                  setNewTitle('');
                  setAdding(false);
                }
              }}
              rows={2}
              placeholder="Card title…"
              className="w-full bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded p-2 text-base sm:text-sm resize-none focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button
                onClick={addCard}
                className="bg-accent hover:bg-accentHover text-white text-xs px-3 py-1 rounded min-h-11"
              >
                Add card
              </button>
              <button
                onClick={() => {
                  setNewTitle('');
                  setAdding(false);
                }}
                className="text-xs text-textMuted dark:text-textMuted-dark px-3 py-1 min-h-11"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full text-xs text-textMuted dark:text-textMuted-dark hover:text-text dark:hover:text-text-dark flex items-center justify-center gap-1 min-h-11 rounded hover:bg-bg dark:hover:bg-bg-dark"
          >
            <Plus className="w-4 h-4" /> Add card
          </button>
        )}
      </div>
    </div>
  );
}
