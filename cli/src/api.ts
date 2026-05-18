// Thin fetch wrapper used by every command. Handles:
//   - JWT injection from auth.json
//   - 401 → clear cached token + helpful error
//   - 409 pin_cap_reached → typed error
//   - Multipart upload for tp attach

import { resolveApiUrl, readAuth, clearAuth } from './config';
import fs from 'fs';
import path from 'path';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface CallOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  noAuth?: boolean;
  raw?: boolean;
}

export async function call<T = unknown>(p: string, opts: CallOptions = {}): Promise<T> {
  const apiUrl = await resolveApiUrl();
  const auth = readAuth();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!opts.noAuth && auth) headers.Authorization = `Bearer ${auth.token}`;

  let url = `${apiUrl}${p}`;
  if (opts.query) {
    const qs = Object.entries(opts.query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let parsed: unknown;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    parsed = await res.json().catch(() => null);
  } else {
    parsed = await res.text();
  }

  if (res.status === 401) {
    clearAuth();
    throw new ApiError(401, 'Not signed in (tp login). Cached token was cleared.', parsed);
  }
  if (res.status === 409 && (parsed as { error?: string })?.error === 'pin_cap_reached') {
    throw new ApiError(409, `Pin cap reached (max ${(parsed as { cap?: number }).cap || 3}). Unpin a card first.`, parsed);
  }
  if (!res.ok) {
    const msg =
      (parsed as { error?: string } | null)?.error ||
      (typeof parsed === 'string' ? parsed : `HTTP ${res.status}`);
    throw new ApiError(res.status, String(msg), parsed);
  }

  if (opts.raw) return parsed as T;
  // Server wraps responses as { success, data, error } — unwrap for callers.
  const env = parsed as { success?: boolean; data?: T; error?: string } | null;
  if (env && typeof env === 'object' && 'data' in env) {
    return env.data as T;
  }
  return parsed as T;
}

/** Upload one or more files via multipart/form-data. */
export async function uploadFiles(cardId: number, filePaths: string[]): Promise<unknown> {
  const apiUrl = await resolveApiUrl();
  const auth = readAuth();
  const FormData = (globalThis as { FormData?: typeof globalThis.FormData }).FormData;
  if (!FormData) throw new Error('FormData not available in this Node runtime (need >=18)');
  const fd = new FormData();
  for (const p of filePaths) {
    const stat = fs.statSync(p);
    if (!stat.isFile()) throw new Error(`Not a file: ${p}`);
    const buf = fs.readFileSync(p);
    // Use the global Blob shim
    const blob = new Blob([buf]);
    fd.append('files', blob, path.basename(p));
  }
  const res = await fetch(`${apiUrl}/api/attachments/cards/${cardId}`, {
    method: 'POST',
    headers: auth ? { Authorization: `Bearer ${auth.token}` } : {},
    body: fd as unknown as BodyInit,
  });
  if (res.status === 401) {
    clearAuth();
    throw new ApiError(401, 'Not signed in (tp login). Cached token was cleared.');
  }
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (j as { error?: string } | null)?.error || `HTTP ${res.status}`;
    throw new ApiError(res.status, String(msg), j);
  }
  return (j as { data?: unknown }).data ?? j;
}
