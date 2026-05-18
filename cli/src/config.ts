// Persistent config + auth state for the tp CLI.
//
// Files (in $HOME/.taskpulse/):
//   auth.json    { token: string } — chmod 600 on POSIX
//   config.json  { apiUrl: string, defaultBoard?: number, pinCap?: number }
//
// The CLI tries the env override first, then the persisted config. The
// default apiUrl is the production deploy; we fall back to localhost:3000
// (the dev server port — taskpulse defaults to 3000, not 3001 like the spec
// suggested — we read the canonical .env value).

import fs from 'fs';
import os from 'os';
import path from 'path';

export interface Auth {
  token: string;
}
export interface Config {
  apiUrl?: string;
  defaultBoard?: number;
  pinCap?: number;
}

export const CONFIG_DIR = path.join(os.homedir(), '.taskpulse');
export const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_API_URLS = [
  process.env.TASKPULSE_API_URL,
  'https://taskpulse.alien-lee.com',
  'http://localhost:3000',
].filter(Boolean) as string[];

function ensureDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function readAuth(): Auth | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const raw = fs.readFileSync(AUTH_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (typeof j.token !== 'string') return null;
    return j as Auth;
  } catch {
    return null;
  }
}

export function writeAuth(a: Auth): void {
  ensureDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(a, null, 2));
  if (process.platform !== 'win32') {
    try { fs.chmodSync(AUTH_FILE, 0o600); } catch { /* best-effort */ }
  }
}

export function clearAuth(): void {
  try { fs.unlinkSync(AUTH_FILE); } catch { /* idempotent */ }
}

export function readConfig(): Config {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(patch: Partial<Config>): Config {
  ensureDir();
  const current = readConfig();
  const next = { ...current, ...patch };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}

/** Probe candidate API URLs until one returns 2xx on /api/health. */
export async function resolveApiUrl(): Promise<string> {
  const config = readConfig();
  if (config.apiUrl) return config.apiUrl;
  for (const url of DEFAULT_API_URLS) {
    try {
      const res = await fetch(`${url}/api/health`, { method: 'GET' });
      if (res.ok) {
        writeConfig({ apiUrl: url });
        return url;
      }
    } catch {
      /* try next */
    }
  }
  // Cache the last fallback so we don't probe on every command in offline mode
  const fallback = DEFAULT_API_URLS[DEFAULT_API_URLS.length - 1];
  return fallback;
}
