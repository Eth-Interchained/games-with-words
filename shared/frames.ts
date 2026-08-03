/**
 * Prompt frames — the actual conversation engine.
 *
 * Three words on their own are a word-association test. A frame turns them
 * into a question a person has an answer to. The frames are weighted so the
 * two strongest conversation starters (memory, person) come up most.
 */

import type { Frame, FrameId, Trio } from './types.ts';

const a = (w: Trio) => w[0].text;
const b = (w: Trio) => w[1].text;
const c = (w: Trio) => w[2].text;

export const FRAMES: Frame[] = [
  {
    id: 'memory',
    label: 'What it brings back',
    weight: 3,
    question: () => 'What do these three words make you remember?',
    nudge:
      'A specific moment beats a general one. Where were you? Who else was there?',
  },
  {
    id: 'person',
    label: 'Who comes to mind',
    weight: 3,
    question: () => 'Who do these three words make you think of, and why?',
    nudge:
      'A first name, a nickname, or "my neighbor" all work. The why is the good part.',
  },
  {
    id: 'connect',
    label: 'Connect all three',
    weight: 2,
    question: (w) => `Put ${a(w)}, ${b(w)} and ${c(w)} in one sentence.`,
    nudge: 'True, half-true, or completely made up — all fair.',
  },
  {
    id: 'advice',
    label: 'Turn it into advice',
    weight: 2,
    question: () => 'Turn these three words into a piece of advice.',
    nudge: 'Real advice or terrible advice. Both score.',
  },
  {
    id: 'truth',
    label: 'Which one is you',
    weight: 2,
    question: (w) =>
      `Which is most you right now — ${a(w)}, ${b(w)} or ${c(w)}? Say why.`,
    nudge: 'Pick one and commit. The reason matters more than the pick.',
  },
  {
    id: 'finish',
    label: 'Finish the thought',
    weight: 1,
    question: (w) => `Finish it: "${a(w)} is where I learned ______."`,
    nudge: 'Any ending works. Funny endings work especially well.',
  },
];

const FINISH_TEMPLATES: ((w: Trio) => string)[] = [
  (w) => `Finish it: "${a(w)} is where I learned ______."`,
  (w) => `Finish it: "You never forget the ${b(w).toLowerCase()} that ______."`,
  (w) => `Finish it: "In my family, ${a(w).toLowerCase()} always means ______."`,
  (w) => `Finish it: "${c(w)} is easier when ______."`,
  (w) => `Finish it: "I still owe someone a ${b(w).toLowerCase()} for ______."`,
];

export const FRAMES_BY_ID: Record<FrameId, Frame> = Object.fromEntries(
  FRAMES.map((f) => [f.id, f]),
) as Record<FrameId, Frame>;

/** Resolve a frame + trio into the concrete question string. */
export function questionFor(
  frameId: FrameId,
  words: Trio,
  variant = 0,
): string {
  if (frameId === 'finish') {
    return FINISH_TEMPLATES[variant % FINISH_TEMPLATES.length](words);
  }
  return FRAMES_BY_ID[frameId].question(words);
}

/** Every answer is always allowed to be invented. This line is load-bearing. */
export const PERMISSION_LINE =
  'True, fictional, or somewhere in between — always allowed.';
