import { useState } from 'react';
import { Plus, Github } from 'lucide-react';
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
  /** v2.5: when this column is the GitHub-mirror column. */
  isGithubColumn?: boolean;
}

export default function Column({
  column,
  cards,
  totalCount,
  onCardClick,
  onAfterMutate,
  onRename,
  onSetWipLimit,
  isGithubColumn,
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
    <div
      className={[
        'w-[280px] sm:w-[300px] shrink-0 flex flex-col rounded-md border max-h-full',
        isGithubColumn
          ? 'bg-surface-muted border-accent/30'
          : 'bg-surface-muted border-border-soft',
      ].join(' ')}
    >
      <div
        className={[
          'flex items-center justify-between gap-2 px-3 py-2 border-b border-border-soft rounded-t-md',
          overLimit ? 'bg-warning/15 text-warning' : '',
        ].join(' ')}
      >
        {isGithubColumn && (
          <Github className="w-4 h-4 text-accent shrink-0" aria-label="GitHub-synced column" />
        )}
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
            className="input flex-1"
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
            className="input w-16 text-xs"
          />
        ) : (
          <button
            onClick={() => {
              setLimitDraft(column.wipLimit?.toString() ?? '');
              setEditingLimit(true);
            }}
            className="text-xs font-mono text-text-muted hover:text-text min-h-11 px-2"
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
          isOver ? 'bg-accent-soft' : '',
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

      <div className="p-2 border-t border-border-soft">
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
              className="textarea text-sm min-h-[60px]"
            />
            <div className="flex gap-2">
              <button onClick={addCard} className="btn btn-primary btn-sm">
                Add card
              </button>
              <button
                onClick={() => {
                  setNewTitle('');
                  setAdding(false);
                }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full text-xs text-text-muted hover:text-text flex items-center justify-center gap-1 min-h-11 rounded-md hover:bg-surface transition-colors"
          >
            <Plus className="w-4 h-4" /> Add card
          </button>
        )}
      </div>
    </div>
  );
}
