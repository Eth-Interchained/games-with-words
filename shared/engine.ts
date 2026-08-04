/**
 * The rules engine.
 *
 * I/O-free and deterministic given (seed, ordered inputs), which is what lets
 * tests/run.ts replay a whole game headlessly. The server owns exactly one
 * Room object per room and calls into here; nothing in this file touches a
 * socket, a clock it did not receive, or a disk.
 */

import type {
  Answer,
  ClientRoom,
  ClientRound,
  Match,
  Player,
  Reaction,
  Room,
  RoomSettings,
  Round,
  Superlative,
  Trio,
  Word,
} from './types.ts';
import { makeId, makeJoinCode, mulberry32, shuffle, weightedPick } from './rng.ts';
import { packFor } from './words.ts';
import { FRAMES, questionFor } from './frames.ts';
import { pickTableTalk, scoreRound } from './scoring.ts';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export const DEFAULT_SETTINGS: RoomSettings = {
  totalRounds: 5,
  writingSeconds: 60,
  rotation: 'reader',
  familyMode: true,
  packId: 'core',
};

const AVATAR_SEEDS = [
  'ember', 'sage', 'clay', 'indigo', 'ochre', 'moss',
  'rust', 'slate', 'plum', 'wheat',
];

/* ------------------------------------------------------------------ */
/* room lifecycle                                                      */
/* ------------------------------------------------------------------ */

export function createRoom(
  seed: number,
  now: number,
  settings: Partial<RoomSettings> = {},
): Room {
  const rand = mulberry32(seed);
  return {
    id: makeId(rand, 16),
    joinCode: makeJoinCode(rand, 4),
    phase: 'lobby',
    players: [],
    ownerId: '',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    roundNumber: 0,
    rounds: [],
    superlatives: [],
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    seed,
  };
}

export function addPlayer(
  room: Room,
  nickname: string,
  now: number,
): Player | { error: string } {
  if (room.players.length >= MAX_PLAYERS) {
    return { error: `This room is full (${MAX_PLAYERS} players).` };
  }
  if (room.phase !== 'lobby' && room.phase !== 'complete') {
    return { error: 'That game is already in progress.' };
  }
  const taken = new Set(
    room.players.map((p) => p.nickname.toLowerCase()),
  );
  let name = nickname.trim().slice(0, 16) || 'Player';
  if (taken.has(name.toLowerCase())) {
    let n = 2;
    while (taken.has(`${name} ${n}`.toLowerCase())) n++;
    name = `${name} ${n}`;
  }
  const rand = mulberry32(room.seed + room.players.length * 7919 + now % 1000);
  const player: Player = {
    id: makeId(rand, 12),
    nickname: name,
    avatarSeed: AVATAR_SEEDS[room.players.length % AVATAR_SEEDS.length],
    connected: true,
    joinedAt: now,
    score: 0,
    roundsDealt: 0,
    isHost: room.players.length === 0,
    ready: false,
  };
  room.players.push(player);
  if (room.players.length === 1) room.ownerId = player.id;
  return player;
}

/**
 * Lobby ready signal. Deliberately advisory: it tells the host the room is
 * paying attention, it does not gate the launch. Waiting on one person who
 * put their phone down is how a party game dies.
 */
export function setReady(room: Room, playerId: string, ready: boolean): void {
  if (room.phase !== 'lobby') return;
  const p = room.players.find((pl) => pl.id === playerId);
  if (p) p.ready = ready;
}

export function readyCount(room: Room): { ready: number; total: number } {
  const live = room.players.filter((p) => p.connected);
  return { ready: live.filter((p) => p.ready).length, total: live.length };
}

export function resetForNewGame(room: Room): void {
  room.roundNumber = 0;
  room.rounds = [];
  room.superlatives = [];
  for (const p of room.players) {
    p.score = 0;
    p.roundsDealt = 0;
    p.ready = false;
  }
}

export function removePlayer(room: Room, playerId: string): void {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.ownerId === playerId && room.players.length > 0) {
    room.ownerId = room.players[0].id;
    room.players[0].isHost = true;
  }
}

export function currentRound(room: Room): Round | undefined {
  return room.rounds[room.rounds.length - 1];
}

export function dealerOf(room: Room): Player | undefined {
  const r = currentRound(room);
  if (!r) return undefined;
  return room.players.find((p) => p.id === r.dealerId);
}

/* ------------------------------------------------------------------ */
/* dealing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Nine tiles as a 3x3 grid: a row of concrete nouns, a row of
 * moments/actions, a row of feelings/values. Any three the dealer taps will
 * produce a workable trio, and the structure makes the choice legible.
 */
export function dealHand(room: Room, roundNumber: number): Word[] {
  const rand = mulberry32(room.seed + roundNumber * 104729);
  const pool = packFor(room.settings.packId, room.settings.familyMode);
  const concrete = pool.filter(
    (w) => w.category === 'people' || w.category === 'places' || w.category === 'objects',
  );
  const moments = pool.filter((w) => w.category === 'moments');
  const feelings = pool.filter((w) => w.category === 'feelings');

  return [
    ...shuffle(rand, concrete).slice(0, 3),
    ...shuffle(rand, moments).slice(0, 3),
    ...shuffle(rand, feelings).slice(0, 3),
  ];
}

export function startRound(room: Room, dealerId: string, now: number): Round {
  const number = room.roundNumber + 1;
  room.roundNumber = number;
  const round: Round = {
    number,
    dealerId,
    hand: dealHand(room, number),
    answers: [],
    matches: [],
    scores: [],
    lineupIndex: 0,
  };
  room.rounds.push(round);
  room.phase = 'dealing';
  const dealer = room.players.find((p) => p.id === dealerId);
  if (dealer) dealer.roundsDealt += 1;
  void now;
  return round;
}

export function chooseWords(
  room: Room,
  playerId: string,
  wordIds: string[],
  now: number,
): { error?: string } {
  const round = currentRound(room);
  if (!round || room.phase !== 'dealing') return { error: 'Not dealing right now.' };
  if (round.dealerId !== playerId) return { error: 'Only the dealer picks the words.' };
  if (wordIds.length !== 3) return { error: 'Pick exactly three.' };

  const picked = wordIds
    .map((id) => round.hand.find((w) => w.id === id))
    .filter((w): w is Word => Boolean(w));
  if (picked.length !== 3) return { error: 'Those words are not in your hand.' };

  round.words = picked as Trio;
  const rand = mulberry32(room.seed + round.number * 7717);
  const frame = weightedPick(rand, FRAMES);
  round.frameId = frame.id;
  round.question = questionFor(frame.id, picked as Trio, Math.floor(rand() * 5));
  round.writingDeadline = now + room.settings.writingSeconds * 1000;
  room.phase = 'writing';
  return {};
}

/* ------------------------------------------------------------------ */
/* writing                                                             */
/* ------------------------------------------------------------------ */

export function submitAnswer(
  room: Room,
  playerId: string,
  body: string,
  now: number,
): { error?: string; answer?: Answer } {
  const round = currentRound(room);
  if (!round || room.phase !== 'writing') return { error: 'Not taking answers right now.' };
  if (round.writingDeadline && now > round.writingDeadline + 2000) {
    return { error: 'Time is up on that one.' };
  }
  const existing = round.answers.find((a) => a.authorId === playerId);
  if (existing) {
    existing.body = body;
    existing.submittedAt = now;
    return { answer: existing };
  }
  const rand = mulberry32(room.seed + round.number * 31 + round.answers.length);
  const answer: Answer = {
    id: makeId(rand, 10),
    roundNumber: round.number,
    authorId: playerId,
    body,
    submittedAt: now,
    reactions: {},
  };
  round.answers.push(answer);
  return { answer };
}

export function everyoneAnswered(room: Room): boolean {
  const round = currentRound(room);
  if (!round) return false;
  const connected = room.players.filter((p) => p.connected);
  return connected.every((p) => round.answers.some((a) => a.authorId === p.id));
}

/** Shuffle answers so reading order never leaks submission order. */
export function closeWriting(room: Room): void {
  const round = currentRound(room);
  if (!round) return;
  const rand = mulberry32(room.seed + round.number * 6151);
  round.answers = shuffle(rand, round.answers);
  round.lineupIndex = 0;
  room.phase = 'lineup';
}

/* ------------------------------------------------------------------ */
/* lineup + reactions                                                  */
/* ------------------------------------------------------------------ */

export function react(
  room: Room,
  playerId: string,
  answerId: string,
  reaction: Reaction | null,
): { error?: string } {
  const round = currentRound(room);
  if (!round) return { error: 'No round.' };
  if (room.phase !== 'lineup' && room.phase !== 'matching' && room.phase !== 'reveal') {
    return { error: 'Reactions are closed.' };
  }
  const answer = round.answers.find((a) => a.id === answerId);
  if (!answer) return { error: 'No such answer.' };
  if (answer.authorId === playerId) return { error: 'No reacting to your own.' };
  if (reaction === null) delete answer.reactions[playerId];
  else answer.reactions[playerId] = reaction;
  return {};
}

export function advanceLineup(room: Room, playerId: string): { error?: string } {
  const round = currentRound(room);
  if (!round || room.phase !== 'lineup') return { error: 'Not in the line-up.' };
  if (round.dealerId !== playerId) return { error: 'The dealer runs the line-up.' };
  round.lineupIndex += 1;
  if (round.lineupIndex >= round.answers.length) {
    room.phase = 'matching';
  }
  return {};
}

/* ------------------------------------------------------------------ */
/* matching                                                            */
/* ------------------------------------------------------------------ */

export function submitMatches(
  room: Room,
  playerId: string,
  pairs: { answerId: string; guessedAuthorId: string }[],
): { error?: string } {
  const round = currentRound(room);
  if (!round || room.phase !== 'matching') return { error: 'Not matching right now.' };
  round.matches = round.matches.filter((m) => m.guesserId !== playerId);
  for (const p of pairs) {
    const answer = round.answers.find((a) => a.id === p.answerId);
    if (!answer) continue;
    if (answer.authorId === playerId) continue; // your own answer is not in play
    if (!room.players.some((pl) => pl.id === p.guessedAuthorId)) continue;
    round.matches.push({
      guesserId: playerId,
      answerId: p.answerId,
      guessedAuthorId: p.guessedAuthorId,
    });
  }
  return {};
}

export function everyoneMatched(room: Room): boolean {
  const round = currentRound(room);
  if (!round) return false;
  const connected = room.players.filter((p) => p.connected);
  return connected.every((p) => round.matches.some((m) => m.guesserId === p.id));
}

/* ------------------------------------------------------------------ */
/* reveal + scoring                                                    */
/* ------------------------------------------------------------------ */

export function revealRound(room: Room): void {
  const round = currentRound(room);
  if (!round) return;
  const result = scoreRound(room.players, round.answers, round.matches);
  round.scores = result.lines;
  for (const line of result.lines) {
    const p = room.players.find((pl) => pl.id === line.playerId);
    if (p) p.score += line.total;
  }
  const tt = pickTableTalk(round.answers, result.correctByAnswer);
  if (tt) {
    round.tableTalkAnswerId = tt.answerId;
    round.tableTalkReason = tt.reason;
  }
  room.phase = 'reveal';
}

export function toTableTalk(room: Room): void {
  room.phase = 'tabletalk';
}

/**
 * Next dealer. Default 'reader' rotation hands the deck to whoever read the
 * room best this round — it makes dealing feel earned rather than assigned.
 * Nobody deals twice in a row while an alternative exists.
 */
export function nextDealer(room: Room): string {
  const round = currentRound(room);
  const eligible = room.players.filter(
    (p) => p.connected && (room.players.length < 3 || p.id !== round?.dealerId),
  );
  const pool = eligible.length > 0 ? eligible : room.players;

  if (room.settings.rotation === 'clockwise') {
    const order = room.players.slice().sort((a, b) => a.joinedAt - b.joinedAt);
    const idx = order.findIndex((p) => p.id === round?.dealerId);
    return order[(idx + 1) % order.length].id;
  }
  if (room.settings.rotation === 'random') {
    const rand = mulberry32(room.seed + room.roundNumber * 15485863);
    return shuffle(rand, pool)[0].id;
  }

  // 'reader': most correct matches this round, then fewest rounds dealt,
  // then earliest to join. Deterministic, no coin flips.
  const scoreFor = (id: string) =>
    round?.scores.find((s) => s.playerId === id)?.readTheRoom ?? 0;
  return pool
    .slice()
    .sort((a, b) => {
      const d = scoreFor(b.id) - scoreFor(a.id);
      if (d !== 0) return d;
      const rd = a.roundsDealt - b.roundsDealt;
      if (rd !== 0) return rd;
      return a.joinedAt - b.joinedAt;
    })[0].id;
}

export function isGameOver(room: Room): boolean {
  return room.roundNumber >= room.settings.totalRounds;
}

/* ------------------------------------------------------------------ */
/* the final word                                                      */
/* ------------------------------------------------------------------ */

export function computeSuperlatives(room: Room): Superlative[] {
  const out: Superlative[] = [];
  const name = (id: string) =>
    room.players.find((p) => p.id === id)?.nickname ?? 'Someone';

  const recognized: Record<string, number> = {};
  const correctMatches: Record<string, number> = {};
  const hearts: Record<string, number> = {};
  const laughs: Record<string, number> = {};
  const answersBy: Record<string, number> = {};
  for (const p of room.players) {
    recognized[p.id] = 0;
    correctMatches[p.id] = 0;
    hearts[p.id] = 0;
    laughs[p.id] = 0;
    answersBy[p.id] = 0;
  }

  let biggestSurprise: { authorId: string; body: string; reacts: number } | undefined;

  for (const round of room.rounds) {
    const byId = new Map(round.answers.map((a) => [a.id, a]));
    const correctFor: Record<string, number> = {};
    for (const a of round.answers) {
      correctFor[a.id] = 0;
      answersBy[a.authorId] = (answersBy[a.authorId] ?? 0) + 1;
      for (const r of Object.values(a.reactions)) {
        if (r === 'heart') hearts[a.authorId] = (hearts[a.authorId] ?? 0) + 1;
        if (r === 'laugh') laughs[a.authorId] = (laughs[a.authorId] ?? 0) + 1;
      }
    }
    for (const m of round.matches) {
      const a = byId.get(m.answerId);
      if (!a || a.authorId === m.guesserId) continue;
      if (a.authorId === m.guessedAuthorId) {
        correctFor[a.id] += 1;
        recognized[a.authorId] = (recognized[a.authorId] ?? 0) + 1;
        correctMatches[m.guesserId] = (correctMatches[m.guesserId] ?? 0) + 1;
      }
    }
    for (const a of round.answers) {
      if (correctFor[a.id] === 0) {
        const reacts = Object.keys(a.reactions).length;
        if (!biggestSurprise || reacts > biggestSurprise.reacts) {
          biggestSurprise = { authorId: a.authorId, body: a.body, reacts };
        }
      }
    }
  }

  const top = (rec: Record<string, number>, min = 1) => {
    const entries = Object.entries(rec).filter(([, v]) => v >= min);
    if (entries.length === 0) return undefined;
    return entries.sort((a, b) => b[1] - a[1])[0];
  };

  const easiest = top(recognized);
  if (easiest) {
    out.push({
      key: 'easiest_to_read',
      title: 'Easiest to Read',
      playerId: easiest[0],
      detail: `${name(easiest[0])} got picked out correctly ${easiest[1]} time${easiest[1] === 1 ? '' : 's'}.`,
    });
  }

  const mystery = Object.entries(recognized)
    .filter(([id]) => (answersBy[id] ?? 0) > 0)
    .sort((a, b) => a[1] - b[1])[0];
  if (mystery && (!easiest || mystery[0] !== easiest[0])) {
    out.push({
      key: 'total_mystery',
      title: 'Total Mystery',
      playerId: mystery[0],
      detail:
        mystery[1] === 0
          ? `Nobody ever pinned an answer on ${name(mystery[0])}.`
          : `${name(mystery[0])} slipped through all but ${mystery[1]}.`,
    });
  }

  const knower = top(correctMatches);
  if (knower) {
    out.push({
      key: 'knows_everyone',
      title: 'Knows Everyone',
      playerId: knower[0],
      detail: `${knower[1]} correct call${knower[1] === 1 ? '' : 's'} across the night.`,
    });
  }

  const loved = top(hearts);
  if (loved) {
    out.push({
      key: 'most_loved',
      title: 'Most Loved Answer',
      playerId: loved[0],
      detail: `${loved[1]} heart${loved[1] === 1 ? '' : 's'} for ${name(loved[0])}.`,
    });
  }

  const funny = top(laughs);
  if (funny) {
    out.push({
      key: 'funniest',
      title: 'Funniest Connection',
      playerId: funny[0],
      detail: `${funny[1]} laugh${funny[1] === 1 ? '' : 's'} earned.`,
    });
  }

  if (biggestSurprise) {
    out.push({
      key: 'biggest_surprise',
      title: 'Biggest Surprise',
      playerId: biggestSurprise.authorId,
      detail: `“${biggestSurprise.body}” — and nobody guessed it was ${name(biggestSurprise.authorId)}.`,
    });
  }

  return out;
}

export function finishGame(room: Room): void {
  room.superlatives = computeSuperlatives(room);
  room.phase = 'final';
}

/* ------------------------------------------------------------------ */
/* redaction — the contract the client can never break                 */
/* ------------------------------------------------------------------ */

const IDENTITY_VISIBLE_PHASES = new Set(['reveal', 'tabletalk', 'final', 'complete']);

export function redactRoom(room: Room, viewerId: string): ClientRoom {
  const identityVisible = IDENTITY_VISIBLE_PHASES.has(room.phase);

  const rounds: ClientRound[] = room.rounds.map((round, i) => {
    const isLast = i === room.rounds.length - 1;
    const showIdentity = identityVisible || !isLast;
    const answers = round.answers.map((a) => ({
      id: a.id,
      roundNumber: a.roundNumber,
      body: a.body,
      reactions: a.reactions,
      ...(showIdentity ? { authorId: a.authorId } : {}),
      ...(a.authorId === viewerId ? { mine: true } : {}),
    }));

    const {
      answers: _a,
      matches: _m,
      hand: _h,
      ...rest
    } = round;

    return {
      ...rest,
      answers,
      yourMatches: round.matches.filter((m) => m.guesserId === viewerId),
      ...(isLast && room.phase === 'dealing' && round.dealerId === viewerId
        ? { hand: round.hand }
        : {}),
      submittedCount: round.answers.length,
      matchedCount: new Set(round.matches.map((m) => m.guesserId)).size,
    };
  });

  const { rounds: _r, seed: _s, ...roomRest } = room;
  const last = room.rounds[room.rounds.length - 1];

  return {
    ...roomRest,
    rounds,
    you: { id: viewerId, isDealer: last?.dealerId === viewerId },
  };
}

/** Convenience for tests: every string a client could possibly read. */
export function flattenStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) flattenStrings(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      flattenStrings(v, out);
    }
  }
  return out;
}

export type { Match, Answer };
