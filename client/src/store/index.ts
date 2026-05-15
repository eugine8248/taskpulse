import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type ConnectionStatus =
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

interface State {
  token: string | null;
  setToken: (t: string | null) => void;

  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;

  connectionStatus: ConnectionStatus;
  setConnectionStatus: (s: ConnectionStatus) => void;
}

const STORAGE_TOKEN = 'taskpulse.token';
const STORAGE_THEME = 'taskpulse.theme';

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_THEME) as Theme | null;
  if (stored === 'dark' || stored === 'light') return stored;
  // OS preference fallback
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export const useStore = create<State>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem(STORAGE_TOKEN) : null,
  setToken: (t) => {
    if (typeof window !== 'undefined') {
      if (t) localStorage.setItem(STORAGE_TOKEN, t);
      else localStorage.removeItem(STORAGE_TOKEN);
    }
    set({ token: t });
  },

  theme: initialTheme(),
  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_THEME, next);
      return { theme: next };
    }),
  setTheme: (t) => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_THEME, t);
    set({ theme: t });
  },

  connectionStatus: 'disconnected',
  setConnectionStatus: (s) => set({ connectionStatus: s }),
}));
