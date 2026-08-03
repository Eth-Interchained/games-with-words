/**
 * Wire protocol. One socket, JSON frames, `type` discriminant.
 *
 * The server sends a full redacted room snapshot on every state change rather
 * than deltas. The state is small (10 players, 5 rounds) and full snapshots
 * make an entire class of desync bug impossible — which matters more on
 * flaky phone networks than the bytes do.
 */

import type { ClientRoom, Reaction, RoomSettings } from './types.ts';

export const PROTOCOL_VERSION = 1;

/* ---------------------------- client -> server --------------------------- */

export type ClientMessage =
  | { type: 'join'; joinCode: string; nickname: string; token?: string }
  | { type: 'resume'; token: string }
  | { type: 'settings'; settings: Partial<RoomSettings> }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'choose_words'; wordIds: string[] }
  | { type: 'answer'; body: string }
  | { type: 'react'; answerId: string; reaction: Reaction | null }
  | { type: 'matches'; pairs: { answerId: string; guessedAuthorId: string }[] }
  | { type: 'advance' }
  | { type: 'kick'; playerId: string }
  | { type: 'again' }
  | { type: 'ping' };

/* ---------------------------- server -> client --------------------------- */

export type ServerMessage =
  | {
      type: 'welcome';
      protocol: number;
      token: string;
      playerId: string;
      room: ClientRoom;
      joinUrl: string;
      qrSvg: string;
    }
  | { type: 'room'; room: ClientRoom }
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'toast'; message: string }
  | { type: 'pong' };

export function encode(msg: ServerMessage | ClientMessage): string {
  return JSON.stringify(msg);
}

export function decode<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
