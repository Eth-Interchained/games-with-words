# Games with Words

**Three words. Everyone has a different story.**

A mobile-first party game for 3–10 people who already know each other. One
player picks three words from a hand of nine, the app turns those words into a
question, everybody answers it, and then the room tries to match every
anonymous answer to the person who wrote it.

You do not win by hiding. **You win by being recognizable.** That single scoring
choice is what makes it a conversation starter instead of a bluffing game.

---

## Quickstart

```bash
npm install
npm run build        # builds the client into dist/
npm start            # serves client + WebSocket on one port
```

Open `http://localhost:3210`. Tap **Host a game**, show the QR code to the
room, and everyone else scans it or types the four-character code. Players tap
**I'm ready** — the ready dots fill in live on every device — and the host hits
**Launch** whenever the room is set.

Every device stays in sync over one WebSocket: the server pushes a full
redacted room snapshot on each change, so nothing can drift out of step.

For development with hot reload:

```bash
npm start            # terminal 1 — game server on :3210
npm run dev          # terminal 2 — Vite on :5173, proxies /ws to the server
```

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3210` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_URL` | `http://localhost:$PORT` | Base URL baked into the QR code and share link |
| `ROOM_SECRET` | random per boot | HMAC key for reconnect tokens. Set it in production so tokens survive a restart. |
| `LOG_LEVEL` | `1` | `0` errors, `1` room lifecycle |

Node 22+ required — the server runs TypeScript directly via native type
stripping, so there is no server build step.

---

## Pass and play

The whole game also runs on a single phone passed around the table:

```bash
node scripts/build-static.mjs   # -> dist-static/pass-and-play.html
```

That is one self-contained HTML file with no network calls of any kind. It
imports the same word pack, the same prompt frames, and the same scoring
functions as the server, so the two builds cannot drift apart.

---

## How the round works

1. **Deal** — the dealer sees nine tiles in three rows (something solid,
   something that happens, something you feel) and picks any three.
2. **Question** — the app pairs the trio with a prompt frame: *what do these
   make you remember?*, *who do they make you think of?*, *turn them into
   advice*, and so on.
3. **Write** — everybody answers, dealer included, ~60s, 180 characters.
   Every answer is explicitly allowed to be true, fictional, or in between.
4. **Line-up** — answers appear one at a time, anonymous. React freely.
5. **Match** — each player privately pairs every answer with a name. One name
   per card; it is a matching puzzle, not independent guesses.
6. **Reveal** — authors are shown, points land.
7. **Table talk** — the app picks the answer nobody saw coming, puts it
   full-screen with its author, and **stops**. No timer. That is the part the
   whole game exists to produce.

The deck then passes to whoever read the room best.

### Scoring

| | |
|---|---|
| **+2** | for each person who correctly matched *your* answer to you |
| **+1** | for each answer *you* matched correctly |
| **+1** | if your answer took the most hearts that round |

Nothing is ever deducted and nobody is eliminated.

---

## Feel

Sound is synthesised with WebAudio at call time — no audio files, about 4 kB of
code. Word tiles click, the three words land on three rising notes, the reveal
dings when you called it and thuds when you did not, and the final screen gets
a fanfare and confetti. There is a mute toggle in the top bar and the setting
persists.

It all degrades silently: no AudioContext, no vibration motor, no canvas — the
game still plays a complete round. That is asserted by the test suite, not
assumed.

## Layout

```
shared/      the rules engine — pure, I/O-free, deterministic from a seed
  types.ts       domain types, including the client-visible subset
  words.ts       the 300-word Core Connections pack
  frames.ts      prompt frames — the conversation engine
  scoring.ts     the scoring rules, isolated so they are testable alone
  engine.ts      phases, dealing, reveal, superlatives, redaction
  filter.ts      family-safe content filtering
  rng.ts         seeded RNG so a whole game is replayable
  protocol.ts    the WebSocket message contract

server/      authoritative game server (Express + ws on one port)
client/      React client, and passandplay.ts for the single-device build
tests/       headless test suites — see docs/TESTING.md
deploy/      systemd unit + nginx config
docs/        game rules, protocol, content policy, deploy, testing
```

## Documentation

- [docs/SPEC.md](docs/SPEC.md) — the full specification, written to be argued with
- [docs/GAME.md](docs/GAME.md) — the full rules and the design reasoning
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — every WebSocket message and the redaction contract
- [docs/CONTENT.md](docs/CONTENT.md) — word pack curation rules and how to add a pack
- [docs/DEPLOY.md](docs/DEPLOY.md) — VPS deployment, including the nginx WebSocket trap
- [docs/TESTING.md](docs/TESTING.md) — what is proven, and what only a real phone can prove

## Tests

```bash
npm test
```

Runs the engine/server suite (53 checks, including a complete four-player game
over real WebSockets with ready-up and identity-leak assertions) and the
pass-and-play suite (13 checks, a complete three-round game driven through a
real DOM). 66 total.

## License

GPL-3.0-or-later.
