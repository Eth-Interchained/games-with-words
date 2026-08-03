# Games with Words — Specification v1.0

**Status:** implemented, shipped, unplayed by strangers
**Repo:** `Eth-Interchained/games-with-words` (PR #1)
**Author:** Vex, for M
**Audience:** the Oracle — read this adversarially

---

## 0. How to read this document

This is not a pitch. It is a spec written to be **attacked**.

Section 2 states a design thesis that the entire product rests on. If that
thesis is wrong, the game is a worse version of Fibbage and should be rebuilt,
not tuned. Sections 3–8 are normative: they describe what is actually
implemented, not what is aspired to. Section 9 is an honest ledger separating
what has been *proven by execution* from what is merely *believed*. Section 10
is the part I actually want from you — eleven specific challenges, several of
which I suspect have real answers I have not found.

Where I am confident, I say so plainly. Where I am guessing, I mark it
**[ASSUMED]**. Where I know something is broken or unmeasured, I mark it
**[GAP]**. Do not let a confident tone anywhere in this document substitute for
evidence; if a claim lacks a citation to a test or a measurement, treat it as an
opinion I hold, not a fact I have established.

---

## 1. The product in one page

A mobile-first party game for **3–10 people who already know each other**.
Family at a table, friends on a couch, a team at an offsite.

A round:

1. One player — the **dealer** — receives nine word tiles and picks any three.
2. The app pairs those three words with a **prompt frame**, producing a real
   question: *"What do these three words make you remember?"*
3. **Everybody** answers it, dealer included. ~60s, 180 characters.
4. Answers appear **anonymously**, one at a time. The room reacts.
5. Each player privately **matches every answer to a person**. One name per card.
6. Reveal. Points land.
7. **Table Talk** — the app selects the answer nobody guessed, puts it
   full-screen with its author's name, and stops. No timer.

Then the deck passes to whoever read the room best.

Two builds, one engine: an installable web app for multi-device play over
WebSocket, and a single 49 kB self-contained HTML file for one phone passed
around a table. Both import the same rules modules.

**The tagline is the design brief:** *Three words. Everyone has a different
story.*

---

## 2. The design thesis

### 2.1 The rejected design

The original brief specified a hidden-role mechanic: a Host secretly knows what
connects the three words, everyone else writes a plausible answer, and the room
votes on which answer belongs to the Host. Points for the Host if nobody finds
them.

I rejected it. The argument:

> **In a hidden-role game, the dominant strategy is to blend in.**
>
> If the Host scores by not being found, the Host writes something unremarkable.
> If other players score by being mistaken for the Host, they also write
> something unremarkable. The Nash equilibrium of "spot the impostor" is a table
> of interchangeable, low-information answers.
>
> Interchangeable answers are precisely the answers nobody wants to ask a
> follow-up question about. The mechanic that makes the deduction interesting is
> the same mechanic that makes the conversation impossible.

The brief asked for a conversation starter. A conversation starter cannot have
camouflage as its optimal strategy.

### 2.2 The inversion

Keep the anonymity and the deduction. Invert what deduction rewards.

> **+2 points for every person who correctly identifies your answer as yours.**

Now the dominant strategy is to be **maximally recognizable** — to write the
thing you, specifically, would say. The highest-scoring answer in the room is
the most characteristic one.

Three consequences follow, and the third is the point:

1. **Players write honestly** because honesty is optimal, not because they were
   asked nicely to.
2. **Nobody is an adversary.** There is no impostor to catch, no one to deceive.
   You are being *read*, and being read correctly is a reward.
3. **The wrong guesses become the content.** When you thought Marisa wrote the
   one about the kitchen and it was actually Devon, that gap is a question. *"You
   thought that was me?"* and *"wait — you wrote that?"* are the two sentences
   the entire machine exists to produce.

### 2.3 Table Talk

The mechanic alone does not guarantee a conversation; it guarantees the raw
material. So the game explicitly stops and spends it.

After scoring, the app identifies the answer with the **fewest correct matches**
— the biggest surprise of the round — and presents it full-screen with its
author's name and one line:

> **Nobody saw that coming. [Name], tell us.**

No timer. No points. One button, and only the dealer has it.

Every phase before this one is a machine for finding the single thing in the
room most worth asking about. **[ASSUMED]** — see §10.4, which I consider the
largest product risk in this document.

### 2.4 The permission line

Every writing screen carries:

> *True, fictional, or somewhere in between — always allowed.*

This is load-bearing, not decoration. It is what makes the game playable at a
table with in-laws, new partners, or a coworker you do not want to know your
history. The game never needs anyone to be *honest*; it only needs them to be
*characteristic*, and a person's inventions are as characteristic as their
memories.

It also creates a tension I have not resolved — see §10.6.

---

## 3. Game mechanics (normative)

### 3.1 Constants

| | |
|---|---|
| Players | 3 minimum, 10 maximum |
| Rounds | 3, 5, or 7 — host selects, default 5 |
| Writing window | 45 / 60 / 90 seconds, default 60 |
| Answer length | 2–180 characters |
| Room lifetime | 6 hours, or until the last player disconnects |

### 3.2 Phases

`lobby → dealing → writing → lineup → matching → reveal → tabletalk → …`
then either `dealing` for the next round or `final → complete`.

The **server** owns phase transitions. Clients render; they do not decide.

### 3.3 Lobby

Host opens a room and receives a QR code (rendered server-side to inline SVG)
and a 4-character join code. Others scan, follow a share link, or type the code.
No accounts — a nickname only.

Players tap **I'm ready**; ready dots fill in live on every device. The host
launches whenever they choose. The launch button reads `Launch anyway (3/5)`
when some players have not readied.

**Ready is advisory and deliberately not a gate.** Gating on unanimous ready is
how a party game stalls: one person sets their phone down to get a drink and
four people stare at a locked button. Ready flags clear on start.

### 3.4 Dealing

Nine tiles in three rows:

| Row | Drawn from |
|---|---|
| Something solid | `people`, `places`, `objects` |
| Something that happens | `moments` |
| Something you feel | `feelings` |

The dealer picks **any three**. The rows are a nudge toward a mixed trio, not a
constraint. A hand never contains a duplicate (enforced; §9).

The dealer's pick is the round's fingerprint — two dealers holding identical
tiles build different rounds.

### 3.5 The frame

A trio alone is a word-association test. A frame makes it answerable.

| Frame | Question | Weight |
|---|---|---|
| What it brings back | What do these three words make you remember? | 3 |
| Who comes to mind | Who do these three words make you think of, and why? | 3 |
| Connect all three | Put *X*, *Y* and *Z* in one sentence. | 2 |
| Turn it into advice | Turn these three words into a piece of advice. | 2 |
| Which one is you | Which is most you right now — *X*, *Y* or *Z*? Say why. | 2 |
| Finish the thought | *"X is where I learned ______."* (5 templates) | 1 |

The frame is selected by weighted random draw from the room seed. The first two
carry the highest weight because they reliably produce *stories*; the others
produce *sentences*. **[ASSUMED]** — this weighting is my judgement, unmeasured.

### 3.6 Writing

All players including the dealer. Server owns the deadline (2s grace for
in-flight submissions). The phase closes early the instant the last player
submits — the timer is a ceiling, not a wait.

A player who does not submit gets `(ran out of time)` written on their behalf so
the round still resolves rather than blocking on an absent person.

### 3.7 Line-up

Answers are shuffled (so reading order never leaks submission order) and shown
one at a time, full-screen, anonymous. Any player may react ❤️ / 😂 / 👀 to any
answer except their own. The dealer advances the cards.

### 3.8 Matching

Each player pairs every answer that is not theirs with a name. **A name can sit
on only one card**, so with *n* players this is a genuine (*n*−1)-way bijection
puzzle, not (*n*−1) independent guesses. Getting one right constrains the rest,
which makes the reveal cascade.

Reveal fires when the last player locks in, or when the dealer closes it.

### 3.9 Reveal

Cards turn over one at a time, ~620 ms apart, each with its verdict: a rising
two-note chime if you called it, a descending tone if you did not. Then the
round's score lines.

### 3.10 Passing the deck

Default rotation `reader`: the next dealer is whoever made the most correct
matches this round. Ties broken by fewest rounds dealt, then earliest join.
Nobody deals twice in a row while an alternative exists. `clockwise` and
`random` are also available.

Rationale: dealing should feel earned, and the deck should sit with the person
currently most tuned in to the table. **[ASSUMED]** — see §10.3.

### 3.11 The final word

Superlatives computed from real activity, not from the points column:

| Award | Basis |
|---|---|
| Easiest to Read | most often correctly identified |
| Total Mystery | least often |
| Knows Everyone | most correct matches across the game |
| Most Loved Answer | most ❤️ |
| Funniest Connection | most 😂 |
| Biggest Surprise | the unguessed answer with the most reactions, quoted |

Standings are shown. They are deliberately **not** the last thing on screen.

---

## 4. Scoring

### 4.1 The rules

| Award | Points | Condition |
|---|---|---|
| Recognized | **+2** each | per player who correctly matched your answer to you |
| Read the room | **+1** each | per correct match you made |
| Most loved | **+1** | your answer took the most ❤️ that round; a tie awards nobody |

Nothing is ever deducted. Nobody is eliminated. Matching your own answer scores
nobody (guarded, tested).

### 4.2 The mathematics, and a property worth arguing about

For *n* players, per round:

- Max **recognized** per player: `2(n−1)`
- Max **read the room** per player: `(n−1)`
- Each correct match injects **3 points** into the table: 2 to the author, 1 to
  the guesser.
- Total points available: `3n(n−1) + 1`

| n | max recognized | max read | max personal | table total |
|---|---|---|---|---|
| 3 | 4 | 2 | 6 | 19 |
| 4 | 6 | 3 | 9 | 37 |
| 6 | 10 | 5 | 15 | 91 |
| 8 | 14 | 7 | 21 | 169 |

Now the property I want you to look at hard:

> **If every player matches every answer correctly, every player scores exactly
> `3(n−1)` — a perfect tie.**
>
> If nobody matches anything correctly, everyone scores 0 — also a perfect tie.
>
> Score variance is therefore **maximised at intermediate mutual knowledge** and
> collapses to zero at both extremes.

Two readings, and I genuinely do not know which is correct:

- **It is a feature.** A group that reads each other perfectly has *won together*;
  a flat scoreboard is the honest report of that, and the superlatives (which do
  not tie) carry the ending. The game is a conversation engine and the score is
  a garnish.
- **It is a defect.** A family that plays weekly converges on mutual legibility,
  the scoreboard stops discriminating by round 3 of night 4, and the game
  quietly loses its spine. Competitive players notice this before I do.

See §10.1. This is the sharpest open question in the document.

### 4.3 Worked example

Four players. Maya, Jordan, Chris, Devon.
Words: **Photograph · Promise · Distance**. Frame: *Who comes to mind*.

Everyone writes. Matching results: Jordan and Chris both correctly identify
Maya's answer. Devon guesses Maya's answer was Chris's. Nobody else is right.
Maya's answer takes 2 hearts, more than any other.

| Player | Recognized | Read the room | Most loved | Total |
|---|---|---|---|---|
| Maya | 2 × 2 = **4** | 0 | **1** | **5** |
| Jordan | 0 | 1 × 1 = **1** | 0 | **1** |
| Chris | 0 | 1 × 1 = **1** | 0 | **1** |
| Devon | 0 | 0 | 0 | **0** |

Jordan and Chris tie on correct matches; Jordan deals next on the earlier-join
tiebreak. Devon's answer had zero correct matches and the most reactions among
the unguessed, so Devon takes Table Talk.

Note what this table demonstrates: **Maya scored 5× Jordan by writing well, not
by guessing well.** That ratio is intentional and is itself challenged in §10.2.

---

## 5. Content system

### 5.1 The pack

**Core Connections** — 300 words, exactly 60 per category: `people`, `places`,
`objects`, `moments`, `feelings`.

Curation rules. Every word must be:

- politically and religiously neutral — no word that sorts a table into camps
- structure-agnostic — works for biological family, chosen family, step-family,
  roommates, coworkers, and people with no family they wish to discuss
- answerable without disclosure
- capable of both humour and sincerity — a word with only one register makes a
  monotonous round

The core deck prefers `Parent` over *mother*/*father*, `Partner` over
*husband*/*wife*, `Someone who raised you` over any specific relation. Specific
kinship terms are legitimate but belong in an opt-in pack, not in the deck a
stranger's family receives by default.

### 5.2 Emotional weight

| Weight | Character | Family mode |
|---|---|---|
| 1 | light, funny is easy | included |
| 2 | reflective, invites a real answer | included |
| 3 | tender — *Forgive*, *Tenderness*, *Someone who raised you* | **excluded** |

Family mode defaults **on**.

### 5.3 The answer filter

Server-side on every submission: length bounds, a short blocklist (slurs and
explicit sexual terms, matched after normalising leetspeak substitutions),
direct-threat phrases, and contact-info patterns (phone, email, street address,
SSN, card number). Links blocked in family mode only.

**The blocklist is deliberately short.** Long automated lists generate false
positives, and a false positive is strictly worse than a miss here: rejecting
*"my uncle lived in Scunthorpe"* teaches the table the app is broken, whereas
missing one edgy joke costs nothing in a room of people who already know each
other and can handle it socially. The test suite accordingly spends more effort
on false positives (ten innocent strings, including numbers, currency,
apostrophes, and the Scunthorpe problem itself) than on true positives.

The contact-info patterns exist for a specific reason: answers are read aloud
off a shared screen. That is a different threat model from a public feed, and it
is the one this game actually has.

---

## 6. Architecture

### 6.1 Shape

One repository, one process, one port. Express serves the built client and the
WebSocket server rides the same HTTP server — a single origin, a single systemd
unit, a single nginx block.

```
shared/     rules engine — I/O-free, deterministic from (seed, ordered inputs)
  types.ts       domain types incl. the client-visible subset
  words.ts       the 300-word pack
  frames.ts      prompt frames
  scoring.ts     scoring, isolated so it is testable alone
  engine.ts      phases, dealing, reveal, superlatives, redaction
  filter.ts      content safety
  rng.ts         seeded RNG, join-code allocation
  protocol.ts    the wire contract
server/     authoritative game server
client/     React PWA + passandplay.ts (single-device build)
tests/      two suites, no framework
```

Node 22+ runs the server's TypeScript directly via native type stripping —
**there is no server build step**. `npm start` is `node server/index.ts`.

### 6.2 Why the engine is I/O-free

Every rule lives in pure functions that take state and return state. Nothing in
`shared/` touches a socket, a disk, or a clock it was not handed. Two payoffs:

1. A whole game replays from `(seed, ordered inputs)`, which is what makes the
   headless suites meaningful rather than decorative.
2. The single-device build imports the *same modules*. Pass-and-play and
   multiplayer cannot drift apart, because there is only one implementation of
   the rules.

### 6.3 Two builds

| | Multiplayer | Pass and play |
|---|---|---|
| Transport | WebSocket | none |
| Client | React, Vite, ~57 kB gzip | vanilla, one 49 kB HTML file |
| Rules | `shared/` | the same `shared/` |
| Install | add to home screen | open the file |

---

## 7. Protocol

### 7.1 Full snapshots, not deltas

The server sends the **entire redacted room** on every state change.

Room state is small — ten players, seven rounds, a few hundred bytes of answers.
Full snapshots make an entire class of desync bug structurally impossible, and a
reconnecting client needs no replay logic: it receives one frame and is correct.
On phone networks that drop and resume constantly, that is worth far more than
the bytes.

### 7.2 Messages

**Client → server:** `join`, `resume`, `settings`, `ready`, `start`,
`choose_words`, `answer`, `react`, `matches`, `advance`, `kick`, `again`, `ping`

**Server → client:** `welcome`, `room`, `error`, `toast`, `pong`

### 7.3 The redaction contract

`redactRoom(room, viewerId)` is the only function permitted to produce
client-facing state. For the **current** round:

| Field | Rule |
|---|---|
| `answers[].authorId` | absent unless phase ∈ {reveal, tabletalk, final, complete} |
| `answers[].mine` | only on your own answer — you already know which is yours |
| `rounds[].hand` | only to the dealer, only during `dealing` |
| `rounds[].matches` | never sent; replaced by `yourMatches`, filtered to you |
| `room.seed` | never sent |

Completed rounds retain author information; there is nothing left to protect.

**Enforcement is by execution, not review.** The live-game test records every
frame every client receives across a full five-round game and sweeps the
transcript for violations. Reading the redaction function proves nothing.

### 7.4 Server authority

The server owns: the writing deadline, the dealer identity, whether a word id
was actually in the dealt hand, match eligibility, all scoring, and every phase
transition. A player running a modified client can send anything; the worst
outcome available to them is an error frame.

### 7.5 Reconnection

Tokens are `roomId.playerId.HMAC-SHA256(body, ROOM_SECRET)`, compared with
`timingSafeEqual`. On reconnect, score, submitted answer, and recorded guesses
survive; the player lands in whatever phase the room has reached and cannot
submit into a closed phase.

Disconnecting from the lobby removes you. Disconnecting mid-game keeps your seat.

### 7.6 Join codes

4 characters from a 30-symbol alphabet with `O/0/I/1/S/5` removed — 810,000
codes. **The allocator consults the live registry rather than trusting the space
to be sparse**, and widens the code after 50 collisions.

This was a real bug, found while writing this document: the original
implementation called `byJoinCode.set()` with no collision check. A collision
would have silently stolen a live room's code — making that room unjoinable and
walking new players into a stranger's game. Birthday collisions arrive around a
few hundred concurrent rooms, not 810,000. Now fixed and covered by three tests.

I am recording it here rather than quietly patching it because it is the exact
class of error this document exists to surface, and because it is evidence for
how much of §9's "assumed" column should be trusted.

---

## 8. Safety and privacy

- No accounts, no analytics, no persistence. Rooms live in memory and are
  destroyed when the last player leaves or after six hours.
- Answers are never written to disk.
- Per-answer hide/report, host can remove a player.
- Contact-info filtering because answers are read aloud off a shared screen.
- The permission line means no prompt ever requires a true disclosure.
- `ROOM_SECRET` must be set in production or a restart invalidates live games.

---

## 9. Evidence ledger

**Proven by execution** — 66 automated checks, no test framework, nothing
important mocked:

| Claim | How |
|---|---|
| Pack integrity: 300 words, 60/category, unique ids, no near-duplicates | assertion over the pack |
| A hand is nine tiles, 3/3/3, never duplicated across 50 seeded deals | assertion |
| Every frame × every variant renders a real question | assertion |
| Filter passes ten innocent strings; catches phone/email/address/threat/leetspeak | assertion |
| Scoring maths, self-match guard, heart-tie behaviour, Table Talk selection | assertion |
| Join-code allocator never reissues a live code, widens under saturation | assertion |
| **No client ever receives an author id before reveal** | real server, 4 real WebSocket clients, 5 real rounds, every frame recorded and swept |
| No client receives the seed, another player's guesses, or a hand it should not | same transcript sweep |
| Ready state broadcasts to every device, is reversible, does not gate launch, clears on start | live game |
| Nobody deals twice in a row; the deck moves | live game |
| A dropped player resumes with score intact; a forged token is rejected | live game |
| The pass-and-play build plays a complete 3-round game | real DOM, real click events |
| The feel layer degrades on a platform with no audio and no canvas | same, asserted explicitly |
| `tsc --noEmit` clean; production build clean | CI-equivalent local run |

**Believed, not proven [ASSUMED]:**

- that the recognizability incentive actually changes what people write
- that Table Talk gets used rather than skipped
- that the frame weighting produces better rounds
- that `reader` rotation feels like a reward
- that 60 seconds is the right writing window
- that matching stays tractable at 8–10 players
- that the filter's false-positive rate is acceptable on natural family talk

**Known gaps [GAP]:**

- The multiplayer **React** client has no headless test. Its server is fully
  covered and its screens mirror the covered pass-and-play build, but the
  components themselves rest on `tsc`, a clean build, and manual play.
- No load testing. Unknown behaviour at many concurrent rooms.
- No accessibility audit. Screen-reader behaviour on the reveal cascade is
  unexamined, and the game leans on colour for ready state and match verdicts.
- Never played by anyone who did not build it.

**Bugs the tests caught on first run** — offered as calibration for how much the
"believed" column is worth:

1. duplicate word id `surprise` (in both `moments` and `feelings`) — could deal
   the same tile twice into one hand
2. near-duplicate `Ladder` / `A ladder` — distinct ids, same word to a player
3. `client/passandplay.ts` was never typechecked; `tsconfig` included only
   `client/src`
4. `canvas.getContext` **throws** rather than returning null on locked-down
   platforms — confetti could have taken the final screen down with it
5. join-code collisions were entirely unhandled (§7.6)

Five real defects. Four of them in code I had already read and believed correct.

---

## 10. Open questions — the part I want from you

Numbered so you can answer selectively.

**10.1 — The convergence-to-tie property (§4.2).** As a group's mutual knowledge
approaches perfect, all scores approach `3(n−1)` and the scoreboard stops
discriminating. Is this a feature of a conversation game or a slow death for a
game a family plays weekly? If it is a defect, what is the minimal fix that does
not reintroduce an incentive to hide? Candidate I have considered and not
implemented: award recognition points on a curve — being read by *some* people
but not all scores highest, rewarding answers that are legible to intimates and
opaque to acquaintances. That feels clever and possibly terrible.

**10.2 — The 2:1 ratio.** Being recognized is worth twice as much as reading
someone. So a player who writes vividly and guesses at random beats a player who
guesses perfectly and writes blandly. That is intentional — writing is the
behaviour I want to reward — but is 2:1 the right number, or should it scale
with *n*? At n=8 the writing-vs-guessing gap is 14 vs 7 points per round, which
may make guessing feel decorative.

**10.3 — Is dealing a prize or a chore?** Rotation hands the deck to the best
reader as a reward. But dealing means picking three words under mild pressure
while everyone waits, and it confers no scoring advantage. It may read as a
penalty for paying attention. Should the dealer get something, or should
rotation be dumb (clockwise) precisely because dealing is not a prize?

**10.4 — Does Table Talk actually happen?** This is the largest product risk in
the document. The entire conversation thesis is spent on one screen with no
timer and no points, and the dealer holds a button labelled *Okay, next*. If
groups reflexively tap through it, the game is a competent matching game with a
vestigial screen. What design pressure makes a room actually stop and talk,
short of a forced delay (which I think would be resented)?

**10.5 — Does matching survive at n=8–10?** With 180 characters and ten people,
are answers distinguishable at all, or does matching collapse into noise —
taking the recognition incentive down with it, since nobody can be recognized if
nobody can tell anyone apart? Is there a player-count band where this game is
actually good, and should the app enforce it rather than advertising 3–10?

**10.6 — Does the permission line undercut the mechanic?** *"True, fictional, or
somewhere in between"* is what makes the game safe. But a table that all writes
fiction is a table where recognizability drops and the conversation does not
happen. Safety and mechanic are in tension and I resolved it in favour of safety
without measuring the cost. Is there a framing that preserves the escape hatch
while keeping honesty the default?

**10.7 — Three players.** At n=3 each player matches only two answers, and the
bijection constraint means getting one right means getting both right. Matching
becomes binary: 0 or 2 correct. Is n=3 actually broken, and should the minimum
be 4?

**10.8 — Does the dealer have a hidden edge?** The dealer picks words that mean
something to *them*, then answers a question built from their own associations.
That plausibly makes their answer more characteristic and therefore more
recognizable — a scoring advantage I did not design and have not measured. Real
effect or noise?

**10.9 — Reactions feed scoring.** Most-loved is +1 and feeds a superlative. Is
any reaction-driven scoring a mistake in a game about people who know each
other? It creates a mild popularity channel orthogonal to the mechanic. I kept
it because it is small; I am not sure small is the same as harmless.

**10.10 — Is the word pack actually neutral?** I applied the rules in §5.1 by
judgement, alone, in one sitting. `Namesake`, `Ancestor`, `In-laws`,
`Someone who raised you`, `Tradition`, `Chosen family` all passed my filter.
Which of these land differently than I think for someone estranged, adopted,
recently bereaved, or from outside a US-centric frame? This is the section where
my blind spots are most likely and least visible to me.

**10.11 — What is the second game?** The engine — seeded deals, framed prompts,
anonymous submission, matching, provenance-clean redaction — is more general
than this game. Is there an obviously better game sitting on the same substrate
that I have failed to see because I anchored on the original brief?

---

## 11. Predicted failure modes

Stated in advance so they can be checked rather than rationalised later.

| # | Failure | Early signal |
|---|---|---|
| 1 | Table Talk is skipped | rounds complete in under 3 minutes |
| 2 | Scores converge to ties with a familiar group | round score spread shrinks each night |
| 3 | Matching is noise at 8+ | correct-match rate near chance (`1/(n−1)`) |
| 4 | Everyone writes fiction | answers stop containing names and places |
| 5 | 60s is too short for *memory* frames, too long for *connect* | timer expiry clusters by frame |
| 6 | Dealing reads as a chore | players decline or rush the pick |
| 7 | Filter false positive in a real family answer | anyone reports a rejected innocent answer |
| 8 | Reveal cascade too slow at n=10 | 10 cards × 620 ms ≈ 6.2 s of watching |

Failure 8 is arithmetic, not speculation, and probably needs the interval to
scale down with player count before a 10-player game ships.

---

## 12. Non-goals

Not trivia — no correct answer exists. Not a personality test — nothing is being
measured about anyone. Not therapy — every prompt is answerable with fiction.
Not a social network — no accounts, no persistence, no feed, and rooms evaporate.

Deferred from v1 by explicit choice: accounts, saved history, public
matchmaking, voice answers, AI-generated packs, spectator mode, monetization.

---

## 13. Roadmap

**Immediate** — the §9 gaps: a jsdom render of `<App/>` against a mock socket;
scale the reveal interval by player count; an accessibility pass on the cascade
and on colour-carried state.

**Next** — opt-in packs (couples, coworkers, kids, and a specific-kinship pack);
measurement instrumentation for the §11 signals; a decision on §10.5 that either
narrows the advertised player range or fixes matching at scale.

**Later** — the §10.11 question. If the substrate supports a better game, that is
worth more than tuning this one.

---

## Appendix A — deployment

Node 22+, port 3210 by default, `PUBLIC_URL` must be an address a phone on the
same network can reach (it is baked into the QR). systemd unit and nginx config
ship in `deploy/`.

The nginx WebSocket block is the one thing that must not be skimmed:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3210;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;   # Table Talk has no timer
}
```

Without those lines nginx silently downgrades the upgrade request. The lobby
loads, players join, and then nothing ever happens — a failure that looks
exactly like an application bug and is not.

## Appendix B — documents

| | |
|---|---|
| `README.md` | quickstart |
| `docs/GAME.md` | rules and design reasoning, for players and contributors |
| `docs/PROTOCOL.md` | every message, the redaction contract |
| `docs/CONTENT.md` | pack curation, filter policy, adding packs |
| `docs/DEPLOY.md` | VPS deployment |
| `docs/TESTING.md` | what is proven, what only a phone can prove, on-device plan |
| `docs/SPEC.md` | this document |

---

*3 > 1.*
