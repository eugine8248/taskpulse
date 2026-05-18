import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, Target } from 'lucide-react';
import { api } from '../api/client';
import type { PinnedCard } from './board/types';

interface Props {
  onClose: () => void;
}

export default function FocusModal({ onClose }: Props) {
  const navigate = useNavigate();
  const pinned = useQuery({
    queryKey: ['pinned-cards'],
    queryFn: () => api.get<PinnedCard[]>('/api/cards/pinned'),
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        className="fixed z-50 top-16 left-1/2 -translate-x-1/2 w-[90vw] max-w-xl bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-lg shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border-dark">
          <h2 className="font-semibold inline-flex items-center gap-2">
            <Target className="w-4 h-4 text-warning" /> Focus
          </h2>
          <button
            onClick={onClose}
            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded hover:bg-elevated dark:hover:bg-elevated-dark"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 max-h-[60vh] overflow-y-auto">
          {pinned.isLoading && <div className="text-sm text-textMuted">Loading…</div>}
          {pinned.error && (
            <div className="text-sm text-danger">Failed: {(pinned.error as Error).message}</div>
          )}
          {pinned.data && pinned.data.length === 0 && (
            <div className="text-sm text-textFaint italic px-1 py-4 text-center">
              Nothing pinned. Open a card and click the pin to add it (max 3).
            </div>
          )}
          <ul className="space-y-1">
            {(pinned.data || []).map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/boards/${c.boardId}?card=${c.id}`);
                  }}
                  className="w-full text-left px-3 py-2 rounded hover:bg-elevated dark:hover:bg-elevated-dark"
                >
                  <div className="text-sm font-medium">{c.title}</div>
                  <div className="text-[11px] text-textMuted">
                    {c.boardName} · {c.columnName}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
