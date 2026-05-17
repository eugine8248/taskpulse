import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KanbanSquare } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg dark:bg-bg-dark p-4 safe-pt safe-pb">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-lg p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <KanbanSquare className="w-6 h-6 text-accent" />
          <h1 className="font-mono text-accent text-xl">taskpulse</h1>
        </div>
        <p className="text-textMuted dark:text-textMuted-dark text-sm">
          Sign in to your board.
        </p>
        <div>
          <label className="block text-xs text-textMuted dark:text-textMuted-dark mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-textMuted dark:text-textMuted-dark mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-accent"
          />
        </div>
        {err && <div className="text-danger text-xs">{err}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-11 bg-accent hover:bg-accentHover text-white py-2 rounded disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
