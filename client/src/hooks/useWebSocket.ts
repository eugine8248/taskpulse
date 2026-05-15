import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store';

/**
 * Connects to /ws after auth, reconnects on close, and invalidates the
 * board query whenever the server broadcasts a card mutation. This is
 * what makes multi-tab same-user feel "realtime" in v0.1.
 */
export function useWebSocket() {
  const token = useStore((s) => s.token);
  const setConnectionStatus = useStore((s) => s.setConnectionStatus);
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | null>(null);

  useEffect(() => {
    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;
      setConnectionStatus('reconnecting');

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: token || '' }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'auth_ok') {
            setConnectionStatus('connected');
            return;
          }
          if (
            msg.type === 'card.create' ||
            msg.type === 'card.update' ||
            msg.type === 'card.move' ||
            msg.type === 'card.delete' ||
            msg.type === 'column.update'
          ) {
            qc.invalidateQueries({ queryKey: ['board'] });
          }
        } catch {
          /* noop */
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        // Reconnect with backoff
        if (retryRef.current) window.clearTimeout(retryRef.current);
        retryRef.current = window.setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };
    }

    connect();
    return () => {
      if (retryRef.current) window.clearTimeout(retryRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
    };
    // Reconnect when token changes (post-login / post-logout)
  }, [token, qc, setConnectionStatus]);
}
