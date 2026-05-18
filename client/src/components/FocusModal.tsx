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
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="fixed z-50 top-16 left-1/2 -translate-x-1/2 w-[90vw] max-w-xl surface shadow-lg"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
          <h2 className="font-semibold inline-flex items-center gap-2">
            <Target className="w-4 h-4 text-warning" /> Focus
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 max-h-[60vh] overflow-y-auto">
          {pinned.isLoading && <div className="text-sm text-text-muted">Loading…</div>}
          {pinned.error && (
            <div className="text-sm text-error">Failed: {(pinned.error as Error).message}</div>
          )}
          {pinned.data && pinned.data.length === 0 && (
            <div className="text-sm text-text-muted italic px-1 py-4 text-center">
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
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-muted transition"
                >
                  <div className="text-sm font-medium">{c.title}</div>
                  <div className="text-[11px] text-text-muted font-mono">
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
