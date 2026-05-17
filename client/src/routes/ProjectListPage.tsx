import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Check, X, KanbanSquare } from 'lucide-react';
import { api } from '../api/client';

interface ProjectSummary {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  columnCount: number;
  cardCount: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ProjectListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const projects = useQuery({
    queryKey: ['boards-list'],
    queryFn: () => api.get<ProjectSummary[]>('/api/boards/list'),
  });

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  const createMut = useMutation({
    mutationFn: (name: string) => api.post<ProjectSummary>('/api/boards', { name }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['boards-list'] });
      setCreating(false);
      setNewName('');
      navigate(`/boards/${data.id}`);
    },
    onError: (e: Error) => setActionError(e.message || 'Create failed'),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch(`/api/boards/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boards-list'] });
      setEditingId(null);
      setEditingName('');
    },
    onError: (e: Error) => setActionError(e.message || 'Rename failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/api/boards/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boards-list'] });
      setConfirmDeleteId(null);
    },
    onError: (e: Error) => {
      setActionError(e.message || 'Delete failed');
      setConfirmDeleteId(null);
    },
  });

  const list = projects.data || [];
  const onlyOne = list.length <= 1;

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setActionError(null);
    createMut.mutate(trimmed);
  }

  function startRename(p: ProjectSummary) {
    setActionError(null);
    setEditingId(p.id);
    setEditingName(p.name);
  }

  function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (editingId == null) return;
    const trimmed = editingName.trim();
    if (!trimmed) return;
    setActionError(null);
    renameMut.mutate({ id: editingId, name: trimmed });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg text-textMuted dark:text-textMuted-dark">Projects</h1>
        {!creating && (
          <button
            onClick={() => {
              setActionError(null);
              setCreating(true);
            }}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accentHover text-white text-sm px-3 py-2 rounded min-h-11"
          >
            <Plus className="w-4 h-4" /> New project
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={submitCreate}
          className="bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-lg p-4 flex items-center gap-2 flex-wrap"
        >
          <input
            ref={createInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            maxLength={120}
            className="flex-1 min-w-[200px] bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-3 py-2 text-base sm:text-sm min-h-11 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={createMut.isPending || !newName.trim()}
            className="bg-accent hover:bg-accentHover text-white text-sm px-4 py-2 rounded disabled:opacity-50 min-h-11"
          >
            {createMut.isPending ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
            className="text-sm text-textMuted dark:text-textMuted-dark px-3 min-h-11"
          >
            Cancel
          </button>
        </form>
      )}

      {actionError && (
        <div className="text-danger text-xs">{actionError}</div>
      )}

      {projects.isLoading && (
        <div className="text-textMuted dark:text-textMuted-dark text-sm">Loading projects…</div>
      )}
      {projects.error && (
        <div className="text-danger text-sm">
          Failed to load projects: {String((projects.error as Error).message)}
        </div>
      )}

      {!projects.isLoading && list.length === 0 && (
        <div className="bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-lg p-6 text-sm text-textMuted dark:text-textMuted-dark">
          No projects yet. Click <span className="text-text dark:text-text-dark">New project</span> to create one.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {list.map((p) => {
          const isEditing = editingId === p.id;
          const isConfirming = confirmDeleteId === p.id;
          return (
            <div
              key={p.id}
              className="bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start gap-2">
                <KanbanSquare className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <form onSubmit={submitRename} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        maxLength={120}
                        autoFocus
                        className="flex-1 min-w-0 bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-2 py-1 text-sm min-h-9 focus:outline-none focus:border-accent"
                      />
                      <button
                        type="submit"
                        disabled={renameMut.isPending || !editingName.trim()}
                        className="min-h-9 min-w-9 inline-flex items-center justify-center rounded bg-accent hover:bg-accentHover text-white disabled:opacity-50"
                        title="Save"
                        aria-label="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingName('');
                        }}
                        className="min-h-9 min-w-9 inline-flex items-center justify-center rounded text-textMuted dark:text-textMuted-dark hover:bg-elevated dark:hover:bg-elevated-dark"
                        title="Cancel"
                        aria-label="Cancel rename"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <Link
                      to={`/boards/${p.id}`}
                      className="block font-medium text-text dark:text-text-dark hover:text-accent truncate"
                      title={p.name}
                    >
                      {p.name}
                    </Link>
                  )}
                  <div className="text-xs text-textMuted dark:text-textMuted-dark mt-1">
                    {p.columnCount} {p.columnCount === 1 ? 'column' : 'columns'} ·{' '}
                    {p.cardCount} {p.cardCount === 1 ? 'card' : 'cards'} · created {formatDate(p.createdAt)}
                  </div>
                </div>
              </div>

              {!isEditing && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/boards/${p.id}`}
                    className="bg-accent hover:bg-accentHover text-white text-xs px-3 py-1.5 rounded min-h-9 inline-flex items-center"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => startRename(p)}
                    className="inline-flex items-center gap-1 text-xs text-textMuted dark:text-textMuted-dark hover:text-text dark:hover:text-text-dark px-2 py-1 min-h-9 rounded hover:bg-elevated dark:hover:bg-elevated-dark"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Rename
                  </button>
                  {isConfirming ? (
                    <>
                      <span className="text-xs text-textMuted dark:text-textMuted-dark">Delete?</span>
                      <button
                        onClick={() => deleteMut.mutate(p.id)}
                        disabled={deleteMut.isPending}
                        className="text-xs bg-danger text-white px-3 py-1.5 rounded min-h-9 disabled:opacity-50"
                      >
                        {deleteMut.isPending ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-textMuted dark:text-textMuted-dark px-2 py-1 min-h-9 rounded hover:bg-elevated dark:hover:bg-elevated-dark"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setActionError(null);
                        setConfirmDeleteId(p.id);
                      }}
                      disabled={onlyOne}
                      title={onlyOne ? 'You need at least one project' : 'Delete project'}
                      className="inline-flex items-center gap-1 text-xs text-textMuted dark:text-textMuted-dark hover:text-danger px-2 py-1 min-h-9 rounded hover:bg-elevated dark:hover:bg-elevated-dark disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-textMuted disabled:dark:hover:text-textMuted-dark"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
