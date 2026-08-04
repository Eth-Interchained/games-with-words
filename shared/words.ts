/**
 * Core Connections — the launch word pack.
 *
 * 300 words, 60 per category. Curation rules (see docs/CONTENT.md):
 *   - politically and religiously neutral
 *   - works for biological family, chosen family, roommates, coworkers
 *   - never requires disclosing anything private
 *   - every word must be able to produce either a laugh or a real answer
 *
 * weight 1 = light, always safe, funny is easy
 * weight 2 = reflective, invites a real answer
 * weight 3 = tender; excluded from family mode and from the default deck mix
 */

import type { Word, WordCategory } from './types.ts';

function mk(category: WordCategory, entries: [string, 1 | 2 | 3][]): Word[] {
  return entries.map(([text, weight]) => ({
    id: text.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    text,
    category,
    weight,
  }));
}

export const PEOPLE = mk('people', [
  ['Cousin', 1], ['Neighbor', 1], ['Teacher', 1], ['Parent', 2],
  ['Friend', 1], ['Sibling', 2], ['Grandparent', 2], ['Teammate', 1],
  ['Stranger', 1], ['Guest', 1], ['Roommate', 1], ['Coach', 1],
  ['Classmate', 1], ['Mentor', 2], ['Babysitter', 1], ['Rival', 1],
  ['Partner', 2], ['Family', 2], ['Relative', 1], ['The elder', 2],
  ['The youngest', 1], ['The oldest', 1], ['Namesake', 2], ['Visitor', 1],
  ['The regular', 1], ['Newcomer', 1], ['Best friend', 2], ['Pen pal', 1],
  ['Group chat', 1], ['Ancestor', 2], ['In-laws', 1], ['Chosen family', 2],
  ['Old friend', 2], ['New friend', 1], ['Childhood friend', 2],
  ['Work friend', 1], ['Long-distance friend', 2], ['The quiet one', 1],
  ['The loud one', 1], ['The peacemaker', 2], ['The planner', 1],
  ['Always late', 1], ['Someone who raised you', 3], ['Someone you trust', 2],
  ['The family dog', 1], ['The family cat', 1], ['Bus driver', 1],
  ['Barber', 1], ['Librarian', 1], ['The neighbor kid', 1],
  ['Shopkeeper', 1], ['The host', 1], ['Guest of honor', 1],
  ['Whoever cooks', 1], ['Whoever drives', 1], ['The storyteller', 1],
  ['The referee', 1], ['The one who calls', 2], ['Everybody', 1],
  ['Nobody', 1],
]);

export const PLACES = mk('places', [
  ['Kitchen', 1], ['Porch', 1], ['School', 1], ['Car', 1],
  ['Backyard', 1], ['Airport', 1], ['Restaurant', 1], ['Beach', 1],
  ['Living room', 1], ['Hometown', 2], ['Basement', 1], ['Attic', 1],
  ['Garage', 1], ['Driveway', 1], ['Front steps', 1], ['Hallway', 1],
  ['Dining table', 2], ['Couch', 1], ['Garden', 1], ['Park', 1],
  ['Playground', 1], ['Library', 1], ['Grocery store', 1], ['Diner', 1],
  ['Bus stop', 1], ['Train station', 1], ['Hotel', 1], ['Campsite', 1],
  ['Lake', 1], ['River', 1], ['Mountain', 1], ['The city', 1],
  ['Small town', 2], ['Countryside', 1], ['Farm', 1], ['Cabin', 1],
  ['Rooftop', 1], ['Balcony', 1], ['Sidewalk', 1], ['Corner store', 1],
  ['Barbershop', 1], ['Salon', 1], ['Gym', 1], ['The field', 1],
  ['The court', 1], ['Pool', 1], ['Treehouse', 1], ['Blanket fort', 1],
  ['The old house', 2], ['New place', 2], ['Apartment', 1], ['Dorm', 1],
  ['Office', 1], ['Waiting room', 1], ['Highway', 1], ['Back road', 1],
  ['Parking lot', 1], ['Doorstep', 1], ['The old neighborhood', 2],
  ['Anywhere else', 1],
]);

export const OBJECTS = mk('objects', [
  ['Photograph', 2], ['Key', 1], ['Letter', 2], ['Recipe', 2],
  ['Phone', 1], ['Gift', 1], ['Chair', 1], ['Jacket', 1],
  ['Book', 1], ['Ticket', 1], ['Blanket', 1], ['Mug', 1],
  ['Wooden spoon', 1], ['Cookbook', 1], ['Photo album', 2], ['Mixtape', 2],
  ['Playlist', 1], ['Camera', 1], ['Suitcase', 1], ['Backpack', 1],
  ['Bicycle', 1], ['Wallet', 1], ['Ring', 2], ['Necklace', 1],
  ['Watch', 1], ['Shoes', 1], ['Sweater', 1], ['Hat', 1],
  ['Umbrella', 1], ['Map', 1], ['Compass', 1], ['Journal', 2],
  ['Postcard', 1], ['Envelope', 1], ['The junk drawer', 1], ['Shelf', 1],
  ['Fridge door', 1], ['Lamp', 1], ['Candle', 1], ['Window', 1],
  ['Front door', 1], ['Fence', 1], ['Mailbox', 1], ['Swing', 1],
  ['Ladder', 1], ['Toolbox', 1], ['Guitar', 1], ['Piano', 1],
  ['A ball', 1], ['Deck of cards', 1], ['Board game', 1], ['Puzzle', 1],
  ['Stuffed animal', 2], ['Report card', 1], ['Leftovers', 1],
  ['The good plates', 1], ['Spare change', 1], ['Grocery list', 1],
  ['Handwriting', 2], ['A voicemail', 2],
]);

export const MOMENTS = mk('moments', [
  ['Sunday', 1], ['Birthday', 1], ['Reunion', 2], ['Morning', 1],
  ['Goodbye', 2], ['Vacation', 1], ['Dinner', 1], ['Holiday', 1],
  ['First day', 2], ['Late night', 1], ['Last day', 2], ['Graduation', 2],
  ['Moving day', 2], ['Road trip', 1], ['Sleepover', 1], ['Snow day', 1],
  ['Summer', 1], ['Sunrise', 1], ['Sunset', 1], ['Midnight', 1],
  ['The weekend', 1], ['Anniversary', 2], ['Coming home', 2],
  ['Leaving', 2], ['Waiting', 1], ['Promise', 2], ['Advice', 2],
  ['Forgive', 3], ['Remember', 2], ['Celebrate', 1], ['Call', 1],
  ['Listen', 2], ['Share', 1], ['Return', 2], ['Choose', 2],
  ['Apologize', 2], ['Teach', 1], ['Learn', 1], ['Stay', 2],
  ['Arrive', 1], ['Visit', 1], ['Surprise', 1], ['Invite', 1],
  ['Cook', 1], ['Drive', 1], ['Walk', 1], ['Sing', 1],
  ['Dance', 1], ['Laugh', 1], ['Hug', 1], ['Wave', 1],
  ['Show up', 2], ['Try again', 2], ['Start over', 2], ['Grow up', 2],
  ['Halftime', 1], ['The long way', 1], ['One more', 1],
  ['Every year', 2], ['Just once', 1],
]);

export const FEELINGS = mk('feelings', [
  ['Trust', 2], ['Courage', 2], ['Patience', 2], ['Pride', 2],
  ['Kindness', 1], ['Distance', 2], ['Loyalty', 2], ['Curiosity', 1],
  ['Comfort', 1], ['Awkwardness', 1], ['Belonging', 2], ['Warmth', 1],
  ['Safety', 2], ['Freedom', 2], ['Stubbornness', 1], ['Honesty', 2],
  ['Generosity', 1], ['Forgiveness', 3], ['Gratitude', 2], ['Hope', 2],
  ['Worry', 2], ['Nostalgia', 2], ['Relief', 1], ['Joy', 1],
  ['Silliness', 1], ['Mischief', 1], ['Calm', 1], ['Chaos', 1],
  ['Ambition', 1], ['Humility', 2], ['Grit', 1], ['Softness', 2],
  ['Fairness', 1], ['Respect', 2], ['Understanding', 2], ['Effort', 1],
  ['Timing', 1], ['Luck', 1], ['Tradition', 2], ['Change', 2],
  ['Growth', 2], ['Closeness', 2], ['Quiet', 1], ['Noise', 1],
  ['Rhythm', 1], ['Balance', 1], ['Boundaries', 2], ['Openness', 2],
  ['Privacy', 1], ['Reliability', 1], ['Spontaneity', 1], ['Discipline', 1],
  ['Playfulness', 1], ['Wonder', 1], ['Acceptance', 2], ['Encouragement', 1],
  ['Devotion', 2], ['Tenderness', 3], ['Second chances', 2], ['Inside jokes', 1],
]);

export const CORE_PACK: Word[] = [
  ...PEOPLE,
  ...PLACES,
  ...OBJECTS,
  ...MOMENTS,
  ...FEELINGS,
];

export const PACKS: Record<string, { id: string; name: string; words: Word[] }> = {
  core: { id: 'core', name: 'Core Connections', words: CORE_PACK },
};

export function packFor(packId: string, familyMode: boolean): Word[] {
  const pack = PACKS[packId] ?? PACKS.core;
  return familyMode ? pack.words.filter((w) => w.weight <= 2) : pack.words;
}
