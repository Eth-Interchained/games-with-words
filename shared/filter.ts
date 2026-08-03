/**
 * Lightweight content safety for submitted answers.
 *
 * Deliberately conservative in scope: this is a party game for a room of
 * people who already know each other, not a public network. The filter's job
 * is to catch the obvious stuff and to stop people pasting phone numbers and
 * addresses into a shared screen — not to police tone.
 *
 * Operators can extend BLOCKED_TERMS for their own deployment; see
 * docs/CONTENT.md.
 */

export type FilterVerdict =
  | { ok: true; body: string }
  | { ok: false; reason: string; category: FilterCategory };

export type FilterCategory =
  | 'empty'
  | 'too_long'
  | 'blocked_term'
  | 'threat'
  | 'contact_info'
  | 'link';

export const MAX_ANSWER_LENGTH = 180;
export const MIN_ANSWER_LENGTH = 2;

/**
 * Base blocklist. Kept short and obvious on purpose — long automated lists
 * generate false positives ("Scunthorpe problem") which are worse than the
 * misses, because a filter that rejects an innocent answer teaches players
 * the game is broken.
 */
const BLOCKED_TERMS: string[] = [
  // slurs / hate — matched on word boundaries
  'n1gger', 'nigger', 'faggot', 'retard', 'tranny', 'chink', 'spic', 'kike',
  // explicit sexual
  'blowjob', 'handjob', 'creampie', 'cumshot', 'porn', 'pornhub', 'dildo',
  'masturbat', 'bukkake',
];

const THREAT_PATTERNS: RegExp[] = [
  /\bi(?:'m| am| will|'ll)?\s+(?:going to\s+)?(?:kill|murder|stab|shoot)\s+you\b/i,
  /\bkill\s+your(?:self|selves)\b/i,
  /\bi\s+hope\s+you\s+die\b/i,
];

const CONTACT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, label: 'a phone number' },
  { re: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, label: 'an email address' },
  { re: /\b\d{3}-\d{2}-\d{4}\b/, label: 'a social security number' },
  { re: /\b\d{1,5}\s+[A-Za-z0-9.\s]{3,30}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way)\b/i, label: 'a street address' },
  { re: /\b(?:\d[ -]?){13,16}\b/, label: 'a card number' },
];

const LINK_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // collapse common letter substitutions so "f4ggot" is caught
    .replace(/[4@]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[!1|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's');
}

export function filterAnswer(
  raw: string,
  opts: { familyMode: boolean } = { familyMode: true },
): FilterVerdict {
  const body = raw.replace(/\s+/g, ' ').trim();

  if (body.length < MIN_ANSWER_LENGTH) {
    return { ok: false, reason: 'Write a little more than that.', category: 'empty' };
  }
  if (body.length > MAX_ANSWER_LENGTH) {
    return {
      ok: false,
      reason: `Keep it under ${MAX_ANSWER_LENGTH} characters so it reads fast.`,
      category: 'too_long',
    };
  }

  const norm = normalize(body);
  for (const term of BLOCKED_TERMS) {
    const re = new RegExp(`\\b${term}`, 'i');
    if (re.test(norm)) {
      return {
        ok: false,
        reason: 'That one will not fly in this room.',
        category: 'blocked_term',
      };
    }
  }

  for (const re of THREAT_PATTERNS) {
    if (re.test(body)) {
      return {
        ok: false,
        reason: 'That reads as a threat. Try another angle.',
        category: 'threat',
      };
    }
  }

  for (const { re, label } of CONTACT_PATTERNS) {
    if (re.test(body)) {
      return {
        ok: false,
        reason: `Looks like ${label} — everyone here is about to read this on a shared screen.`,
        category: 'contact_info',
      };
    }
  }

  if (opts.familyMode && LINK_PATTERN.test(body)) {
    return {
      ok: false,
      reason: 'No links in family mode.',
      category: 'link',
    };
  }

  return { ok: true, body };
}

export function filterNickname(raw: string): FilterVerdict {
  const body = raw.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (body.length < 1) {
    return { ok: false, reason: 'Pick a name.', category: 'empty' };
  }
  const norm = normalize(body);
  for (const term of BLOCKED_TERMS) {
    if (new RegExp(`\\b${term}`, 'i').test(norm)) {
      return { ok: false, reason: 'Pick a different name.', category: 'blocked_term' };
    }
  }
  return { ok: true, body };
}
