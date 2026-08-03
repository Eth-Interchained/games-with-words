/**
 * Deterministic RNG. A whole game replays from (seed, ordered inputs),
 * which is what makes the headless simulation in tests/ meaningful.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function shuffle<T>(rand: () => number, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function weightedPick<T extends { weight: number }>(
  rand: () => number,
  arr: readonly T[],
): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = rand() * total;
  for (const item of arr) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return arr[arr.length - 1];
}

/** Unambiguous join codes: no O/0, no I/1, no S/5. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';

export function makeJoinCode(rand: () => number, length = 4): string {
  let out = '';
  for (let i = 0; i < length; i++) out += pick(rand, CODE_ALPHABET.split(''));
  return out;
}

/**
 * A join code nobody else is holding.
 *
 * The code space is 30^4 = 810,000, which sounds enormous and is not: birthday
 * collisions arrive around a few hundred concurrent rooms, and a collision is
 * not a harmless retry — it would silently steal an existing room's code,
 * making that room unjoinable and walking new players into a stranger's game.
 * So the registry is consulted, not trusted to be sparse.
 *
 * Widens the code by one character after `widenAfter` failures so the function
 * still terminates usefully if the space really is saturated.
 */
export function pickJoinCode(
  rand: () => number,
  isTaken: (code: string) => boolean,
  length = 4,
  attempts = 200,
  widenAfter = 50,
): string {
  for (let i = 0; i < attempts; i++) {
    const width = length + Math.floor(i / widenAfter);
    const code = makeJoinCode(rand, width);
    if (!isTaken(code)) return code;
  }
  // last resort: a code long enough that collision is not a practical concern
  return makeJoinCode(rand, length + 4);
}

export function makeId(rand: () => number, length = 12): string {
  const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += pick(rand, alpha.split(''));
  return out;
}
