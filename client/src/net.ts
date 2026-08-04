import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '../../shared/protocol.ts';
import type { ClientRoom } from '../../shared/types.ts';

const TOKEN_KEY = 'gww.token';

export interface Net {
  room: ClientRoom | null;
  playerId: string;
  joinUrl: string;
  qrSvg: string;
  status: 'idle' | 'connecting' | 'open' | 'closed';
  error: string | null;
  toast: string | null;
  send: (msg: ClientMessage) => void;
  join: (joinCode: string, nickname: string) => void;
  clearError: () => void;
  leave: () => void;
}

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function useNet(): Net {
  const ws = useRef<WebSocket | null>(null);
  const queue = useRef<ClientMessage[]>([]);
  const pending = useRef<{ joinCode: string; nickname: string } | null>(null);
  const retries = useRef(0);
  const intentionalClose = useRef(false);

  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [status, setStatus] = useState<Net['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flush = () => {
    if (ws.current?.readyState !== WebSocket.OPEN) return;
    for (const m of queue.current) ws.current.send(JSON.stringify(m));
    queue.current = [];
  };

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    } else {
      queue.current.push(msg);
    }
  }, []);

  const connect = useCallback(() => {
    if (ws.current && ws.current.readyState <= WebSocket.OPEN) return;
    intentionalClose.current = false;
    setStatus('connecting');
    const socket = new WebSocket(wsUrl());
    ws.current = socket;

    socket.onopen = () => {
      retries.current = 0;
      setStatus('open');
      const stored = localStorage.getItem(TOKEN_KEY);
      if (pending.current) {
        socket.send(JSON.stringify({ type: 'join', ...pending.current }));
        pending.current = null;
      } else if (stored) {
        socket.send(JSON.stringify({ type: 'resume', token: stored }));
      }
      flush();
    };

    socket.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'welcome':
          localStorage.setItem(TOKEN_KEY, msg.token);
          setPlayerId(msg.playerId);
          setJoinUrl(msg.joinUrl);
          setQrSvg(msg.qrSvg);
          setRoom(msg.room);
          setError(null);
          break;
        case 'room':
          setRoom(msg.room);
          break;
        case 'error':
          setError(msg.message);
          if (msg.fatal) {
            localStorage.removeItem(TOKEN_KEY);
            setRoom(null);
            setPlayerId('');
          }
          break;
        case 'toast':
          setToast(msg.message);
          setTimeout(() => setToast(null), 2600);
          break;
      }
    };

    socket.onclose = () => {
      setStatus('closed');
      ws.current = null;
      if (intentionalClose.current) return;
      // exponential-ish backoff, capped — phones drop sockets constantly
      const delay = Math.min(6000, 400 * 2 ** Math.min(retries.current, 4));
      retries.current += 1;
      setTimeout(connect, delay);
    };

    socket.onerror = () => socket.close();
  }, []);

  // reconnect when the user comes back to the tab / unlocks the phone
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !ws.current) connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [connect]);

  // resume an in-progress game on load
  useEffect(() => {
    if (localStorage.getItem(TOKEN_KEY)) connect();
  }, [connect]);

  // keepalive so intermediaries do not idle the socket out
  useEffect(() => {
    const id = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) send({ type: 'ping' });
    }, 25000);
    return () => clearInterval(id);
  }, [send]);

  const join = useCallback(
    (joinCode: string, nickname: string) => {
      pending.current = { joinCode, nickname };
      localStorage.removeItem(TOKEN_KEY);
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'join', joinCode, nickname }));
        pending.current = null;
      } else {
        connect();
      }
    },
    [connect],
  );

  const leave = useCallback(() => {
    intentionalClose.current = true;
    localStorage.removeItem(TOKEN_KEY);
    ws.current?.close();
    ws.current = null;
    setRoom(null);
    setPlayerId('');
    setStatus('idle');
  }, []);

  return {
    room, playerId, joinUrl, qrSvg, status, error, toast,
    send, join, leave,
    clearError: () => setError(null),
  };
}

/** Short, purposeful haptics. Silently absent on iOS Safari. */
export function buzz(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration motor, no problem */
  }
}
