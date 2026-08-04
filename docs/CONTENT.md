# Content policy and word packs

## The launch pack: Core Connections

300 words, 60 in each of five categories.

| Category | Examples |
|---|---|
| `people` | Cousin, Neighbor, The peacemaker, Chosen family, Whoever cooks |
| `places` | Kitchen, Porch, Back road, The old neighborhood, Blanket fort |
| `objects` | Photograph, Recipe, Mixtape, The junk drawer, Handwriting |
| `moments` | Sunday, Moving day, Show up, Try again, One more |
| `feelings` | Trust, Stubbornness, Awkwardness, Second chances, Inside jokes |

## Curation rules

Every word in an official pack must be:

- **politically and religiously neutral** — no word that sorts a table into camps
- **structure-agnostic** — works for biological family, chosen family, step-family,
  roommates, coworkers, and people with no family they want to discuss
- **answerable without disclosure** — never requires revealing anything private
- **capable of humour or sincerity** — a word that can only produce one register
  makes a monotonous round

And must never involve sexual content, graphic violence, or direct medical or
financial pressure.

### Flexible over specific

The core deck prefers `Parent` over *mother*/*father*, `Partner` over
*husband*/*wife*, `Someone who raised you` over any particular relation.
Specific kinship terms are legitimate — they just belong in an optional pack a
room opts into, not in the deck a stranger's family gets by default.

### Emotional weight

| Weight | Meaning | In family mode |
|---|---|---|
| 1 | Light. Funny is easy. | included |
| 2 | Reflective. Invites a real answer. | included |
| 3 | Tender. *Forgive*, *Tenderness*, *Someone who raised you*. | **excluded** |

Family mode is on by default, so weight-3 words never appear unless a room
turns it off deliberately.

### No near-duplicates

`Ladder` and `A ladder` are two tiles that produce one word. `Surprise` in both
*moments* and *feelings* can be dealt twice into the same nine-tile hand.

Both of those were real bugs, caught by tests, on the first run of the suite.
Two checks now guard the pack permanently: unique ids, and no two words that
collapse to the same string once a leading *a*/*the* is stripped.

## Adding a pack

```ts
// shared/words.ts
export const PACKS = {
  core: { id: 'core', name: 'Core Connections', words: CORE_PACK },
  yours: { id: 'yours', name: 'Your Pack', words: YOUR_WORDS },
};
```

Then set `packId` in room settings. `packFor()` handles the family-mode filter
and falls back to `core` for an unknown id rather than throwing.

A pack needs at least 3 words in `moments`, 3 in `feelings`, and 3 across
`people`/`places`/`objects` to deal a legal hand. In practice aim for 40+ per
category or hands start repeating within a single game.

---

## The answer filter

`shared/filter.ts` runs on every submitted answer, server-side.

| Category | Behaviour |
|---|---|
| `empty` / `too_long` | Under 2 or over 180 characters |
| `blocked_term` | Short list of slurs and explicit sexual terms, matched after normalising common letter substitutions (`f4ggot`, `r3tard`) |
| `threat` | Direct threats of violence, matched as phrases |
| `contact_info` | Phone numbers, emails, street addresses, SSNs, card numbers |
| `link` | URLs — family mode only |

### Why the blocklist is short

Long automated blocklists generate false positives, and **a false positive is
worse than a miss**. A filter that rejects "my uncle lived in Scunthorpe"
teaches the table that the app is broken, and they stop trusting it. A filter
that misses one edgy joke costs nothing — the room is full of people who know
each other and can handle it socially.

So the test suite spends more effort on false positives than on catching bad
input: ten innocent answers, including ones containing numbers, currency,
apostrophes, and the Scunthorpe problem itself, must all pass untouched.

Operators who need a stricter deployment should extend `BLOCKED_TERMS` and add
their own cases to the innocent-answers list at the same time.

### Contact info is not about profanity

The address and phone patterns exist because answers are read aloud off a
shared screen by a room of people. That is a different threat model from a
public feed, and it is the one the game actually has.

## Data retention

Rooms live in memory only. Nothing is written to disk, no answers are
persisted, and a room is destroyed when the last player disconnects or six
hours after it was created, whichever comes first.

There is no account system and no analytics.
