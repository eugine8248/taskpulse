import { Link, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Settings, Sun, Moon, LogOut, KanbanSquare, ChevronRight, FolderKanban } from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import type { BoardData } from './board/types';

/**
 * TopBar — applies every stockpulse v0.2.1 fix:
 *   - gap-1 sm:gap-3 md:gap-4 (no 320 px overflow)
 *   - px-3 sm:px-6 lg:px-8
 *   - shrink-0 on brand + status group
 *   - secondary text `hidden md:inline`
 *   - every icon button min-h-11 min-w-11 (44 px touch target)
 *   - safe-area top padding for notched devices
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

  // Fetch the current board name for the breadcrumb (cached, reused with BoardView).
  const boardQuery = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.get<BoardData>(`/api/boards/${boardId}`),
    enabled: !!token && boardId != null && Number.isFinite(boardId),
  });

  const dotColor =
    status === 'connected'
      ? 'bg-success'
      : status === 'reconnecting'
      ? 'bg-warning'
      : 'bg-textFaint';

  const navLinkClass = (active: boolean) => {
    return [
      'min-h-11 min-w-11 inline-flex items-center justify-center rounded',
      'text-textMuted dark:text-textMuted-dark',
      'hover:bg-elevated dark:hover:bg-elevated-dark hover:text-text dark:hover:text-text-dark',
      active ? 'text-accent' : '',
    ].join(' ');
  };

  return (
    <header
      className={[
        'sticky top-0 z-40 bg-surface dark:bg-surface-dark',
        'border-b border-border dark:border-border-dark',
        'flex items-center gap-1 sm:gap-3 md:gap-4',
        'px-3 sm:px-6 lg:px-8',
        'h-14 safe-pt',
      ].join(' ')}
    >
      <Link
        to="/"
        className="flex items-center gap-2 font-mono font-semibold text-accent shrink-0 min-h-11"
      >
        <KanbanSquare className="w-5 h-5" />
        <span className="hidden xs:inline sm:inline">taskpulse</span>
      </Link>

      {boardId != null && (
        <div className="hidden sm:flex items-center gap-1 text-sm text-textMuted dark:text-textMuted-dark min-w-0">
          <ChevronRight className="w-4 h-4 shrink-0" />
          <Link
            to="/"
            className="hover:text-text dark:hover:text-text-dark shrink-0"
          >
            Projects
          </Link>
          <ChevronRight className="w-4 h-4 shrink-0" />
          <span className="text-text dark:text-text-dark truncate" title={boardQuery.data?.board.name}>
            {boardQuery.data?.board.name ?? '…'}
          </span>
        </div>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-xs text-textMuted dark:text-textMuted-dark shrink-0">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
        <span className="hidden md:inline">{status}</span>
      </div>

      <Link
        to="/"
        className={navLinkClass(location.pathname === '/' || location.pathname.startsWith('/boards'))}
        title="Projects"
        aria-label="Projects"
      >
        <FolderKanban className="w-5 h-5" />
      </Link>

      <Link
        to="/reports"
        className={navLinkClass(location.pathname.startsWith('/reports'))}
        title="Reports"
        aria-label="Reports"
      >
        <FileText className="w-5 h-5" />
      </Link>

      <Link
        to="/settings"
        className={navLinkClass(location.pathname === '/settings')}
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="w-5 h-5" />
      </Link>

      <button
        onClick={toggleTheme}
        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded text-textMuted dark:text-textMuted-dark hover:bg-elevated dark:hover:bg-elevated-dark hover:text-text dark:hover:text-text-dark"
        title="Toggle theme"
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
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded text-textMuted dark:text-textMuted-dark hover:bg-elevated dark:hover:bg-elevated-dark hover:text-text dark:hover:text-text-dark"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      )}
    </header>
  );
}
