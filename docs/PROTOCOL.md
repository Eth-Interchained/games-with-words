# Wire protocol

One WebSocket at `/ws`, JSON frames, discriminated on `type`. Protocol version
`1`, sent in the `welcome` frame.

## Design choice: full snapshots, not deltas

The server sends the **entire redacted room** on every state change. Room state
is small — ten players, seven rounds, a few hundred bytes of answers — and full
snapshots make a whole category of desync bug impossible. On phone networks
that drop and resume constantly, that tradeoff is worth far more than the bytes.

A reconnecting client needs no replay logic. It gets one frame and it is correct.

---

## Client → server

| Message | Fields | Notes |
|---|---|---|
| `join` | `joinCode`, `nickname`, `token?` | `joinCode: "NEW"` creates a room and makes you its host |
| `resume` | `token` | Reconnect as an existing player |
| `settings` | `settings` (partial) | Room host only, lobby only |
| `ready` | `ready: boolean` | Lobby only. Advisory — it does **not** gate the launch |
| `start` | — | Room host only, needs 3+ players |
| `choose_words` | `wordIds: string[3]` | Dealer only, during `dealing` |
| `answer` | `body` | Filtered server-side; resubmitting overwrites |
| `react` | `answerId`, `reaction \| null` | Not on your own answer |
| `matches` | `pairs: {answerId, guessedAuthorId}[]` | Replaces any previous guesses from you |
| `advance` | — | Dealer drives the line-up, reveal, and table talk |
| `kick` | `playerId` | Room host only |
| `again` | — | Room host only, from the final screen |
| `ping` | — | Keepalive, answered with `pong` |

## Server → client

| Message | Fields |
|---|---|
| `welcome` | `protocol`, `token`, `playerId`, `room`, `joinUrl`, `qrSvg` |
| `room` | `room` — a full `ClientRoom` snapshot |
| `error` | `message`, `fatal?` — `fatal` clears the stored token |
| `toast` | `message` |
| `pong` | — |

The QR code is rendered **server-side** into an inline SVG string and delivered
in `welcome`. The client never has to know the public hostname, and there is no
QR library in the client bundle.

---

## The redaction contract

`redactRoom(room, viewerId)` in `shared/engine.ts` is the only function that
produces client-facing state. Nothing else may serialise a `Room`.

It guarantees, for the **current** round:

| Field | Rule |
|---|---|
| `answers[].authorId` | Absent unless phase is `reveal`, `tabletalk`, `final`, or `complete` |
| `answers[].mine` | Present only on your own answer — you already know which is yours |
| `rounds[].hand` | Sent only to the dealer, and only during `dealing` |
| `rounds[].matches` | Never sent. Replaced by `yourMatches`, filtered to you |
| `room.seed` | Never sent |

Completed rounds keep their author information — once a round has revealed,
there is nothing left to protect.

### How this is enforced

Not by review. `tests/run.ts` boots the real server, connects four real
WebSocket clients, plays a complete five-round game, and **records every frame
each client receives**. Three assertions then sweep those recordings:

- no `authorId` on a current-round answer while the phase is pre-reveal
- no `seed`, and no `yourMatches` entry belonging to another player
- no nine-tile `hand` in any frame sent to a non-dealer

Reading the redaction code proves nothing. Replaying the transcript does.

---

## Ready-up is advisory on purpose

Players tap **I'm ready** and every device sees the ready dots fill in live.
The host still launches whenever they want, and the launch button says
`Launch anyway (2/4)` rather than sitting disabled.

Gating the start on unanimous ready is how a party game stalls: one person puts
their phone down to get a drink and four people stare at a locked button. The
signal is useful, the gate is not. `ready` flags are cleared automatically when
the game starts and when the host resets for another game.

## Server authority

The client renders a countdown; it does not enforce one. The server owns:

- the writing deadline (with a 2s grace for in-flight submissions)
- who the dealer is, and who deals next
- whether a word id was actually in the dealt hand
- vote eligibility — you cannot match your own answer, and matching it scores nobody
- all scoring
- phase transitions

A player who edits their client can send anything. The worst they achieve is an
error frame.

## Reconnection

Tokens are `roomId.playerId.HMAC-SHA256(roomId.playerId, ROOM_SECRET)`, compared
with `timingSafeEqual`. On reconnect the player's score, submitted answer, and
recorded guesses are all still there; they land in whatever phase the room has
reached and cannot resubmit into a closed phase.

Set `ROOM_SECRET` in production. Left unset it is randomised per boot, which
means a server restart invalidates every in-flight game.

Disconnecting from the **lobby** removes you. Disconnecting **mid-game** marks
you offline and keeps your seat. If everybody leaves, the room is reaped
immediately; otherwise rooms expire six hours after creation.

If a player runs out of time without writing, the server submits
`(ran out of time)` on their behalf so the round still resolves.
