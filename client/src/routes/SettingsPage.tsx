import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../store';
import { useAuth } from '../hooks/useAuth';
import type { BoardData } from '../components/board/types';

const DEFAULT_WIP_KEYS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];

export default function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const { logout, token } = useAuth();

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/api/settings'),
  });
  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api.get<BoardData>('/api/boards'),
  });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ id: number; email: string; name: string | null }>('/api/auth/me'),
    retry: false,
    enabled: !!token,
  });

  const [boardName, setBoardName] = useState('');
  const [wipDraft, setWipDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (board.data) {
      setBoardName(board.data.board.name);
      const next: Record<string, string> = {};
      for (const col of board.data.columns) {
        next[col.name] = col.wipLimit == null ? '' : String(col.wipLimit);
      }
      setWipDraft(next);
    }
  }, [board.data]);

  const saveBoardName = useMutation({
    mutationFn: async () => {
      if (!board.data) return;
      await api.patch(`/api/boards/${board.data.board.id}`, { name: boardName });
      await api.put('/api/settings', { default_board_name: boardName });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const saveWips = useMutation({
    mutationFn: async () => {
      if (!board.data) return;
      for (const col of board.data.columns) {
        const raw = wipDraft[col.name];
        const next = raw == null || raw.trim() === '' ? null : parseInt(raw, 10);
        if (next != null && !Number.isFinite(next)) continue;
        await api.patch(`/api/columns/${col.id}`, { wipLimit: next });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-text-2 mt-1">Your account, board defaults, and appearance.</p>
      </div>

      <section className="surface p-5 space-y-3">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="text-sm text-text-2">
          Email: <span className="text-text font-mono">{me.data?.email ?? '—'}</span>
        </div>
        <div className="text-sm text-text-2">
          Name: <span className="text-text">{me.data?.name ?? '—'}</span>
        </div>
        {token && (
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="btn btn-secondary hover:!border-error hover:!text-error"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        )}
      </section>

      <section className="surface p-5 space-y-3">
        <h2 className="text-sm font-semibold">Board</h2>
        <label className="block">
          <span className="label">Default board name</span>
          <input
            type="text"
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            className="input"
          />
        </label>
        <button
          onClick={() => saveBoardName.mutate()}
          disabled={saveBoardName.isPending}
          className="btn btn-primary"
        >
          {saveBoardName.isPending ? 'Saving…' : 'Save board name'}
        </button>
      </section>

      <section className="surface p-5 space-y-3">
        <h2 className="text-sm font-semibold">WIP limits</h2>
        <p className="text-xs text-text-muted">
          Empty = no limit. Soft warning — header turns orange when count exceeds limit.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(board.data?.columns || []).map((col) => (
            <label key={col.id} className="block">
              <span className="label">{col.name}</span>
              <input
                type="number"
                min={1}
                value={wipDraft[col.name] ?? ''}
                onChange={(e) => setWipDraft({ ...wipDraft, [col.name]: e.target.value })}
                placeholder="—"
                className="input"
              />
            </label>
          ))}
        </div>
        {(board.data?.columns || []).length === 0 &&
          DEFAULT_WIP_KEYS.map((n) => (
            <div key={n} className="text-xs text-text-muted">
              {n} — load board to edit limits
            </div>
          ))}
        <button
          onClick={() => saveWips.mutate()}
          disabled={saveWips.isPending}
          className="btn btn-primary"
        >
          {saveWips.isPending ? 'Saving…' : 'Save WIP limits'}
        </button>
      </section>

      <section className="surface p-5 space-y-3">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div className="tabstrip">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={theme === t ? 'active' : ''}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Suppress unused-warning for settings query (we read it implicitly via the keys above) */}
      {settings.isError && (
        <div className="text-xs text-error">
          Failed to load settings: {(settings.error as Error).message}
        </div>
      )}
    </div>
  );
}
