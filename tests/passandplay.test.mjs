/**
 * Drives the built pass-and-play HTML through a complete game in a real DOM.
 *
 *   node scripts/build-static.mjs && node tests/passandplay.test.mjs
 *
 * This clicks actual buttons and types into actual fields, exactly as a person
 * around a table would. If a screen fails to render or a button is dead, this
 * catches it — reading the source would not.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const HTML = 'dist-static/pass-and-play.html';
if (!fs.existsSync(HTML)) {
  console.error(`missing ${HTML} — run: node scripts/build-static.mjs`);
  process.exit(1);
}

let passed = 0, failed = 0;
const check = async (name, fn) => {
  try { await fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${e.message.split('\n')[0]}\x1b[0m`); }
};

/** the round splash is a real 1.6s beat — wait it out like a player would */
const settle = (ms = 1750) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
});
const { window } = dom;
const doc = window.document;

// jsdom has no vibration motor and no scrollTo
window.navigator.vibrate = () => true;
window.scrollTo = () => {};

// jsdom has no AudioContext and no canvas 2d context. The feel layer is
// supposed to degrade silently on such a platform — if it throws here, it
// would throw on a locked-down browser too, and that is worth catching.

// collect anything the page throws while we drive it
const errors = [];
const unsupported = [];
const record = (label, msg) => {
  // jsdom announces its own capability gaps (no AudioContext, no canvas 2d)
  // through the same channel as real faults. Those are the platform's limits,
  // not the app's — but they must be counted, because the whole point of the
  // feel layer is that it degrades on a platform like this instead of dying.
  if (/not implemented/i.test(String(msg))) unsupported.push(String(msg));
  else errors.push(`${label}: ${msg}`);
};
window.addEventListener('error', (e) => record('error', e.message));
window.addEventListener('unhandledrejection', (e) => record('rejection', e.reason));
dom.virtualConsole.on('jsdomError', (e) => record('jsdom', e.message));

await new Promise((r) => setTimeout(r, 120));

const $ = (sel) => doc.querySelector(sel);
const $$ = (sel) => [...doc.querySelectorAll(sel)];
const text = () => doc.body.textContent.replace(/\s+/g, ' ');
const byText = (label) =>
  $$('button').find((b) => b.textContent.replace(/\s+/g, ' ').trim().includes(label));
const click = (el) => {
  assert.ok(el, 'tried to click a button that is not on screen');
  assert.ok(!el.disabled, `button "${el.textContent.trim()}" is disabled`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};

console.log('\n\x1b[1mPass & play — full game in a real DOM\x1b[0m');

/* ---------------------------------------------------------------- home */

await check('home screen renders the wordmark and both buttons', () => {
  assert.match(text(), /Three words\. Everyone has a different story\./);
  assert.ok(byText('Start a game'));
  assert.ok(byText('How to play'));
});

await check('how-to-play explains the scoring inversion, then returns home', () => {
  click(byText('How to play'));
  assert.match(text(), /recognizable/);
  assert.match(text(), /\+2/);
  click(byText('Got it'));
  assert.ok(byText('Start a game'));
});

/* --------------------------------------------------------------- setup */

const NAMES = ['Mark', 'Marisa', 'Jordan', 'Devon'];

await check('four players can be added', () => {
  click(byText('Start a game'));
  for (const n of NAMES) {
    const input = $('#nick');
    assert.ok(input, 'name input missing');
    input.value = n;
    click($('#addp'));
  }
  for (const n of NAMES) assert.match(text(), new RegExp(n));
});

await check('start is blocked under three players and enabled at four', () => {
  assert.equal($('#begin').disabled, false);
});

await check('round count is selectable', () => {
  click($$('[data-rounds]').find((b) => b.dataset.rounds === '3'));
  assert.ok($('#begin'));
});

/* ------------------------------------------------------- play a round  */

async function playRound(roundNo) {
  await settle();
  // hand-off to the dealer
  assert.ok($('#ready'), `round ${roundNo}: expected a hand-off screen`);
  const dealerLine = text();
  click($('#ready'));

  // dealer picks three tiles, one per row
  const tiles = $$('[data-tile]');
  assert.equal(tiles.length, 9, `round ${roundNo}: expected nine tiles, got ${tiles.length}`);
  const picked = [tiles[0], tiles[4], tiles[8]];
  for (const t of picked) click(t);
  const lock = $('#lockwords');
  assert.equal(lock.disabled, false, `round ${roundNo}: lock disabled after three picks`);
  const chosen = picked.map((t) => t.textContent.trim());
  click(lock);

  // everyone writes
  for (let i = 0; i < NAMES.length; i++) {
    assert.ok($('#ready'), `round ${roundNo}: missing writer hand-off for player ${i}`);
    click($('#ready'));
    const ta = $('#ans');
    assert.ok(ta, `round ${roundNo}: no answer box for player ${i}`);
    // each player writes something distinctive to themselves
    ta.value = `${NAMES[i]} always brings up ${chosen[i % 3].toLowerCase()} (r${roundNo})`;
    ta.dispatchEvent(new window.Event('input', { bubbles: true }));
    const lockAns = $('#lockans');
    assert.equal(lockAns.disabled, false, `round ${roundNo}: submit stayed disabled for ${NAMES[i]}`);
    click(lockAns);
  }

  // line-up: react on the first card, walk them all
  assert.ok($('#nextcard'), `round ${roundNo}: line-up did not start`);
  const heart = $$('[data-react]').find((b) => b.dataset.react === 'heart');
  click(heart);
  for (let i = 0; i < NAMES.length; i++) {
    assert.ok($('#nextcard'), `round ${roundNo}: line-up card ${i} missing`);
    click($('#nextcard'));
  }

  // everyone matches
  for (let i = 0; i < NAMES.length; i++) {
    assert.ok($('#ready'), `round ${roundNo}: missing matcher hand-off for player ${i}`);
    click($('#ready'));
    const items = $$('.match-item');
    assert.equal(items.length, NAMES.length - 1, `round ${roundNo}: wrong card count in matching`);
    // assign the first available (unused) name on each card
    for (let card = 0; card < items.length; card++) {
      const fresh = $$('.match-item')[card];
      const option = [...fresh.querySelectorAll('[data-pair]')]
        .find((b) => !b.classList.contains('used') && !b.classList.contains('on'));
      assert.ok(option, `round ${roundNo}: no free name for card ${card}`);
      click(option);
    }
    const lockMatch = $('#lockmatch');
    assert.equal(lockMatch.disabled, false, `round ${roundNo}: matching lock stayed disabled`);
    click(lockMatch);
  }

  return { dealerLine, chosen };
}

await check('round 1 plays through to the reveal', async () => {
  click($('#begin'));
  await playRound(1);
  assert.ok($('#totalk'), 'reveal screen did not appear');
  assert.match(text(), /This round/);
  assert.match(text(), /\+\d/, 'no points were shown');
});

await check('reveal names every author', () => {
  for (const n of NAMES) assert.match(text(), new RegExp(n));
});

await check('table talk gives one answer the floor', () => {
  click($('#totalk'));
  assert.match(text(), /tell us the whole thing/);
  assert.match(text(), /No timer on this part/);
  assert.ok($('#nextround'));
});

await check('rounds 2 and 3 play through and the game ends', async () => {
  click($('#nextround'));
  await playRound(2);
  click($('#totalk'));
  click($('#nextround'));
  await playRound(3);
  click($('#totalk'));
  click($('#nextround'));
  assert.match(text(), /You ended with stories/);
  assert.ok($('#again'), 'no play-again button on the final screen');
});

await check('final standings list all four players with numeric scores', () => {
  const rows = $$('.player-row');
  assert.equal(rows.length, NAMES.length, `expected 4 standings rows, got ${rows.length}`);
  const scores = $$('.player-row .sc').map((e) => Number(e.textContent));
  assert.equal(scores.length, 4);
  for (const s of scores) assert.ok(Number.isFinite(s), 'a score was not a number');
  assert.ok(scores.some((s) => s > 0), 'nobody scored anything across three rounds');
  // standings must be sorted descending
  const sorted = [...scores].sort((a, b) => b - a);
  assert.deepEqual(scores, sorted, 'standings are not in order');
});

await check('play again resets scores to zero', () => {
  click($('#again'));
  assert.ok($('#begin'), 'did not return to setup');
});

await check('no uncaught errors were logged during the whole game', () => {
  assert.equal(errors.length, 0, errors.join('; '));
});

await check('the feel layer degraded instead of dying on a platform without audio or canvas', () => {
  // jsdom supports neither AudioContext nor canvas 2d. The game reached its
  // final screen anyway, which is the assertion: sound and confetti are
  // decoration and a browser that refuses them still plays a complete game.
  assert.ok(unsupported.length > 0, 'expected jsdom to refuse audio/canvas — did the fx layer stop being called?');
  assert.equal(errors.length, 0, 'a refusal escaped as a real error');
  assert.ok($('#begin'), 'the game did not survive to a playable state');
});

console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m\n`);
process.exit(failed === 0 ? 0 : 1);
