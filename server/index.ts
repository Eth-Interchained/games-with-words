/**
 * Games with Words — authoritative game server.
 *
 * One process, one port: Express serves the built client and the join links,
 * and the WebSocket server rides the same HTTP server so there is exactly one
 * origin, one systemd unit, and one nginx block to deploy.
 *
 *   PORT=3210 node server/index.ts
 */

import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import QRCode from 'qrcode';

import type { ClientMessage, ServerMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION, encode } from '../shared/protocol.ts';
import type { Room } from '../shared/types.ts';
import {
  MIN_PLAYERS,
  addPlayer,
  chooseWords,
  closeWriting,
  createRoom,
  currentRound,
  everyoneAnswered,
  everyoneMatched,
  finishGame,
  isGameOver,
  nextDealer,
  react,
  redactRoom,
  removePlayer,
  resetForNewGame,
  revealRound,
  setReady,
  startRound,
  submitAnswer,
  submitMatches,
  toTableTalk,
  advanceLineup,
} from '../shared/engine.ts';
import { filterAnswer, filterNickname } from '../shared/filter.ts';
import { mulberry32, pickJoinCode } from '../shared/rng.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3210);
const HOST = process.env.HOST ?? '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const SECRET = process.env.ROOM_SECRET ?? crypto.randomBytes(32).toString('hex');
const LOG_LEVEL = Number(process.env.LOG_LEVEL ?? 1);

function log(level: number, ...args: unknown[]) {
  if (LOG_LEVEL >= level) console.log(...args);
}

/* ------------------------------------------------------------------ */
/* room registry                                                       */
/* ------------------------------------------------------------------ */

interface Session {
  ws: WebSocket;
  roomId: string;
  playerId: string;
}

const rooms = new Map<string, Room>();
const byJoinCode = new Map<string, string>();
const sessions = new Map<WebSocket, Session>();
/** roomId -> playerId -> sockets (a player may have one live socket) */
const sockets = new Map<string, Map<string, WebSocket>>();
const timers = new Map<string, NodeJS.Timeout>();

function token(roomId: string, playerId: string): string {
  const body = `${roomId}.${playerId}`;
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(t: string): { roomId: string; playerId: string } | null {
  const parts = t.split('.');
  if (parts.length !== 3) return null;
  const [roomId, playerId, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${roomId}.${playerId}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { roomId, playerId };
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(encode(msg));
}

function broadcast(room: Room) {
  const map = sockets.get(room.id);
  if (!map) return;
  for (const [playerId, ws] of map) {
    send(ws, { type: 'room', room: redactRoom(room, playerId) });
  }
}

function toastAll(room: Room, message: string) {
  const map = sockets.get(room.id);
  if (!map) return;
  for (const ws of map.values()) send(ws, { type: 'toast', message });
}

function clearTimer(roomId: string) {
  const t = timers.get(roomId);
  if (t) {
    clearTimeout(t);
    timers.delete(roomId);
  }
}

/** Server owns the deadline. Clients render a countdown; they do not enforce it. */
function armWritingTimer(room: Room) {
  clearTimer(room.id);
  const round = currentRound(room);
  if (!round?.writingDeadline) return;
  const ms = Math.max(0, round.writingDeadline - Date.now()) + 250;
  timers.set(
    room.id,
    setTimeout(() => {
      const live = rooms.get(room.id);
      if (!live || live.phase !== 'writing') return;
      const r = currentRound(live);
      // anyone who did not write gets a placeholder so the round still works
      for (const p of live.players) {
        if (p.connected && !r?.answers.some((a) => a.authorId === p.id)) {
          submitAnswer(live, p.id, '(ran out of time)', Date.now());
        }
      }
      closeWriting(live);
      broadcast(live);
    }, ms),
  );
}

function advanceAfterWriting(room: Room) {
  if (room.phase === 'writing' && everyoneAnswered(room)) {
    clearTimer(room.id);
    closeWriting(room);
  }
}

function beginNextRound(room: Room) {
  const dealer = nextDealer(room);
  startRound(room, dealer, Date.now());
}

/* ------------------------------------------------------------------ */
/* message handling                                                    */
/* ------------------------------------------------------------------ */

function handle(ws: WebSocket, msg: ClientMessage) {
  const now = Date.now();

  if (msg.type === 'ping') return send(ws, { type: 'pong' });

  /* ---- join / resume ------------------------------------------------ */
  if (msg.type === 'join' || msg.type === 'resume') {
    if (msg.type === 'resume') {
      const claim = verifyToken(msg.token);
      const room = claim ? rooms.get(claim.roomId) : undefined;
      const player = room?.players.find((p) => p.id === claim?.playerId);
      if (!room || !player || !claim) {
        return send(ws, {
          type: 'error',
          message: 'That game has ended.',
          fatal: true,
        });
      }
      player.connected = true;
      bindSocket(ws, room, player.id);
      return sendWelcome(ws, room, player.id);
    }

    const code = (msg.joinCode ?? '').trim().toUpperCase();
    let room: Room | undefined;

    if (code === '' || code === 'NEW') {
      room = createRoom(crypto.randomInt(2 ** 31), now);
      // never let a new room steal a live room's code
      room.joinCode = pickJoinCode(
        mulberry32(crypto.randomInt(2 ** 31)),
        (c) => byJoinCode.has(c),
      );
      rooms.set(room.id, room);
      byJoinCode.set(room.joinCode, room.id);
      log(1, `[room] created ${room.joinCode}`);
    } else {
      const id = byJoinCode.get(code);
      room = id ? rooms.get(id) : undefined;
    }
    if (!room) {
      return send(ws, {
        type: 'error',
        message: `No room with code ${code}.`,
        fatal: true,
      });
    }

    const nick = filterNickname(msg.nickname ?? '');
    if (!nick.ok) return send(ws, { type: 'error', message: nick.reason });

    const result = addPlayer(room, nick.body, now);
    if ('error' in result) {
      return send(ws, { type: 'error', message: result.error, fatal: true });
    }
    bindSocket(ws, room, result.id);
    sendWelcome(ws, room, result.id);
    broadcast(room);
    return;
  }

  /* ---- everything else needs a session ------------------------------ */
  const session = sessions.get(ws);
  if (!session) return send(ws, { type: 'error', message: 'Join a room first.' });
  const room = rooms.get(session.roomId);
  if (!room) return send(ws, { type: 'error', message: 'That room is gone.', fatal: true });
  const me = room.players.find((p) => p.id === session.playerId);
  if (!me) return send(ws, { type: 'error', message: 'You are not in this room.', fatal: true });

  const round = currentRound(room);
  const isDealer = round?.dealerId === me.id;

  switch (msg.type) {
    case 'settings': {
      if (me.id !== room.ownerId) return send(ws, { type: 'error', message: 'Only the room host can change settings.' });
      if (room.phase !== 'lobby') return send(ws, { type: 'error', message: 'Too late to change that.' });
      const s = msg.settings ?? {};
      if (s.totalRounds) room.settings.totalRounds = Math.min(10, Math.max(1, s.totalRounds));
      if (s.writingSeconds) room.settings.writingSeconds = Math.min(180, Math.max(20, s.writingSeconds));
      if (s.rotation) room.settings.rotation = s.rotation;
      if (typeof s.familyMode === 'boolean') room.settings.familyMode = s.familyMode;
      break;
    }

    case 'ready': {
      setReady(room, me.id, Boolean(msg.ready));
      break;
    }

    case 'start': {
      if (me.id !== room.ownerId) return send(ws, { type: 'error', message: 'Only the room host starts the game.' });
      if (room.players.length < MIN_PLAYERS) {
        return send(ws, { type: 'error', message: `Need at least ${MIN_PLAYERS} players.` });
      }
      if (room.phase !== 'lobby' && room.phase !== 'complete') return;
      resetForNewGame(room);
      startRound(room, room.ownerId, now);
      break;
    }

    case 'choose_words': {
      const r = chooseWords(room, me.id, msg.wordIds ?? [], now);
      if (r.error) return send(ws, { type: 'error', message: r.error });
      armWritingTimer(room);
      break;
    }

    case 'answer': {
      const verdict = filterAnswer(msg.body ?? '', { familyMode: room.settings.familyMode });
      if (!verdict.ok) return send(ws, { type: 'error', message: verdict.reason });
      const r = submitAnswer(room, me.id, verdict.body, now);
      if (r.error) return send(ws, { type: 'error', message: r.error });
      advanceAfterWriting(room);
      break;
    }

    case 'react': {
      const r = react(room, me.id, msg.answerId, msg.reaction);
      if (r.error) return;
      break;
    }

    case 'matches': {
      const r = submitMatches(room, me.id, msg.pairs ?? []);
      if (r.error) return send(ws, { type: 'error', message: r.error });
      if (everyoneMatched(room)) revealRound(room);
      break;
    }

    case 'advance': {
      if (room.phase === 'lineup') {
        const r = advanceLineup(room, me.id);
        if (r.error) return send(ws, { type: 'error', message: r.error });
      } else if (room.phase === 'matching') {
        if (!isDealer) return send(ws, { type: 'error', message: 'The dealer closes the matching.' });
        revealRound(room);
      } else if (room.phase === 'reveal') {
        if (!isDealer) return send(ws, { type: 'error', message: 'The dealer moves it along.' });
        toTableTalk(room);
      } else if (room.phase === 'tabletalk') {
        if (!isDealer) return send(ws, { type: 'error', message: 'The dealer moves it along.' });
        if (isGameOver(room)) finishGame(room);
        else beginNextRound(room);
      } else if (room.phase === 'final') {
        room.phase = 'complete';
      }
      break;
    }

    case 'kick': {
      if (me.id !== room.ownerId) return;
      const target = room.players.find((p) => p.id === msg.playerId);
      if (!target || target.id === room.ownerId) return;
      const map = sockets.get(room.id);
      const tws = map?.get(target.id);
      if (tws) {
        send(tws, { type: 'error', message: 'The host removed you from the room.', fatal: true });
        tws.close();
      }
      removePlayer(room, target.id);
      toastAll(room, `${target.nickname} was removed.`);
      break;
    }

    case 'again': {
      if (me.id !== room.ownerId) return;
      room.phase = 'lobby';
      resetForNewGame(room);
      break;
    }
  }

  broadcast(room);
}

function bindSocket(ws: WebSocket, room: Room, playerId: string) {
  let map = sockets.get(room.id);
  if (!map) {
    map = new Map();
    sockets.set(room.id, map);
  }
  const existing = map.get(playerId);
  if (existing && existing !== ws) {
    send(existing, { type: 'error', message: 'You joined from another device.', fatal: true });
    existing.close();
  }
  map.set(playerId, ws);
  sessions.set(ws, { ws, roomId: room.id, playerId });
}

async function sendWelcome(ws: WebSocket, room: Room, playerId: string) {
  const joinUrl = `${PUBLIC_URL}/j/${room.joinCode}`;
  let qrSvg = '';
  try {
    qrSvg = await QRCode.toString(joinUrl, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1b1714', light: '#0000' },
    });
  } catch {
    qrSvg = '';
  }
  send(ws, {
    type: 'welcome',
    protocol: PROTOCOL_VERSION,
    token: token(room.id, playerId),
    playerId,
    room: redactRoom(room, playerId),
    joinUrl,
    qrSvg,
  });
}

/* ------------------------------------------------------------------ */
/* http + ws                                                           */
/* ------------------------------------------------------------------ */

const app = express();
app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    players: [...rooms.values()].reduce((n, r) => n + r.players.length, 0),
    protocol: PROTOCOL_VERSION,
    uptime: Math.round(process.uptime()),
  });
});

const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));

// /j/CODE deep link -> SPA with the code prefilled
app.get(/^\/j\/([A-Za-z0-9]{3,8})$/, (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});
app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg: ClientMessage | null = null;
    try {
      msg = JSON.parse(String(data)) as ClientMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    try {
      handle(ws, msg);
    } catch (err) {
      log(0, '[error]', err);
      send(ws, { type: 'error', message: 'Something went sideways on our end.' });
    }
  });

  ws.on('close', () => {
    const s = sessions.get(ws);
    sessions.delete(ws);
    if (!s) return;
    const room = rooms.get(s.roomId);
    const map = sockets.get(s.roomId);
    if (map?.get(s.playerId) === ws) map.delete(s.playerId);
    if (!room) return;
    const p = room.players.find((pl) => pl.id === s.playerId);
    if (p) p.connected = false;
    // in the lobby a disconnect is a leave; mid-game they can come back
    if (room.phase === 'lobby') removePlayer(room, s.playerId);
    if (room.players.length === 0) {
      clearTimer(room.id);
      rooms.delete(room.id);
      byJoinCode.delete(room.joinCode);
      sockets.delete(room.id);
      log(1, `[room] reaped ${room.joinCode}`);
      return;
    }
    broadcast(room);
  });
});

// reap expired rooms
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.expiresAt < now) {
      clearTimer(id);
      rooms.delete(id);
      byJoinCode.delete(room.joinCode);
      sockets.delete(id);
    }
  }
}, 60_000).unref();

export function startServer(port = PORT): Promise<http.Server> {
  return new Promise((resolve) => {
    server.listen(port, HOST, () => {
      log(0, `Games with Words — http://${HOST}:${port}  (public: ${PUBLIC_URL})`);
      resolve(server);
    });
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) void startServer();

export { app, server, rooms, wss };
