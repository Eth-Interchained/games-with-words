/**
 * Scoring.
 *
 * The whole design turns on this file. In a "spot the liar" game you win by
 * blending in, which pushes players toward bland, safe answers. Here you win
 * by being RECOGNIZABLE — the more unmistakably you an answer is, the more
 * people correctly match it to you, and the more you score.
 *
 *   +2  recognized ...... per player who correctly matched your answer to you
 *   +1  read the room ... per correct match YOU made
 *   +1  most loved ...... your answer took the most hearts this round
 *
 * Nobody can be knocked out, nothing is deducted, and the ceiling scales with
 * player count so a big table is not slower to score than a small one.
 */

import type { Answer, Match, Player, RoundScoreLine } from './types.ts';

export const POINTS = {
  RECOGNIZED: 2,
  CORRECT_MATCH: 1,
  MOST_LOVED: 1,
} as const;

export interface ScoreResult {
  lines: RoundScoreLine[];
  /** answerId -> how many players correctly identified its author */
  correctByAnswer: Record<string, number>;
  /** answerId of the most-hearted answer, if any hearts were given */
  mostLovedAnswerId?: string;
}

export function scoreRound(
  players: Player[],
  answers: Answer[],
  matches: Match[],
): ScoreResult {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const correctByAnswer: Record<string, number> = {};
  for (const a of answers) correctByAnswer[a.id] = 0;

  const recognized: Record<string, number> = {};
  const readTheRoom: Record<string, number> = {};
  for (const p of players) {
    recognized[p.id] = 0;
    readTheRoom[p.id] = 0;
  }

  for (const m of matches) {
    const answer = byId.get(m.answerId);
    if (!answer) continue;
    // you cannot score off matching your own answer
    if (answer.authorId === m.guesserId) continue;
    if (answer.authorId === m.guessedAuthorId) {
      correctByAnswer[answer.id] = (correctByAnswer[answer.id] ?? 0) + 1;
      if (recognized[answer.authorId] !== undefined) {
        recognized[answer.authorId] += 1;
      }
      if (readTheRoom[m.guesserId] !== undefined) {
        readTheRoom[m.guesserId] += 1;
      }
    }
  }

  // most loved — hearts only, ties award nobody
  let mostLovedAnswerId: string | undefined;
  let bestHearts = 0;
  let tied = false;
  for (const ans of answers) {
    const hearts = Object.values(ans.reactions).filter(
      (r) => r === 'heart',
    ).length;
    if (hearts > bestHearts) {
      bestHearts = hearts;
      mostLovedAnswerId = ans.id;
      tied = false;
    } else if (hearts === bestHearts && hearts > 0) {
      tied = true;
    }
  }
  if (bestHearts === 0 || tied) mostLovedAnswerId = undefined;

  const lines: RoundScoreLine[] = players.map((p) => {
    const rec = recognized[p.id] * POINTS.RECOGNIZED;
    const read = readTheRoom[p.id] * POINTS.CORRECT_MATCH;
    const loved =
      mostLovedAnswerId && byId.get(mostLovedAnswerId)?.authorId === p.id
        ? POINTS.MOST_LOVED
        : 0;
    return {
      playerId: p.id,
      recognized: rec,
      readTheRoom: read,
      mostLoved: loved,
      total: rec + read + loved,
    };
  });

  return { lines, correctByAnswer, mostLovedAnswerId };
}

/**
 * The Table Talk pick — the answer that most deserves the floor.
 * Priority: the biggest surprise (fewest correct matches), broken by
 * reaction count. If everyone was read perfectly, the most-loved answer
 * gets it instead.
 */
export function pickTableTalk(
  answers: Answer[],
  correctByAnswer: Record<string, number>,
): { answerId: string; reason: 'surprise' | 'loved' | 'first' } | undefined {
  if (answers.length === 0) return undefined;

  const reactionCount = (id: string) =>
    Object.keys(answers.find((a) => a.id === id)?.reactions ?? {}).length;

  const minCorrect = Math.min(
    ...answers.map((a) => correctByAnswer[a.id] ?? 0),
  );
  const surprises = answers.filter(
    (a) => (correctByAnswer[a.id] ?? 0) === minCorrect,
  );

  if (minCorrect === 0 && surprises.length > 0) {
    const best = surprises
      .slice()
      .sort((x, y) => reactionCount(y.id) - reactionCount(x.id))[0];
    return { answerId: best.id, reason: 'surprise' };
  }

  const mostReacted = answers
    .slice()
    .sort((x, y) => reactionCount(y.id) - reactionCount(x.id))[0];
  if (reactionCount(mostReacted.id) > 0) {
    return { answerId: mostReacted.id, reason: 'loved' };
  }
  return { answerId: answers[0].id, reason: 'first' };
}
