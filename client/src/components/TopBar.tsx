import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Settings, Sun, Moon, LogOut, KanbanSquare } from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../hooks/useAuth';

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

  const dotColor =
    status === 'connected'
      ? 'bg-success'
      : status === 'reconnecting'
      ? 'bg-warning'
      : 'bg-textFaint';

  const navLinkClass = (path: string) => {
    const active = location.pathname === path;
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

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-xs text-textMuted dark:text-textMuted-dark shrink-0">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
        <span className="hidden md:inline">{status}</span>
      </div>

      <Link to="/" className={navLinkClass('/')} title="Board" aria-label="Board">
        <KanbanSquare className="w-5 h-5" />
      </Link>

      <Link
        to="/reports"
        className={navLinkClass('/reports')}
        title="Reports"
        aria-label="Reports"
      >
        <FileText className="w-5 h-5" />
      </Link>

      <Link
        to="/settings"
        className={navLinkClass('/settings')}
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
