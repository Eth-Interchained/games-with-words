/**
 * Games with Words — shared domain types.
 *
 * These types are consumed by BOTH the authoritative server and the client.
 * Anything the client must never see before a reveal lives in `PrivateRound`
 * and is stripped by `redactRoom()` in engine.ts.
 */

export type WordCategory =
  | 'people'
  | 'places'
  | 'objects'
  | 'moments'
  | 'feelings';

export interface Word {
  /** stable id, kebab-case of text */
  id: string;
  text: string;
  category: WordCategory;
  /** 1 = light//easy, 2 = reflective, 3 = tender. Core deck caps at 2. */
  weight: 1 | 2 | 3;
}

/** The prompt frame turns three words into an actual question. */
export type FrameId =
  | 'memory'
  | 'person'
  | 'connect'
  | 'advice'
  | 'truth'
  | 'finish';

export interface Frame {
  id: FrameId;
  /** Short label shown on the round header, e.g. "Who comes to mind" */
  label: string;
  /** The question every player answers. May interpolate {a} {b} {c}. */
  question: (words: Trio) => string;
  /** Gentle nudge shown behind the "Need a nudge?" button. */
  nudge: string;
  /** Relative likelihood of being dealt. */
  weight: number;
}

export type Trio = [Word, Word, Word];

export type Phase =
  | 'lobby'
  | 'dealing'   // dealer picks 3 of 9
  | 'writing'   // everyone answers
  | 'lineup'    // answers shown one at a time, anonymous, reactions open
  | 'matching'  // players pair answers -> authors
  | 'reveal'    // authors revealed, points awarded
  | 'tabletalk' // one answer gets the floor, no timer
  | 'final'     // superlatives + standings
  | 'complete';

export type Reaction = 'heart' | 'laugh' | 'eyes';

export interface Player {
  id: string;
  nickname: string;
  /** deterministic avatar seed -> color + shape on the client */
  avatarSeed: string;
  connected: boolean;
  joinedAt: number;
  score: number;
  roundsDealt: number;
  isHost: boolean; // room owner (created the room), NOT the round dealer
  /** lobby ready signal — advisory, the host can launch regardless */
  ready: boolean;
}

export interface Answer {
  id: string;
  roundNumber: number;
  /** SERVER ONLY until reveal. */
  authorId: string;
  body: string;
  submittedAt: number;
  /** reactorId -> reaction */
  reactions: Record<string, Reaction>;
}

/** One player's guess that `answerId` was written by `guessedAuthorId`. */
export interface Match {
  guesserId: string;
  answerId: string;
  guessedAuthorId: string;
}

export interface RoundScoreLine {
  playerId: string;
  /** +2 per person who correctly identified this player's answer */
  recognized: number;
  /** +1 per correct match this player made */
  readTheRoom: number;
  /** +1 if their answer took the most hearts */
  mostLoved: number;
  total: number;
}

export interface Round {
  number: number;
  dealerId: string;
  /** the nine tiles offered to the dealer (public once dealt) */
  hand: Word[];
  words?: Trio;
  frameId?: FrameId;
  question?: string;
  answers: Answer[];
  matches: Match[];
  /** answer id chosen for the Table Talk moment */
  tableTalkAnswerId?: string;
  tableTalkReason?: 'surprise' | 'loved' | 'first';
  scores: RoundScoreLine[];
  /** ms epoch the writing window closes; server is authoritative */
  writingDeadline?: number;
  lineupIndex: number;
}

export type RotationMode = 'reader' | 'clockwise' | 'random';

export interface RoomSettings {
  totalRounds: number;
  /** seconds allowed to write an answer */
  writingSeconds: number;
  rotation: RotationMode;
  /** stricter language filtering + weight-1/2 words only */
  familyMode: boolean;
  packId: string;
}

export interface Superlative {
  key: string;
  title: string;
  playerId: string;
  detail: string;
}

export interface Room {
  id: string;
  joinCode: string;
  phase: Phase;
  players: Player[];
  ownerId: string;
  settings: RoomSettings;
  roundNumber: number;
  rounds: Round[];
  superlatives: Superlative[];
  createdAt: number;
  expiresAt: number;
  /** rng seed so a whole game is replayable from (seed, inputs) */
  seed: number;
}

/** What a given client is actually allowed to see. */
export interface ClientRoom extends Omit<Room, 'rounds' | 'seed'> {
  rounds: ClientRound[];
  you: { id: string; isDealer: boolean };
}

export interface ClientAnswer {
  id: string;
  roundNumber: number;
  body: string;
  reactions: Record<string, Reaction>;
  /** present ONLY at/after reveal */
  authorId?: string;
  /** whether *you* wrote it — safe to send early, you already know */
  mine?: boolean;
}

export interface ClientRound
  extends Omit<Round, 'answers' | 'matches' | 'hand'> {
  answers: ClientAnswer[];
  /** only your own matches come back to you */
  yourMatches: Match[];
  /** the dealer's nine tiles — only sent to the dealer during `dealing` */
  hand?: Word[];
  /** how many players have submitted, for the waiting indicator */
  submittedCount: number;
  matchedCount: number;
}
