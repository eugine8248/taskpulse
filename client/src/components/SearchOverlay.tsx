import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Search } from 'lucide-react';
import { api } from '../api/client';

interface Props {
  onClose: () => void;
}

interface SearchHit {
  id: number;
  title: string;
  description: string;
  priority: string;
  columnId: number;
  columnName: string;
  boardId: number;
  boardName: string;
  rank: number;
  highlights: { title: string; description: string; comments: string };
}

export default function SearchOverlay({ onClose }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 200);
    return () => window.clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchHit[]>(`/api/search?q=${encodeURIComponent(debounced)}&limit=20`),
    enabled: !!debounced,
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="fixed z-50 top-16 left-1/2 -translate-x-1/2 w-[90vw] max-w-2xl surface shadow-lg"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-soft">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cards (Ctrl+K)…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
          />
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!debounced && (
            <div className="text-xs text-text-muted italic px-2 py-4 text-center">
              Start typing to search titles, descriptions, and comments
            </div>
          )}
          {debounced && results.isLoading && (
            <div className="text-xs text-text-muted px-2 py-2">Searching…</div>
          )}
          {debounced && results.data && results.data.length === 0 && (
            <div className="text-xs text-text-muted italic px-2 py-4 text-center">
              No matches for "{debounced}"
            </div>
          )}
          <ul className="space-y-1">
            {(results.data || []).map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/boards/${r.boardId}?card=${r.id}`);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-muted transition"
                >
                  <div
                    className="text-sm font-medium"
                    dangerouslySetInnerHTML={{
                      __html:
                        r.highlights.title && r.highlights.title.includes('<mark>')
                          ? r.highlights.title
                          : escapeHtml(r.title),
                    }}
                  />
                  <div className="text-[11px] text-text-muted font-mono">
                    {r.boardName} · {r.columnName}
                  </div>
                  {r.highlights.description && r.highlights.description.includes('<mark>') && (
                    <div
                      className="text-[11px] text-text-2 mt-0.5 truncate"
                      dangerouslySetInnerHTML={{ __html: r.highlights.description }}
                    />
                  )}
                  {r.highlights.comments && r.highlights.comments.includes('<mark>') && (
                    <div
                      className="text-[11px] text-text-muted mt-0.5 truncate"
                      dangerouslySetInnerHTML={{ __html: r.highlights.comments }}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
