# Testing

```bash
npm test
```

Two suites, no test framework, no mocks of anything that matters.

## Suite 1 — engine and server (`tests/run.ts`, 53 checks)

Runs on plain Node with `node:assert`.

| Group | What it proves |
|---|---|
| Word pack | 300 words, 60 per category, unique ids, **no near-duplicates**, family mode excludes weight-3 |
| Dealing | Nine tiles, three per row, never a repeat across 50 seeded deals, same seed deals the same hand |
| Frames | Every frame × every variant renders a real question — no `undefined`, no unresolved placeholder |
| Filter | Ten innocent answers pass untouched; phone/email/address/threat/leetspeak all caught |
| Scoring | Point maths, self-matches score nobody, heart ties award nobody, table-talk selection |
| Redaction | Author ids, hands, seeds, and other players' guesses are all absent from a redacted view |
| Join codes | The allocator never reissues a live code, widens under saturation, avoids O/0/I/1/S/5 |
| Ready-up | Ready state broadcasts to every device, can be taken back, does not gate the launch, and clears on start |
| **Live game** | A real server, four real WebSocket clients, a complete five-round game |

### The one that matters

The live-game test is not a simulation of the protocol — it boots the actual
server on an ephemeral port, opens four real `WebSocket` connections, and plays
a genuine game: host creates, three join by code, the dealer picks tiles,
everybody writes, reactions land, the line-up advances, everybody matches, the
round reveals, and the deck passes. Five times.

While it plays, **every frame every client receives is recorded**. Then:

- no `authorId` appears on a current-round answer before that round revealed
- no client sees the room seed or another player's guesses
- no non-dealer ever receives the nine-tile hand
- a dropped player resumes on their token with score and answers intact
- a forged token is rejected

Reading the redaction function proves nothing. Replaying the transcript does.

It also checks the things that are easy to get quietly wrong: nobody deals twice
in a row, the deck actually moves, non-hosts cannot start the game or change
settings, and a bad join code is refused.

## Suite 2 — pass and play (`tests/passandplay.test.mjs`, 13 checks)

Loads the **built** `dist-static/pass-and-play.html` into jsdom with scripts
enabled and plays a complete three-round, four-player game by dispatching real
click events on real buttons: add players, deal tiles, type answers, react,
walk the line-up, match every card, reveal, table talk, next round, final
standings, play again.

It asserts screens render, buttons enable and disable at the right moments,
standings are sorted and numeric, and **nothing threw** for the whole game.

It also proves the feel layer degrades: jsdom supports neither `AudioContext`
nor canvas 2d, so every sound and the confetti finale are refused by the
platform — and the game still reaches its final screen. Those refusals are
counted separately from real faults, so the suite can assert both "the platform
refused" and "nothing broke". That distinction found a real bug: `getContext`
**throws** on some locked-down platforms rather than returning null.

This is why the single-device build is not shipped on faith.

## What is proven here, and what is not

**Proven in CI, by execution:**

- the rules, the scoring, the word pack, the filter
- the server's authority and its redaction contract, over real sockets
- reconnection and token forgery
- the pass-and-play UI, end to end, in a real DOM
- a clean production build and a clean `tsc --noEmit`

**Not proven — only a phone can:**

- whether a QR code scans across a lit room at arm's length
- thumb reach and tap targets on a 6.7" screen, one-handed
- iOS safe-area behaviour and the on-screen keyboard covering the answer box
- a real network drop — elevator, tunnel, wifi handoff — mid-round
- whether 60 seconds is actually the right writing window with real people
- whether the room laughs

## On-device test plan

Run these with three or more real phones. Each has an explicit pass condition.

| # | Do this | Passes if |
|---|---|---|
| 1 | Host on phone A, scan the QR with phone B's camera app | B lands in the lobby with the code prefilled; only a nickname is asked for |
| 2 | Join from phone C by typing the 4-character code | C appears in A's lobby within a second |
| 3 | Start with 3 players, dealer picks 3 tiles | B and C see the words and question at the same moment |
| 4 | All three write and submit | Phase moves to line-up **as soon as the last one submits**, not on the timer |
| 5 | Let the timer expire with one player not writing | That player gets `(ran out of time)` and the round continues |
| 6 | Put phone B in airplane mode during matching, then back on | B reconnects into the current phase with its score intact |
| 7 | Force-quit the app on C and reopen it | C resumes into the game, not the home screen |
| 8 | Host adds the app to the home screen and reopens | Launches full-screen, no browser chrome, notch handled |
| 9 | Complete a 3-round game | Final screen shows superlatives, sorted standings, confetti |
| 10 | Play a round with 8 players | Matching is still usable without excessive scrolling |
| 11 | Tap ready on B and C, watch A | A's ready dots fill in live without a refresh |
| 12 | Host launches with one player not ready | Game starts; button read `Launch anyway` |
| 13 | Mute from the top bar, play a round, reopen the app | Still muted after relaunch |

**Report anything in column 2 that felt wrong even if column 3 passed.** A
correct screen that confused someone is a bug in the screen, not in the person.

## Known gap

The multiplayer **React** client has no headless test of its own. Its server is
fully covered and its screens mirror the pass-and-play build, which is covered —
but the React components themselves are verified only by `tsc --noEmit`, a
clean production build, and manual play.

Closing that gap means a jsdom render of `<App/>` against a mock socket. It is
the top item on the list.
