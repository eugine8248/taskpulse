import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function SetupPage({ onLogin }: { onLogin: (t: string | null) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setup } = useAuth();
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await setup(email, password, name || undefined);
      onLogin(null);
      navigate('/', { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-bg safe-pt safe-pb">
      <div className="w-full max-w-[400px] surface shadow-md p-5 sm:p-7 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-semibold text-lg">taskpulse</span>
          </div>
          <h1 className="text-2xl font-semibold mt-3">Create your admin account</h1>
          <p className="text-sm text-text-2 mt-1">
            First-launch setup — this is the only step before you start boards.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name (optional)</label>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label">Password (min 8 chars)</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {err && <div className="text-error text-xs">{err}</div>}
          <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
            {busy ? 'Creating…' : 'Create admin account'}
          </button>
        </form>
      </div>
    </div>
  );
}

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
