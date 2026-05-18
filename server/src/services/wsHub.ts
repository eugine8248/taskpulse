// WebSocket hub: per-user connection tracking + broadcast helpers.
// Path: /ws. Client must send {type:'auth', token} as first message.
// When NO_AUTH is active (and not in production) the auth message may
// omit the token.

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyTokenSafe, ensureNoAuthUser, isNoAuth } from '../middleware/auth';

interface SockMeta {
  userId: number;
  isAlive: boolean;
}

const sockets = new Map<number, Set<WebSocket>>();
const meta = new WeakMap<WebSocket, SockMeta>();

let wss: WebSocketServer | null = null;

function attach(userId: number, ws: WebSocket) {
  let set = sockets.get(userId);
  if (!set) {
    set = new Set();
    sockets.set(userId, set);
  }
  set.add(ws);
  meta.set(ws, { userId, isAlive: true });
}

function detach(ws: WebSocket) {
  const m = meta.get(ws);
  if (!m) return;
  const set = sockets.get(m.userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) sockets.delete(m.userId);
  }
  meta.delete(ws);
}

export function setupWebSocket(server: http.Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let authed = false;
    const authTimer = setTimeout(() => {
      if (!authed) {
        try {
          ws.close(4001, 'Auth timeout');
        } catch {
          /* noop */
        }
      }
    }, 5000);

    ws.on('message', async (data) => {
      let parsed: { type?: string; token?: string } | null = null;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (!authed) {
        if (parsed?.type !== 'auth') {
          try {
            ws.close(4002, 'Auth required');
          } catch {
            /* noop */
          }
          return;
        }
        let userId: number | null = null;
        if (isNoAuth()) {
          try {
            userId = await ensureNoAuthUser();
          } catch {
            userId = null;
          }
        } else {
          const token = typeof parsed.token === 'string' ? parsed.token : '';
          userId = await verifyTokenSafe(token);
        }
        if (!userId) {
          try {
            ws.close(4003, 'Invalid token');
          } catch {
            /* noop */
          }
          return;
        }
        authed = true;
        clearTimeout(authTimer);
        attach(userId, ws);
        try {
          ws.send(JSON.stringify({ type: 'auth_ok', userId }));
        } catch {
          /* noop */
        }
        return;
      }

      if (parsed?.type === 'ping') {
        try {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        } catch {
          /* noop */
        }
      }
    });

    ws.on('pong', () => {
      const m = meta.get(ws);
      if (m) m.isAlive = true;
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      detach(ws);
    });

    ws.on('error', () => {
      clearTimeout(authTimer);
      detach(ws);
    });
  });

  // Heartbeat: ping every 30s, drop dead sockets
  setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      const m = meta.get(ws);
      if (!m) return;
      if (!m.isAlive) {
        try {
          ws.terminate();
        } catch {
          /* noop */
        }
        detach(ws);
        return;
      }
      m.isAlive = false;
      try {
        ws.ping();
      } catch {
        /* noop */
      }
    });
  }, 30_000).unref();
}

export function broadcast(userId: number, msg: unknown) {
  const set = sockets.get(userId);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        /* noop */
      }
    }
  }
}
