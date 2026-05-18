import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Settings, Sun, Moon, LogOut, ChevronRight, FolderKanban,
  Sunrise, Target, Play, Search,
} from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import type { BoardData } from './board/types';
import FocusModal from './FocusModal';
import SearchOverlay from './SearchOverlay';

/**
 * TopBar — framedeck-style IDE top bar:
 *   - 48 px row with logo + breadcrumb on the left
 *   - flex spacer
 *   - running-timer pill + connection dot
 *   - icon-only nav buttons (search / focus / projects / today / reports / settings)
 *   - theme toggle + sign out
 *   - 44 px touch target on every interactive element (preserved from v0.2.1)
 */
export default function TopBar() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const status = useStore((s) => s.connectionStatus);
  const { logout, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const boardMatch = useMatch('/boards/:id');
  const boardId = boardMatch?.params.id ? parseInt(boardMatch.params.id, 10) : null;

  const [focusOpen, setFocusOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / Cmd+K → search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fetch the current board name for the breadcrumb (cached, reused with BoardView).
  const boardQuery = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.get<BoardData>(`/api/boards/${boardId}`),
    enabled: !!token && boardId != null && Number.isFinite(boardId),
  });

  // Running timer pill (cheap poll — 30s).
  type RT = { id: number; cardId: number; startedAt: string; card?: { id: number; title: string; columnId: number } };
  const runningTimer = useQuery({
    queryKey: ['time-running'],
    queryFn: () => api.get<RT | null>('/api/time/running'),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  // 1Hz tick for the running timer display
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!runningTimer.data) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [runningTimer.data]);

  // Count of pinned cards for the badge
  const pinned = useQuery({
    queryKey: ['pinned-cards'],
    queryFn: () => api.get<unknown[]>('/api/cards/pinned'),
    enabled: !!token,
  });

  const dotColor =
    status === 'connected'
      ? 'bg-success'
      : status === 'reconnecting'
      ? 'bg-warning'
      : 'bg-text-muted';

  const navIconClass = (active: boolean) =>
    [
      'min-h-11 min-w-11 inline-flex items-center justify-center rounded-md',
      'transition-colors',
      active
        ? 'bg-surface-muted text-accent'
        : 'text-text-2 hover:bg-surface-muted hover:text-text',
    ].join(' ');

  return (
    <header
      className={[
        'sticky top-0 z-40 bg-surface',
        'border-b border-border-soft',
        'flex items-center gap-1 sm:gap-3 md:gap-4',
        'px-3 sm:px-6 lg:px-8',
        'h-14 safe-pt',
      ].join(' ')}
    >
      <Link
        to="/"
        className="flex items-center gap-2 shrink-0 min-h-11"
        title="taskpulse"
      >
        <Logo />
        <span className="font-semibold text-sm hidden xs:inline sm:inline">taskpulse</span>
      </Link>

      {boardId != null && (
        <div className="hidden sm:flex items-center gap-1 text-sm text-text-2 min-w-0">
          <ChevronRight className="w-4 h-4 shrink-0" />
          <Link to="/" className="hover:text-text shrink-0">
            Projects
          </Link>
          <ChevronRight className="w-4 h-4 shrink-0" />
          <span className="text-text truncate" title={boardQuery.data?.board.name}>
            {boardQuery.data?.board.name ?? '…'}
          </span>
        </div>
      )}

      <div className="flex-1" />

      {token && runningTimer.data && (
        <button
          onClick={() => {
            const cid = runningTimer.data?.card?.id;
            if (cid) navigate(`/today?card=${cid}`);
          }}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs bg-error/10 text-error border border-error/30 hover:bg-error/15 shrink-0"
          title="Running timer"
        >
          <Play className="w-3 h-3 fill-current" />
          <span className="font-mono">
            {(() => {
              const ms = Date.now() - new Date(runningTimer.data.startedAt).getTime();
              const sec = Math.max(0, Math.floor(ms / 1000));
              const h = Math.floor(sec / 3600);
              const m = Math.floor((sec % 3600) / 60);
              const s = sec % 60;
              return h
                ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                : `${m}:${String(s).padStart(2, '0')}`;
            })()}
          </span>
          {runningTimer.data.card?.title && (
            <span className="truncate max-w-[120px] hidden md:inline">
              · {runningTimer.data.card.title}
            </span>
          )}
        </button>
      )}

      <div className="flex items-center gap-2 text-xs text-text-muted shrink-0" title={status}>
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
        <span className="hidden md:inline">{status}</span>
      </div>

      {token && (
        <button
          onClick={() => setSearchOpen(true)}
          className={navIconClass(false)}
          title="Search (Ctrl+K)"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>
      )}

      {token && (
        <button
          onClick={() => setFocusOpen(true)}
          className={`${navIconClass(false)} relative`}
          title="Focus (pinned)"
          aria-label="Focus"
        >
          <Target className="w-5 h-5" />
          {pinned.data && pinned.data.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-warning text-bg text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
              {pinned.data.length}
            </span>
          )}
        </button>
      )}

      <Link
        to="/"
        className={navIconClass(location.pathname === '/' || location.pathname.startsWith('/boards'))}
        title="Projects"
        aria-label="Projects"
      >
        <FolderKanban className="w-5 h-5" />
      </Link>

      <Link
        to="/today"
        className={navIconClass(location.pathname === '/today')}
        title="Today"
        aria-label="Today"
      >
        <Sunrise className="w-5 h-5" />
      </Link>

      <Link
        to="/reports"
        className={navIconClass(location.pathname.startsWith('/reports'))}
        title="Reports"
        aria-label="Reports"
      >
        <FileText className="w-5 h-5" />
      </Link>

      <Link
        to="/settings"
        className={navIconClass(location.pathname === '/settings')}
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="w-5 h-5" />
      </Link>

      <button
        onClick={toggleTheme}
        className={navIconClass(false)}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      {token && (
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className={navIconClass(false)}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      )}
      {focusOpen && <FocusModal onClose={() => setFocusOpen(false)} />}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}

/**
 * Logo — same orange-square + checkmark glyph as framedeck (sister-app cue).
 * Kept inline so a 20-byte SVG doesn't need a separate asset.
 */
function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" rx="6" fill="var(--c-accent)" />
      <path
        d="M10 22 L14 14 L18 18 L24 10"
        stroke="white"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
