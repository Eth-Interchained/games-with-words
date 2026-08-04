/**
 * Zero-dependency test runner.
 *
 *   npm test
 *
 * The last test is the one that matters: it boots the real server on a real
 * port, connects four real WebSocket clients, plays a complete five-round
 * game, and then greps every single frame those clients received for identity
 * leaks. Reading the redaction code proves nothing; this proves it.
 */

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

import { CORE_PACK, PACKS, packFor } from '../shared/words.ts';
import { FRAMES, questionFor } from '../shared/frames.ts';
import { mulberry32, pickJoinCode, shuffle } from '../shared/rng.ts';
import { filterAnswer, filterNickname } from '../shared/filter.ts';
import { pickTableTalk, scoreRound } from '../shared/scoring.ts';
import {
  addPlayer,
  chooseWords,
  closeWriting,
  createRoom,
  currentRound,
  dealHand,
  everyoneAnswered,
  finishGame,
  react,
  redactRoom,
  revealRound,
  startRound,
  submitAnswer,
  submitMatches,
} from '../shared/engine.ts';
import type { Answer, Player, Trio } from '../shared/types.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    })
    .catch((err) => {
      failed++;
      failures.push(`${name}\n     ${err.message?.split('\n')[0]}`);
      console.log(`  \x1b[31m✗\x1b[0m ${name}`);
      console.log(`    \x1b[31m${String(err.message).split('\n').slice(0, 4).join('\n    ')}\x1b[0m`);
    });
}

function section(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

/* ================================================================== */
/* 1. content pack                                                     */
/* ================================================================== */

async function packTests() {
  section('Word pack');

  await test('300 words in the core pack', () => {
    assert.equal(CORE_PACK.length, 300, `got ${CORE_PACK.length}`);
  });

  await test('60 words in each of the five categories', () => {
    const counts: Record<string, number> = {};
    for (const w of CORE_PACK) counts[w.category] = (counts[w.category] ?? 0) + 1;
    assert.deepEqual(counts, {
      people: 60, places: 60, objects: 60, moments: 60, feelings: 60,
    });
  });

  await test('every word id is unique', () => {
    const ids = new Set(CORE_PACK.map((w) => w.id));
    if (ids.size !== CORE_PACK.length) {
      const seen = new Set<string>();
      const dupes = CORE_PACK.filter((w) => (seen.has(w.id) ? true : (seen.add(w.id), false)));
      assert.fail(`duplicate ids: ${dupes.map((d) => d.id).join(', ')}`);
    }
  });

  await test('no near-duplicate words across categories', () => {
    // the id check misses "Ladder" vs "A ladder"; this one does not
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const w of CORE_PACK) {
      const key = w.text.toLowerCase().replace(/^(a|the)\s+/, '');
      const prev = seen.get(key);
      if (prev) clashes.push(`${prev} / ${w.category}:${w.text}`);
      else seen.set(key, `${w.category}:${w.text}`);
    }
    assert.equal(clashes.length, 0, clashes.join(', '));
  });

  await test('family mode drops every weight-3 word', () => {
    const fam = packFor('core', true);
    assert.ok(fam.every((w) => w.weight <= 2));
    assert.ok(fam.length < CORE_PACK.length, 'family pack should be smaller');
  });

  await test('unknown pack id falls back to core instead of throwing', () => {
    assert.equal(packFor('nope', false).length, 300);
    assert.ok(PACKS.core);
  });
}

/* ================================================================== */
/* 2. dealing + frames                                                 */
/* ================================================================== */

async function dealTests() {
  section('Dealing and frames');

  await test('a hand is nine tiles, three per row', () => {
    const room = createRoom(42, 0);
    const hand = dealHand(room, 1);
    assert.equal(hand.length, 9);
    const concrete = hand.slice(0, 3);
    const moments = hand.slice(3, 6);
    const feelings = hand.slice(6, 9);
    assert.ok(concrete.every((w) => ['people', 'places', 'objects'].includes(w.category)));
    assert.ok(moments.every((w) => w.category === 'moments'));
    assert.ok(feelings.every((w) => w.category === 'feelings'));
  });

  await test('a hand never repeats a word', () => {
    for (let r = 1; r <= 50; r++) {
      const room = createRoom(r * 13, 0);
      const hand = dealHand(room, r);
      assert.equal(new Set(hand.map((w) => w.id)).size, 9, `round ${r} repeated a tile`);
    }
  });

  await test('same seed deals the same hand, different seed does not', () => {
    const a = dealHand(createRoom(7, 0), 1).map((w) => w.id);
    const b = dealHand(createRoom(7, 0), 1).map((w) => w.id);
    const c = dealHand(createRoom(8, 0), 1).map((w) => w.id);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  await test('every frame renders a non-empty question for any trio', () => {
    const room = createRoom(3, 0);
    const hand = dealHand(room, 1);
    const trio = [hand[0], hand[3], hand[6]] as Trio;
    for (const f of FRAMES) {
      for (let v = 0; v < 5; v++) {
        const q = questionFor(f.id, trio, v);
        assert.ok(q.length > 8, `${f.id} produced "${q}"`);
        assert.ok(!q.includes('undefined'), `${f.id} leaked undefined: ${q}`);
        assert.ok(!q.includes('{'), `${f.id} left a placeholder: ${q}`);
      }
    }
  });
}

async function joinCodeTests() {
  section('Join codes');

  await test('a taken code is never handed out again', () => {
    const taken = new Set(['AAAA', 'BBBB']);
    const rand = mulberry32(1234);
    for (let i = 0; i < 500; i++) {
      const code = pickJoinCode(rand, (c) => taken.has(c));
      assert.ok(!taken.has(code), `handed out a taken code: ${code}`);
      taken.add(code);
    }
    assert.equal(taken.size, 502, 'every code handed out should be distinct');
  });

  await test('widens the code rather than spinning when the space is full', () => {
    // pathological predicate: every 4-character code is taken
    const code = pickJoinCode(mulberry32(9), (c) => c.length <= 4);
    assert.ok(code.length > 4, `expected a wider code, got "${code}"`);
  });

  await test('codes avoid characters that get misread out loud', () => {
    const rand = mulberry32(77);
    for (let i = 0; i < 300; i++) {
      const code = pickJoinCode(rand, () => false);
      assert.ok(!/[O0I1S5]/.test(code), `ambiguous character in ${code}`);
      assert.match(code, /^[A-Z2-9]+$/);
    }
  });
}

/* ================================================================== */
/* 3. filter — false positives matter more than false negatives        */
/* ================================================================== */

async function filterTests() {
  section('Content filter');

  const innocent = [
    'My grandmother gave advice in the kitchen every Sunday.',
    'Never start an argument before dinner.',
    'My cousin Jamie turns every road trip into a navigation emergency.',
    'Class was at 3 and I was always late.',
    'We drove 400 miles for a photograph nobody kept.',
    'The best thing my dad ever said was "call me when you land".',
    'I was 12 and it cost $5.',
    'Assassin\'s Creed marathons with my brother — that was our whole summer.',
    'Scunthorpe is a real place and my uncle lived there.',
    'She passed me a note that said 143.',
  ];

  await test('does not fire on ten innocent answers', () => {
    for (const s of innocent) {
      const v = filterAnswer(s, { familyMode: true });
      assert.ok(v.ok, `false positive on: "${s}" -> ${v.ok ? '' : v.reason}`);
    }
  });

  await test('catches a phone number', () => {
    const v = filterAnswer('call me at 407-555-0199 after dinner', { familyMode: true });
    assert.ok(!v.ok && v.category === 'contact_info');
  });

  await test('catches an email address', () => {
    const v = filterAnswer('email grandma at nan@example.com', { familyMode: true });
    assert.ok(!v.ok && v.category === 'contact_info');
  });

  await test('catches a street address', () => {
    const v = filterAnswer('we grew up at 412 Maple Street together', { familyMode: true });
    assert.ok(!v.ok && v.category === 'contact_info');
  });

  await test('catches a threat', () => {
    const v = filterAnswer('i am going to kill you', { familyMode: true });
    assert.ok(!v.ok && v.category === 'threat');
  });

  await test('catches leetspeak evasion of a blocked term', () => {
    const v = filterAnswer('you total r3tard', { familyMode: true });
    assert.ok(!v.ok && v.category === 'blocked_term');
  });

  await test('rejects over-long answers and empty answers', () => {
    assert.ok(!filterAnswer('x'.repeat(181)).ok);
    assert.ok(!filterAnswer('  ').ok);
  });

  await test('links blocked in family mode, allowed outside it', () => {
    assert.ok(!filterAnswer('see https://example.com', { familyMode: true }).ok);
    assert.ok(filterAnswer('see https://example.com', { familyMode: false }).ok);
  });

  await test('nickname filter trims and de-slurs', () => {
    const v = filterNickname('   Marky   ');
    assert.ok(v.ok && v.body === 'Marky');
    assert.ok(!filterNickname('n1gger').ok);
  });
}

/* ================================================================== */
/* 4. scoring — the golden vector                                      */
/* ================================================================== */

function mkPlayer(id: string, i: number): Player {
  return {
    id, nickname: id, avatarSeed: 'ember', connected: true,
    joinedAt: i, score: 0, roundsDealt: 0, isHost: i === 0, ready: false,
  };
}

function mkAnswer(id: string, authorId: string, reactions: Record<string, 'heart' | 'laugh' | 'eyes'> = {}): Answer {
  return { id, roundNumber: 1, authorId, body: `answer ${id}`, submittedAt: 0, reactions };
}

async function scoringTests() {
  section('Scoring');

  await test('recognized = +2 each, correct match = +1 each', () => {
    const players = ['maya', 'jordan', 'chris', 'devon'].map(mkPlayer);
    const answers = [
      mkAnswer('a1', 'maya'), mkAnswer('a2', 'jordan'),
      mkAnswer('a3', 'chris'), mkAnswer('a4', 'devon'),
    ];
    // jordan + chris both correctly identify maya's a1; nobody else is right
    const matches = [
      { guesserId: 'jordan', answerId: 'a1', guessedAuthorId: 'maya' },
      { guesserId: 'chris', answerId: 'a1', guessedAuthorId: 'maya' },
      { guesserId: 'devon', answerId: 'a1', guessedAuthorId: 'chris' },
    ];
    const { lines } = scoreRound(players, answers, matches);
    const by = Object.fromEntries(lines.map((l) => [l.playerId, l]));
    assert.equal(by.maya.recognized, 4, 'maya: two people read her = +4');
    assert.equal(by.maya.readTheRoom, 0);
    assert.equal(by.jordan.readTheRoom, 1);
    assert.equal(by.chris.readTheRoom, 1);
    assert.equal(by.devon.readTheRoom, 0);
    assert.equal(by.maya.total, 4);
  });

  await test('matching your own answer scores nobody', () => {
    const players = ['a', 'b', 'c'].map(mkPlayer);
    const answers = [mkAnswer('a1', 'a')];
    const { lines } = scoreRound(players, answers, [
      { guesserId: 'a', answerId: 'a1', guessedAuthorId: 'a' },
    ]);
    assert.equal(lines.find((l) => l.playerId === 'a')!.total, 0);
  });

  await test('most-loved awards +1, and a tie awards nobody', () => {
    const players = ['a', 'b', 'c'].map(mkPlayer);
    const clearWinner = [
      mkAnswer('a1', 'a', { b: 'heart', c: 'heart' }),
      mkAnswer('a2', 'b', { c: 'laugh' }),
    ];
    const r1 = scoreRound(players, clearWinner, []);
    assert.equal(r1.mostLovedAnswerId, 'a1');
    assert.equal(r1.lines.find((l) => l.playerId === 'a')!.mostLoved, 1);

    const tie = [
      mkAnswer('a1', 'a', { b: 'heart' }),
      mkAnswer('a2', 'b', { a: 'heart' }),
    ];
    const r2 = scoreRound(players, tie, []);
    assert.equal(r2.mostLovedAnswerId, undefined, 'a tie should award nobody');
  });

  await test('being unreadable scores you nothing — the design inversion', () => {
    // Two players. One writes something unmistakably them (everyone reads it),
    // one writes bland camouflage (nobody reads it). The recognizable player
    // must come out ahead, or the whole premise is broken.
    const players = ['self', 'bland', 'x', 'y'].map(mkPlayer);
    const answers = [mkAnswer('a1', 'self'), mkAnswer('a2', 'bland')];
    const matches = [
      { guesserId: 'bland', answerId: 'a1', guessedAuthorId: 'self' },
      { guesserId: 'x', answerId: 'a1', guessedAuthorId: 'self' },
      { guesserId: 'y', answerId: 'a1', guessedAuthorId: 'self' },
      { guesserId: 'self', answerId: 'a2', guessedAuthorId: 'x' },
      { guesserId: 'x', answerId: 'a2', guessedAuthorId: 'y' },
      { guesserId: 'y', answerId: 'a2', guessedAuthorId: 'x' },
    ];
    const { lines } = scoreRound(players, answers, matches);
    const self = lines.find((l) => l.playerId === 'self')!;
    const bland = lines.find((l) => l.playerId === 'bland')!;
    assert.ok(self.total > bland.total, `recognizable ${self.total} must beat bland ${bland.total}`);
    assert.equal(self.total, 6);
    assert.equal(bland.total, 1);
  });

  await test('table talk picks the biggest surprise over the popular answer', () => {
    const answers = [
      mkAnswer('a1', 'a', { b: 'heart', c: 'heart', d: 'heart' }),
      mkAnswer('a2', 'b', { a: 'eyes' }),
    ];
    const tt = pickTableTalk(answers, { a1: 3, a2: 0 });
    assert.equal(tt?.answerId, 'a2');
    assert.equal(tt?.reason, 'surprise');
  });

  await test('table talk falls back to most loved when everyone was read', () => {
    const answers = [
      mkAnswer('a1', 'a', { b: 'heart', c: 'heart' }),
      mkAnswer('a2', 'b', { a: 'eyes' }),
    ];
    const tt = pickTableTalk(answers, { a1: 2, a2: 1 });
    assert.equal(tt?.reason, 'loved');
    assert.equal(tt?.answerId, 'a1');
  });
}

/* ================================================================== */
/* 5. redaction, in the engine                                         */
/* ================================================================== */

async function redactionTests() {
  section('Redaction');

  function seeded() {
    const room = createRoom(99, 1000);
    const a = addPlayer(room, 'Ada', 1000) as Player;
    const b = addPlayer(room, 'Ben', 1001) as Player;
    const c = addPlayer(room, 'Cal', 1002) as Player;
    startRound(room, a.id, 1003);
    const hand = currentRound(room)!.hand;
    chooseWords(room, a.id, [hand[0].id, hand[3].id, hand[6].id], 1004);
    submitAnswer(room, a.id, 'Ada wrote this one', 1005);
    submitAnswer(room, b.id, 'Ben wrote this one', 1006);
    submitAnswer(room, c.id, 'Cal wrote this one', 1007);
    return { room, a, b, c };
  }

  await test('authorId is absent from every answer before the reveal', () => {
    const { room, b } = seeded();
    closeWriting(room);
    const view = redactRoom(room, b.id);
    const answers = view.rounds[0].answers;
    assert.equal(answers.length, 3);
    for (const ans of answers) {
      assert.equal(ans.authorId, undefined, `leaked author on ${ans.id}`);
    }
  });

  await test('you can still see which answer is yours', () => {
    const { room, b } = seeded();
    closeWriting(room);
    const mine = redactRoom(room, b.id).rounds[0].answers.filter((a) => a.mine);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].body, 'Ben wrote this one');
  });

  await test('the nine-tile hand only reaches the dealer', () => {
    const room = createRoom(5, 0);
    const a = addPlayer(room, 'Ada', 0) as Player;
    const b = addPlayer(room, 'Ben', 1) as Player;
    addPlayer(room, 'Cal', 2);
    startRound(room, a.id, 3);
    assert.equal(redactRoom(room, a.id).rounds[0].hand?.length, 9);
    assert.equal(redactRoom(room, b.id).rounds[0].hand, undefined);
  });

  await test('other players’ match guesses never reach you', () => {
    const { room, a, b, c } = seeded();
    closeWriting(room);
    room.phase = 'matching';
    const ids = currentRound(room)!.answers;
    submitMatches(room, b.id, [{ answerId: ids[0].id, guessedAuthorId: a.id }]);
    submitMatches(room, c.id, [{ answerId: ids[0].id, guessedAuthorId: b.id }]);
    const view = redactRoom(room, b.id);
    assert.equal(view.rounds[0].yourMatches.length, 1);
    assert.equal(view.rounds[0].yourMatches[0].guesserId, b.id);
    assert.equal(view.rounds[0].matchedCount, 2, 'count is fine to share');
  });

  await test('the seed never reaches a client', () => {
    const { room, b } = seeded();
    assert.equal((redactRoom(room, b.id) as unknown as Record<string, unknown>).seed, undefined);
  });

  await test('authorId appears once the round is revealed', () => {
    const { room, b } = seeded();
    closeWriting(room);
    room.phase = 'matching';
    revealRound(room);
    const answers = redactRoom(room, b.id).rounds[0].answers;
    assert.ok(answers.every((a) => typeof a.authorId === 'string'));
  });
}

/* ================================================================== */
/* 6. full game over real sockets                                      */
/* ================================================================== */

interface Recorded { playerId: string; frames: unknown[]; room?: any; token?: string }

async function liveGameTest() {
  section('Live four-player game over real WebSockets');

  const { startServer, rooms } = await import('../server/index.ts');
  const srv = await startServer(0);
  const port = (srv.address() as AddressInfo).port;
  const url = `ws://127.0.0.1:${port}/ws`;

  const names = ['Maya', 'Jordan', 'Chris', 'Devon'];
  const clients: Record<string, Recorded> = {};
  const conns: WebSocket[] = [];

  function connect(nickname: string, joinCode: string): Promise<{ ws: WebSocket; rec: Recorded }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const rec: Recorded = { playerId: '', frames: [] };
      const timeout = setTimeout(() => reject(new Error(`${nickname} never got a welcome`)), 5000);
      ws.addEventListener('message', (ev: MessageEvent) => {
        const msg = JSON.parse(String(ev.data));
        rec.frames.push(msg);
        if (msg.type === 'welcome') {
          rec.playerId = msg.playerId;
          rec.token = msg.token;
          rec.room = msg.room;
          clearTimeout(timeout);
          resolve({ ws, rec });
        }
        if (msg.type === 'room') rec.room = msg.room;
      });
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'join', joinCode, nickname }));
      });
      ws.addEventListener('error', () => reject(new Error(`${nickname} socket error`)));
    });
  }

  const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const send = (i: number, msg: unknown) => conns[i].send(JSON.stringify(msg));
  const roomOf = (i: number) => clients[names[i]].room;

  // --- host creates, three join by code ---
  const first = await connect('Maya', 'NEW');
  conns.push(first.ws);
  clients.Maya = first.rec;
  const joinCode: string = first.rec.room.joinCode;

  for (let i = 1; i < names.length; i++) {
    const c = await connect(names[i], joinCode);
    conns.push(c.ws);
    clients[names[i]] = c.rec;
  }
  await tick();

  await test('four players are in the lobby with one host', () => {
    const room = roomOf(0);
    assert.equal(room.players.length, 4);
    assert.equal(room.players.filter((p: any) => p.isHost).length, 1);
    assert.equal(room.phase, 'lobby');
    assert.match(joinCode, /^[A-Z2-9]{4}$/);
  });

  await test('a bad join code is refused', async () => {
    const bad = new WebSocket(url);
    const got = await new Promise<any>((resolve) => {
      bad.addEventListener('open', () =>
        bad.send(JSON.stringify({ type: 'join', joinCode: 'ZZZZ', nickname: 'Ghost' })));
      bad.addEventListener('message', (ev: MessageEvent) => resolve(JSON.parse(String(ev.data))));
    });
    bad.close();
    assert.equal(got.type, 'error');
    assert.match(got.message, /No room/);
  });

  // --- ready-up ---
  await test('ready state is off for everyone at first', () => {
    assert.ok(roomOf(0).players.every((p: any) => p.ready === false));
  });

  await test('a player readying up is broadcast to the whole room', async () => {
    send(1, { type: 'ready', ready: true });
    await tick();
    const seenByHost = roomOf(0).players.find((p: any) => p.id === clients.Jordan.playerId);
    const seenBySelf = roomOf(1).players.find((p: any) => p.id === clients.Jordan.playerId);
    assert.equal(seenByHost.ready, true, 'host did not see Jordan ready up');
    assert.equal(seenBySelf.ready, true);
    assert.equal(
      roomOf(0).players.filter((p: any) => p.ready).length, 1,
      'exactly one player should be ready',
    );
  });

  await test('ready can be taken back', async () => {
    send(1, { type: 'ready', ready: false });
    await tick();
    assert.equal(roomOf(0).players.filter((p: any) => p.ready).length, 0);
    send(1, { type: 'ready', ready: true });
    send(2, { type: 'ready', ready: true });
    await tick();
    assert.equal(roomOf(0).players.filter((p: any) => p.ready).length, 2);
  });

  // --- shorten the game so the test stays fast ---
  send(0, { type: 'settings', settings: { totalRounds: 5, writingSeconds: 120 } });
  await tick();

  await test('the host can launch without waiting for every ready', async () => {
    // Maya and Devon never readied; launching must still work.
    assert.ok(roomOf(0).players.filter((p: any) => p.ready).length < 4);
    send(0, { type: 'start' });
    await tick();
    assert.equal(roomOf(0).phase, 'dealing', 'launch was blocked by the ready gate');
  });

  await test('ready flags are cleared when the game starts', () => {
    assert.ok(roomOf(0).players.every((p: any) => p.ready === false));
  });

  await test('a non-host cannot change settings', async () => {
    const before = JSON.stringify(roomOf(1).settings);
    send(1, { type: 'settings', settings: { totalRounds: 99 } });
    await tick();
    assert.equal(JSON.stringify(roomOf(1).settings), before);
  });

  const roundsPlayed: number[] = [];

  for (let round = 1; round <= 5; round++) {
    const room = roomOf(0);
    assert.equal(room.phase, 'dealing', `round ${round} should open on dealing, got ${room.phase}`);
    const dealerIdx = names.findIndex((n) => clients[n].playerId === room.rounds.at(-1).dealerId);
    assert.ok(dealerIdx >= 0, 'dealer must be a real player');
    roundsPlayed.push(dealerIdx);

    // dealer picks one tile from each row
    const hand = clients[names[dealerIdx]].room.rounds.at(-1).hand;
    assert.equal(hand?.length, 9, 'dealer must hold nine tiles');
    send(dealerIdx, { type: 'choose_words', wordIds: [hand[0].id, hand[4].id, hand[8].id] });
    await tick();

    assert.equal(roomOf(0).phase, 'writing', `round ${round} should be writing`);

    // a non-dealer trying to pick words must be refused
    if (round === 1) {
      const other = (dealerIdx + 1) % 4;
      send(other, { type: 'choose_words', wordIds: [hand[1].id, hand[2].id, hand[3].id] });
      await tick();
    }

    for (let i = 0; i < 4; i++) {
      send(i, { type: 'answer', body: `${names[i]} says something in round ${round}` });
      await tick(20);
    }
    await tick();

    assert.equal(roomOf(0).phase, 'lineup', `round ${round} should reach lineup`);

    // reactions during the line-up
    const answers = roomOf(0).rounds.at(-1).answers;
    for (let i = 0; i < 4; i++) {
      const notMine = answers.filter((a: any) => !clients[names[i]].room.rounds.at(-1).answers.find((x: any) => x.id === a.id && x.mine));
      if (notMine[0]) send(i, { type: 'react', answerId: notMine[0].id, reaction: i === 0 ? 'heart' : 'laugh' });
    }
    await tick();

    // dealer walks the line-up
    for (let i = 0; i < answers.length; i++) {
      send(dealerIdx, { type: 'advance' });
      await tick(20);
    }
    await tick();
    assert.equal(roomOf(0).phase, 'matching', `round ${round} should reach matching`);

    // everyone matches: player i guesses correctly for answer of player (i+1)%4
    for (let i = 0; i < 4; i++) {
      const view = clients[names[i]].room.rounds.at(-1);
      const pairs = view.answers
        .filter((a: any) => !a.mine)
        .map((a: any, k: number) => ({
          answerId: a.id,
          guessedAuthorId: clients[names[(i + k + 1) % 4]].playerId,
        }));
      send(i, { type: 'matches', pairs });
      await tick(20);
    }
    await tick();

    assert.equal(roomOf(0).phase, 'reveal', `round ${round} should reveal once all matched`);

    send(dealerIdx, { type: 'advance' }); // -> tabletalk
    await tick();
    assert.equal(roomOf(0).phase, 'tabletalk');
    send(dealerIdx, { type: 'advance' }); // -> next round or final
    await tick();
  }

  await test('five rounds completed and the game reached the final word', () => {
    assert.equal(roomOf(0).phase, 'final');
    assert.equal(roomOf(0).roundNumber, 5);
    assert.equal(roomOf(0).rounds.length, 5);
  });

  await test('the deck moved — not one player dealt every round', () => {
    assert.ok(new Set(roundsPlayed).size > 1, `dealers were ${roundsPlayed.join(',')}`);
  });

  await test('nobody dealt twice in a row', () => {
    for (let i = 1; i < roundsPlayed.length; i++) {
      assert.notEqual(roundsPlayed[i], roundsPlayed[i - 1], `dealt back to back at round ${i + 1}`);
    }
  });

  await test('scores were awarded and every player is on the board', () => {
    const room = roomOf(0);
    const total = room.players.reduce((n: number, p: any) => n + p.score, 0);
    assert.ok(total > 0, 'no points were scored across five rounds');
    for (const p of room.players) assert.ok(typeof p.score === 'number');
  });

  await test('superlatives were produced from real activity', () => {
    const sups = roomOf(0).superlatives;
    assert.ok(sups.length >= 3, `only ${sups.length} superlatives`);
    for (const s of sups) {
      assert.ok(s.title && s.detail && s.playerId, `incomplete superlative ${JSON.stringify(s)}`);
      assert.ok(roomOf(0).players.some((p: any) => p.id === s.playerId), 'superlative points at a ghost');
    }
  });

  /* ---- THE LEAK TEST -------------------------------------------------- */

  await test('no client EVER received an author id before that round revealed', () => {
    const problems: string[] = [];
    for (const name of names) {
      const rec = clients[name];
      for (const frame of rec.frames as any[]) {
        const room = frame.room ?? (frame.type === 'welcome' ? frame.room : null);
        if (!room?.rounds) continue;
        const identityOk = ['reveal', 'tabletalk', 'final', 'complete'].includes(room.phase);
        const lastIdx = room.rounds.length - 1;
        room.rounds.forEach((r: any, idx: number) => {
          const isCurrent = idx === lastIdx;
          if (!isCurrent) return; // finished rounds are allowed to show authors
          for (const a of r.answers ?? []) {
            if (a.authorId !== undefined && !identityOk) {
              problems.push(`${name}: authorId "${a.authorId}" visible in phase ${room.phase}`);
            }
          }
        });
      }
    }
    assert.equal(problems.length, 0, problems.slice(0, 5).join('\n     '));
  });

  await test('no client ever received the room seed or another player’s guesses', () => {
    const problems: string[] = [];
    for (const name of names) {
      const me = clients[name].playerId;
      for (const frame of clients[name].frames as any[]) {
        const room = frame.room;
        if (!room) continue;
        if ('seed' in room) problems.push(`${name}: seed leaked`);
        for (const r of room.rounds ?? []) {
          for (const m of r.yourMatches ?? []) {
            if (m.guesserId !== me) problems.push(`${name}: saw ${m.guesserId}'s guess`);
          }
          if ('matches' in r) problems.push(`${name}: raw matches array leaked`);
        }
      }
    }
    assert.equal(problems.length, 0, problems.slice(0, 5).join('\n     '));
  });

  await test('a non-dealer never received the nine-tile hand', () => {
    const problems: string[] = [];
    for (const name of names) {
      const me = clients[name].playerId;
      for (const frame of clients[name].frames as any[]) {
        const room = frame.room;
        if (!room?.rounds) continue;
        for (const r of room.rounds) {
          if (r.hand && r.dealerId !== me) problems.push(`${name}: got a hand while ${r.dealerId} was dealing`);
        }
      }
    }
    assert.equal(problems.length, 0, problems.join('\n     '));
  });

  /* ---- reconnection --------------------------------------------------- */

  await test('a dropped player resumes with their token and keeps their score', async () => {
    const victim = clients.Devon;
    const scoreBefore = roomOf(0).players.find((p: any) => p.id === victim.playerId).score;
    conns[3].close();
    await tick(120);

    const ws = new WebSocket(url);
    const resumed = await new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('resume timed out')), 5000);
      ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'resume', token: victim.token })));
      ws.addEventListener('message', (ev: MessageEvent) => {
        const m = JSON.parse(String(ev.data));
        if (m.type === 'welcome') { clearTimeout(t); resolve(m); }
        if (m.type === 'error') { clearTimeout(t); reject(new Error(m.message)); }
      });
    });
    assert.equal(resumed.playerId, victim.playerId, 'identity should survive the drop');
    const me = resumed.room.players.find((p: any) => p.id === victim.playerId);
    assert.equal(me.score, scoreBefore, 'score should survive the drop');
    assert.equal(me.connected, true);
    ws.close();
  });

  await test('a forged resume token is rejected', async () => {
    const ws = new WebSocket(url);
    const got = await new Promise<any>((resolve) => {
      ws.addEventListener('open', () =>
        ws.send(JSON.stringify({ type: 'resume', token: 'aaa.bbb.ccccccccccc' })));
      ws.addEventListener('message', (ev: MessageEvent) => resolve(JSON.parse(String(ev.data))));
    });
    ws.close();
    assert.equal(got.type, 'error');
  });

  await test('health endpoint answers', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.rooms >= 1);
  });

  for (const c of conns) { try { c.close(); } catch { /* already closed */ } }
  await tick(100);
  srv.close();
  rooms.clear();
}

/* ================================================================== */

async function main() {
  console.log('\n\x1b[1m\x1b[38;5;208mGames with Words — test suite\x1b[0m');
  await packTests();
  await dealTests();
  await joinCodeTests();
  await filterTests();
  await scoringTests();
  await redactionTests();
  await liveGameTest();

  console.log(
    `\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m\n`,
  );
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

void main();
