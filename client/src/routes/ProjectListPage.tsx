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
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Your projects</h1>
          <p className="text-sm text-text-2 mt-1">
            {list.length === 0
              ? 'Create your first project to get started.'
              : `${list.length} project${list.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => {
              setActionError(null);
              setCreating(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> New project
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={submitCreate}
          className="surface p-4 flex items-center gap-2 flex-wrap"
        >
          <input
            ref={createInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            maxLength={120}
            className="input flex-1 min-w-[200px]"
          />
          <button
            type="submit"
            disabled={createMut.isPending || !newName.trim()}
            className="btn btn-primary"
          >
            {createMut.isPending ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
            className="btn btn-ghost"
          >
            Cancel
          </button>
        </form>
      )}

      {actionError && <div className="text-error text-xs">{actionError}</div>}

      {projects.isLoading && <div className="text-text-muted text-sm">Loading projects…</div>}
      {projects.error && (
        <div className="text-error text-sm">
          Failed to load projects: {String((projects.error as Error).message)}
        </div>
      )}

      {!projects.isLoading && list.length === 0 && (
        <div className="surface p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h2 className="text-lg font-semibold">No projects yet</h2>
          <p className="text-sm text-text-2 mt-2">
            Create your first project and start dropping tasks on the board.
          </p>
          <button
            className="btn btn-primary mt-5"
            onClick={() => {
              setActionError(null);
              setCreating(true);
            }}
          >
            <Plus className="w-4 h-4" /> Create your first project
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((p) => {
          const isEditing = editingId === p.id;
          const isConfirming = confirmDeleteId === p.id;
          return (
            <div key={p.id} className="surface shadow-xs hover:shadow-md transition p-4 space-y-3">
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
                        className="input flex-1 min-w-0 h-8 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={renameMut.isPending || !editingName.trim()}
                        className="btn btn-primary btn-sm btn-icon"
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
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Cancel"
                        aria-label="Cancel rename"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <Link
                      to={`/boards/${p.id}`}
                      className="block font-semibold text-text hover:text-accent truncate"
                      title={p.name}
                    >
                      {p.name}
                    </Link>
                  )}
                  <div className="text-xs text-text-muted mt-1 font-mono">
                    {p.columnCount} {p.columnCount === 1 ? 'col' : 'cols'} · {p.cardCount}{' '}
                    {p.cardCount === 1 ? 'card' : 'cards'} · {formatDate(p.createdAt)}
                  </div>
                </div>
              </div>

              {!isEditing && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link to={`/boards/${p.id}`} className="btn btn-primary btn-sm">
                    Open
                  </Link>
                  <button onClick={() => startRename(p)} className="btn btn-ghost btn-sm" title="Rename">
                    <Pencil className="w-3.5 h-3.5" /> Rename
                  </button>
                  {isConfirming ? (
                    <>
                      <span className="text-xs text-text-2">Delete?</span>
                      <button
                        onClick={() => deleteMut.mutate(p.id)}
                        disabled={deleteMut.isPending}
                        className="btn btn-danger btn-sm"
                      >
                        {deleteMut.isPending ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="btn btn-ghost btn-sm">
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
                      className="btn btn-ghost btn-sm text-text-muted hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
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
