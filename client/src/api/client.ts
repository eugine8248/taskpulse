// Fetch wrapper: injects JWT, unwraps {success,data,error}.
import { useStore } from '../store';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = useStore.getState().token;
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // non-json
  }

  if (!res.ok || (json && json.success === false)) {
    const msg = json?.error || `${res.status} ${res.statusText}`;
    if (res.status === 401) {
      useStore.getState().setToken(null);
    }
    throw new Error(msg);
  }
  return (json?.data as T) ?? (undefined as T);
}

export const api = {
  get:   <T>(path: string)                => request<T>('GET',    path),
  post:  <T>(path: string, body?: unknown) => request<T>('POST',   path, body),
  put:   <T>(path: string, body?: unknown) => request<T>('PUT',    path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH',  path, body),
  del:   <T>(path: string)                => request<T>('DELETE', path),
};
