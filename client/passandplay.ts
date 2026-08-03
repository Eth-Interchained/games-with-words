/**
 * Pass-and-play: the whole game on one phone, around one table.
 *
 * This imports the REAL shared modules — the same 300-word pack, the same
 * prompt frames, the same scoring functions the multiplayer server uses. It
 * is not a mock of the game; it is the game with the network removed and a
 * hand-off screen in its place.
 *
 * Bundled to a single self-contained HTML file by scripts/build-static.mjs.
 */

import { CORE_PACK, packFor } from '../shared/words.ts';
import { FRAMES, FRAMES_BY_ID, PERMISSION_LINE, questionFor } from '../shared/frames.ts';
import { mulberry32, shuffle, weightedPick } from '../shared/rng.ts';
import { pickTableTalk, scoreRound } from '../shared/scoring.ts';
import { filterAnswer } from '../shared/filter.ts';
import type { Answer, Match, Player, Word } from '../shared/types.ts';
import { buzz, confetti, feel, floatEmoji, isMuted, sfx, toggleMute } from './src/fx.ts';

const AVATAR_COLORS = ['#e0763a', '#7fa189', '#c98b6b', '#8b93c4', '#d9b166', '#94a86b', '#c4553d', '#93a1ad'];
const ROW_LABELS = ['Something solid', 'Something that happens', 'Something you feel'];

interface State {
  screen: string;
  players: Player[];
  totalRounds: number;
  roundNumber: number;
  dealerIdx: number;
  hand: Word[];
  picked: string[];
  words?: Word[];
  question?: string;
  frameLabel?: string;
  frameNudge?: string;
  answers: Answer[];
  matches: Match[];
  turn: number;
  lineupIdx: number;
  draftPicks: Record<string, string>;
  roundScores: ReturnType<typeof scoreRound> | null;
  tableTalk: ReturnType<typeof pickTableTalk>;
  seed: number;
}

const S: State = {
  screen: 'home',
  players: [],
  totalRounds: 3,
  roundNumber: 0,
  dealerIdx: 0,
  hand: [],
  picked: [],
  answers: [],
  matches: [],
  turn: 0,
  lineupIdx: 0,
  draftPicks: {},
  roundScores: null,
  tableTalk: undefined,
  seed: Math.floor(Math.random() * 2 ** 31),
};

let splash: { round: number; who: string } | null = null;

const root = document.getElementById('root')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const dealer = () => S.players[S.dealerIdx];
const colorOf = (i: number) => AVATAR_COLORS[i % AVATAR_COLORS.length];
const idxOf = (id: string) => S.players.findIndex((p) => p.id === id);
const nameOf = (id: string) => S.players.find((p) => p.id === id)?.nickname ?? '—';

function avatar(id: string, lg = false) {
  const i = idxOf(id);
  const p = S.players[i];
  if (!p) return '';
  return `<div class="avatar ${lg ? 'lg' : ''}" style="background:${colorOf(i)}">${esc(p.nickname.slice(0, 2).toUpperCase())}</div>`;
}

function wordsHTML(compact = false) {
  if (!S.words) return '';
  return `<div class="words-in-play ${compact ? 'compact' : ''}">${S.words.map((w) => `<div class="w">${esc(w.text)}</div>`).join('')}</div>`;
}

/* ------------------------------------------------------------------ deal */

function dealHand(): Word[] {
  const rand = mulberry32(S.seed + S.roundNumber * 104729);
  const pool = packFor('core', true);
  const concrete = pool.filter((w) => ['people', 'places', 'objects'].includes(w.category));
  const moments = pool.filter((w) => w.category === 'moments');
  const feelings = pool.filter((w) => w.category === 'feelings');
  return [
    ...shuffle(rand, concrete).slice(0, 3),
    ...shuffle(rand, moments).slice(0, 3),
    ...shuffle(rand, feelings).slice(0, 3),
  ];
}

function startRound() {
  S.roundNumber += 1;
  S.hand = dealHand();
  S.picked = [];
  S.words = undefined;
  S.answers = [];
  S.matches = [];
  S.turn = 0;
  S.lineupIdx = 0;
  S.draftPicks = {};
  S.roundScores = null;
  S.tableTalk = undefined;
  splash = { round: S.roundNumber, who: dealer().nickname };
  sfx.round();
  buzz([14, 40, 14]);
  render();
  setTimeout(() => {
    const el = document.querySelector('.splash');
    el?.classList.add('out');
  }, 1150);
  setTimeout(() => { splash = null; go('handoff-deal'); }, 1600);
}

/* --------------------------------------------------------------- screens */

const screens: Record<string, () => string> = {
  home: () => `
    <div class="center stack" style="gap:26px">
      <div>
        <div class="wordmark">Games<span class="with">with</span>Words</div>
        <p class="lede" style="margin-top:14px;font-size:17px">Three words. Everyone has a different story.</p>
      </div>
      <div class="answer-card small">
        One phone, passed around the table. Same words, same scoring as the
        full game — just no second device needed.
      </div>
    </div>
    <div class="stack">
      <button class="btn ember" data-go="setup">Start a game</button>
      <button class="btn ghost" data-go="rules">How to play</button>
    </div>`,

  rules: () => `
    <div class="stack grow" style="overflow-y:auto">
      <h1 style="font-size:30px">The whole game<br>in five lines.</h1>
      <ol class="stack" style="padding-left:20px;gap:12px;margin-top:6px">
        <li class="lede">One player deals — they pick <b>three words</b> from nine.</li>
        <li class="lede">The app turns them into a question. <b>Everybody answers</b>, dealer included.</li>
        <li class="lede">Answers come up <b>anonymously</b>, one at a time.</li>
        <li class="lede">Then <b>match every answer to a person</b>. One name per card.</li>
        <li class="lede">Reveal, score, and <b>somebody tells the real story</b>.</li>
      </ol>
      <div class="divider"></div>
      <div class="kicker">Scoring</div>
      <div class="score-line"><span class="delta">+2</span><div style="flex:1"><b>Each person who knew your answer was yours</b><div class="breakdown">The big one.</div></div></div>
      <div class="score-line"><span class="delta">+1</span><div style="flex:1"><b>Each answer you match correctly</b></div></div>
      <div class="score-line"><span class="delta">+1</span><div style="flex:1"><b>Most hearts on your answer</b></div></div>
      <div class="answer-card small" style="margin-top:6px">
        The trick: you win by being <em>recognizable</em>, not by hiding. Write
        the thing you'd actually say.
      </div>
      <p class="lede tiny">Every answer may be true, fictional, or somewhere in between.</p>
    </div>
    <button class="btn" data-go="home">Got it</button>`,

  setup: () => `
    <div class="stack grow">
      <div class="kicker">Who's playing</div>
      <h1 style="font-size:30px">Add everyone<br>at the table.</h1>
      <div class="stack" style="gap:8px;margin-top:8px">
        ${S.players.map((p, i) => `
          <div class="player-row">
            <div class="avatar" style="background:${colorOf(i)}">${esc(p.nickname.slice(0, 2).toUpperCase())}</div>
            <span class="nm">${esc(p.nickname)}</span>
            <button class="btn ghost small" data-remove="${p.id}">remove</button>
          </div>`).join('')}
      </div>
      ${S.players.length < 8 ? `
        <div class="row" style="gap:8px;margin-top:4px">
          <input class="field" id="nick" placeholder="Name" maxlength="16" autocomplete="off">
          <button class="btn small ember" id="addp" style="width:auto;padding:0 20px;min-height:52px">Add</button>
        </div>` : ''}
      <div class="grow"></div>
      <div class="spread" style="margin-bottom:10px">
        <span class="tiny dim">Rounds</span>
        <div class="row" style="gap:6px">
          ${[3, 5, 7].map((n) => `<button class="btn ghost small" data-rounds="${n}" style="${S.totalRounds === n ? 'border-color:var(--ember);color:var(--paper)' : ''}">${n}</button>`).join('')}
        </div>
      </div>
      <button class="btn ember" id="begin" ${S.players.length < 3 ? 'disabled' : ''}>
        ${S.players.length < 3 ? `Need ${3 - S.players.length} more` : 'Deal the first round'}
      </button>
    </div>`,

  'handoff-deal': () => handoff(dealer().id, 'is dealing', 'They pick three words. Nobody else looks.'),

  deal: () => `
    <div class="stack grow">
      <div class="kicker">Round ${S.roundNumber} — ${esc(dealer().nickname)} is dealing</div>
      <h1 style="font-size:28px;margin-top:6px">Pick any three.</h1>
      <p class="lede tiny">Mixing the rows makes a better round.</p>
      ${[0, 1, 2].map((r) => `
        <div class="row-label">${ROW_LABELS[r]}</div>
        <div class="tile-grid" style="margin-top:8px">
          ${S.hand.slice(r * 3, r * 3 + 3).map((w) => `
            <button class="tile ${S.picked.includes(w.id) ? 'picked' : ''} ${S.picked.length >= 3 && !S.picked.includes(w.id) ? 'dimmed' : ''}" data-tile="${w.id}">${esc(w.text)}</button>
          `).join('')}
        </div>`).join('')}
      <div class="grow"></div>
      <button class="btn ember" id="lockwords" ${S.picked.length !== 3 ? 'disabled' : ''}>
        ${S.picked.length === 3 ? 'Put these words in play' : `Pick ${3 - S.picked.length} more`}
      </button>
    </div>`,

  'handoff-write': () => handoff(S.players[S.turn].id, 'is up', 'Everyone answers the same question.'),

  write: () => {
    const p = S.players[S.turn];
    return `
    <div class="stack grow">
      ${wordsHTML()}
      <div class="stack" style="gap:8px;margin-top:4px">
        <div class="kicker">${esc(S.frameLabel ?? '')} · ${esc(p.nickname)}</div>
        <div class="question">${esc(S.question ?? '')}</div>
        <div class="permission">${PERMISSION_LINE}</div>
      </div>
      <textarea class="field" id="ans" placeholder="Say the thing you'd actually say…" maxlength="220"></textarea>
      <div class="spread tiny">
        <button class="btn ghost small" id="nudge">Need a nudge?</button>
        <span class="dim" id="cc">0/180</span>
      </div>
      <p class="lede tiny" id="nudgetext" style="display:none;font-style:italic">${esc(S.frameNudge ?? '')}</p>
      <div class="grow"></div>
      <button class="btn ember" id="lockans" disabled>Lock it in &amp; pass on</button>
      <p class="tiny dim" style="text-align:center">Being unmistakably <em>you</em> is worth more than hiding.</p>
    </div>`;
  },

  lineup: () => {
    const a = S.answers[S.lineupIdx];
    const hearts = Object.values(a.reactions).filter((r) => r === 'heart').length;
    const laughs = Object.values(a.reactions).filter((r) => r === 'laugh').length;
    const last = S.lineupIdx + 1 >= S.answers.length;
    return `
    <div class="stack grow">
      ${wordsHTML(true)}
      <div class="spread"><span class="kicker">The line-up</span>
        <span class="pill-count">${S.lineupIdx + 1} / ${S.answers.length}</span></div>
      <div class="center" style="gap:18px">
        <div class="answer-card">${esc(a.body)}</div>
        <div class="reactions">
          <button class="react-btn" data-react="heart">❤️ <span class="n">${hearts}</span></button>
          <button class="react-btn" data-react="laugh">😂 <span class="n">${laughs}</span></button>
        </div>
        <p class="tiny dim" style="text-align:center">Read it out loud. React together.</p>
      </div>
      <button class="btn" id="nextcard">${last ? 'Now match them up' : 'Next answer'}</button>
    </div>`;
  },

  'handoff-match': () => handoff(S.players[S.turn].id, 'guesses', 'Match every answer to a person.'),

  match: () => {
    const me = S.players[S.turn];
    const theirs = S.answers.filter((a) => a.authorId !== me.id);
    const others = S.players.filter((p) => p.id !== me.id);
    const done = theirs.every((a) => S.draftPicks[a.id]);
    return `
    <div class="stack grow" style="overflow-y:auto">
      ${wordsHTML(true)}
      <div class="kicker">${esc(me.nickname)} — who wrote what</div>
      ${theirs.map((a) => `
        <div class="match-item">
          <div class="body">“${esc(a.body)}”</div>
          <div class="name-picks">
            ${others.map((p) => {
              const on = S.draftPicks[a.id] === p.id;
              const used = Object.entries(S.draftPicks).some(([aid, pid]) => pid === p.id && aid !== a.id);
              return `<button class="name-pick ${on ? 'on' : ''} ${used ? 'used' : ''}" data-pair="${a.id}|${p.id}">
                <span class="dot" style="background:${colorOf(idxOf(p.id))}"></span>${esc(p.nickname)}</button>`;
            }).join('')}
          </div>
        </div>`).join('')}
      <button class="btn ember" id="lockmatch" ${done ? '' : 'disabled'}>
        ${done ? 'Lock in &amp; pass on' : `${theirs.length - Object.keys(S.draftPicks).length} to go`}
      </button>
    </div>`;
  },

  reveal: () => {
    const sc = S.roundScores!;
    return `
    <div class="stack grow" style="overflow-y:auto">
      ${wordsHTML(true)}
      <div class="kicker">Reveal</div>
      ${S.answers.map((a) => `
        <div class="answer-card small flip ${(sc.correctByAnswer[a.id] ?? 0) > 0 ? 'hit' : ''}">${esc(a.body)}
          <div class="card-author row" style="gap:8px">${avatar(a.authorId)}<span>${esc(nameOf(a.authorId))}</span>
          <span class="chip ${(sc.correctByAnswer[a.id] ?? 0) === 0 ? '' : 'sage'}">${sc.correctByAnswer[a.id] ?? 0} called it</span></div>
        </div>`).join('')}
      <div class="divider"></div>
      <div class="kicker">This round</div>
      ${sc.lines.slice().sort((a, b) => b.total - a.total).map((l) => {
        const bits = [
          l.recognized ? `read as you ×${l.recognized / 2}` : '',
          l.readTheRoom ? `${l.readTheRoom} right` : '',
          l.mostLoved ? 'most loved' : '',
        ].filter(Boolean).join(' · ');
        return `<div class="score-line">${avatar(l.playerId)}
          <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(nameOf(l.playerId))}</div>
          <div class="breakdown">${bits || 'no points this round'}</div></div>
          <span class="delta">+${l.total}</span></div>`;
      }).join('')}
      <div class="grow"></div>
      <button class="btn ember" id="totalk">One answer deserves the floor</button>
    </div>`;
  },

  tabletalk: () => {
    const tt = S.tableTalk;
    const a = S.answers.find((x) => x.id === tt?.answerId);
    const last = S.roundNumber >= S.totalRounds;
    const headline = tt?.reason === 'surprise' ? 'Nobody saw that coming.'
      : tt?.reason === 'loved' ? 'This one landed.' : 'Let’s hear about this one.';
    return `
    <div class="stack grow">
      <div class="kicker">Table talk</div>
      <div class="center stack" style="gap:22px">
        <h1 style="font-size:30px">${headline}</h1>
        ${a ? `<div class="answer-card">${esc(a.body)}</div>` : ''}
        <div class="row" style="gap:10px;justify-content:center">
          ${a ? avatar(a.authorId, true) : ''}
          <div><div class="serif" style="font-size:22px;font-weight:700">${a ? esc(nameOf(a.authorId)) : ''}</div>
          <div class="tiny dim">tell us the whole thing</div></div>
        </div>
        <p class="lede tiny" style="text-align:center;font-style:italic">No timer on this part. That’s the point.</p>
      </div>
      <button class="btn" id="nextround">${last ? 'Okay — the final word' : 'Okay, next round'}</button>
    </div>`;
  },

  final: () => {
    const standings = S.players.slice().sort((a, b) => b.score - a.score);
    return `
    <div class="stack grow" style="overflow-y:auto">
      <div class="kicker">You started with words</div>
      <h1 style="font-size:32px">You ended with <span style="color:var(--ember)">stories.</span></h1>
      <div class="divider"></div>
      <div class="kicker">Final standings</div>
      ${standings.map((p, i) => `
        <div class="player-row">
          <span class="serif dim" style="width:18px;font-weight:700">${i + 1}</span>
          ${avatar(p.id)}<span class="nm">${esc(p.nickname)}</span>
          ${i === 0 ? '<span class="chip ember">most points</span>' : ''}
          <span class="sc">${p.score}</span>
        </div>`).join('')}
      <p class="lede tiny" style="text-align:center;margin-top:6px">
        ${esc(standings[0]?.nickname ?? '')} took the points. Everybody took something else.
      </p>
      <div class="grow"></div>
      <button class="btn ember" id="again">Play again</button>
    </div>`;
  },
};

function handoff(playerId: string, verb: string, sub: string) {
  return `
    <div class="center stack" style="gap:20px;text-align:center">
      <div class="kicker">Pass the phone</div>
      <div style="display:flex;justify-content:center">${avatar(playerId, true)}</div>
      <h1 style="font-size:36px;letter-spacing:-0.02em">${esc(nameOf(playerId))}<br><span style="color:var(--ember)">${verb}.</span></h1>
      <p class="lede">${sub}</p>
    </div>
    <button class="btn ember" id="ready">I'm ${esc(nameOf(playerId))} — ready</button>`;
}

/* ------------------------------------------------------------------ flow */

function go(screen: string) {
  S.screen = screen;
  render();
}

function beginWriting() {
  const rand = mulberry32(S.seed + S.roundNumber * 7717);
  const frame = weightedPick(rand, FRAMES);
  const words = S.picked.map((id) => S.hand.find((w) => w.id === id)!) as [Word, Word, Word];
  S.words = words;
  S.frameLabel = frame.label;
  S.frameNudge = frame.nudge;
  S.question = questionFor(frame.id, words, Math.floor(rand() * 5));
  S.turn = 0;
  go('handoff-write');
}

function finishRound() {
  const res = scoreRound(S.players, S.answers, S.matches);
  S.roundScores = res;
  for (const line of res.lines) {
    const p = S.players.find((x) => x.id === line.playerId);
    if (p) p.score += line.total;
  }
  S.tableTalk = pickTableTalk(S.answers, res.correctByAnswer);
  go('reveal');
}

/* ---------------------------------------------------------------- render */

function render() {
  const showTop = !['home'].includes(S.screen);
  root.innerHTML = `
    <div class="app">
      ${showTop ? `<div class="topbar"><div class="brand">Games with Words</div>
        <div class="row" style="gap:10px"><div class="meta">${S.roundNumber ? `R${S.roundNumber}/${S.totalRounds}` : 'pass &amp; play'}</div>
        <button class="mute-btn" id="mutebtn" aria-label="Sound">${isMuted() ? '\u{1F507}' : '\u{1F50A}'}</button></div></div>` : ''}
      ${screens[S.screen]()}
    </div>
    ${splash ? `<div class="splash"><div class="sub">Round ${splash.round} of ${S.totalRounds}</div>
      <div class="n">${splash.round}</div><div class="who">${esc(splash.who)} deals</div></div>` : ''}`;
  wire();
  window.scrollTo(0, 0);
}

function wire() {
  const mb = document.getElementById('mutebtn');
  if (mb) mb.onclick = () => { mb.textContent = toggleMute() ? '\u{1F507}' : '\u{1F50A}'; };

  root.querySelectorAll<HTMLElement>('[data-go]').forEach((el) =>
    el.onclick = () => { feel('press'); go(el.dataset.go!); });

  root.querySelectorAll<HTMLElement>('[data-rounds]').forEach((el) =>
    el.onclick = () => { S.totalRounds = Number(el.dataset.rounds); render(); });

  root.querySelectorAll<HTMLElement>('[data-remove]').forEach((el) =>
    el.onclick = () => { S.players = S.players.filter((p) => p.id !== el.dataset.remove); render(); });

  const addBtn = document.getElementById('addp');
  const nickEl = document.getElementById('nick') as HTMLInputElement | null;
  const addPlayer = () => {
    const v = nickEl?.value.trim();
    if (!v) return;
    S.players.push({
      id: 'p' + Math.random().toString(36).slice(2, 9),
      nickname: v.slice(0, 16), avatarSeed: 'ember', connected: true,
      joinedAt: Date.now(), score: 0, roundsDealt: 0, isHost: S.players.length === 0, ready: false,
    });
    feel('join', 10);
    render();
    (document.getElementById('nick') as HTMLInputElement | null)?.focus();
  };
  if (addBtn) addBtn.onclick = addPlayer;
  if (nickEl) nickEl.onkeydown = (e) => { if ((e as KeyboardEvent).key === 'Enter') addPlayer(); };

  const begin = document.getElementById('begin');
  if (begin) begin.onclick = () => { feel('lock', [16, 40, 16]); S.dealerIdx = 0; startRound(); };

  const ready = document.getElementById('ready');
  if (ready) ready.onclick = () => {
    feel('press', 12);
    if (S.screen === 'handoff-deal') go('deal');
    else if (S.screen === 'handoff-write') go('write');
    else if (S.screen === 'handoff-match') go('match');
  };

  root.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) =>
    el.onclick = () => {
      const id = el.dataset.tile!;
      if (S.picked.includes(id)) sfx.untap(); else if (S.picked.length < 3) sfx.tap();
      buzz(8);
      S.picked = S.picked.includes(id)
        ? S.picked.filter((x) => x !== id)
        : S.picked.length >= 3 ? S.picked : [...S.picked, id];
      render();
    });

  const lockWords = document.getElementById('lockwords');
  if (lockWords) lockWords.onclick = () => { feel('lock', [14, 40, 14]); beginWriting(); };

  const ansEl = document.getElementById('ans') as HTMLTextAreaElement | null;
  if (ansEl) {
    const lock = document.getElementById('lockans') as HTMLButtonElement;
    const cc = document.getElementById('cc')!;
    ansEl.oninput = () => {
      const n = ansEl.value.trim().length;
      cc.textContent = `${n}/180`;
      cc.style.color = n > 180 ? 'var(--rose)' : '';
      lock.disabled = n < 2 || n > 180;
    };
    ansEl.focus();
    lock.onclick = () => {
      const verdict = filterAnswer(ansEl.value, { familyMode: true });
      if (!verdict.ok) { toast(verdict.reason); return; }
      const p = S.players[S.turn];
      S.answers.push({
        id: 'a' + Math.random().toString(36).slice(2, 9),
        roundNumber: S.roundNumber, authorId: p.id, body: verdict.body,
        submittedAt: Date.now(), reactions: {},
      });
      feel('lock', 16);
      S.turn += 1;
      if (S.turn >= S.players.length) {
        S.answers = shuffle(mulberry32(S.seed + S.roundNumber * 6151), S.answers);
        S.lineupIdx = 0;
        go('lineup');
      } else go('handoff-write');
    };
    const nudge = document.getElementById('nudge')!;
    nudge.onclick = () => {
      const t = document.getElementById('nudgetext')!;
      t.style.display = t.style.display === 'none' ? 'block' : 'none';
    };
  }

  root.querySelectorAll<HTMLElement>('[data-react]').forEach((el) =>
    el.onclick = () => {
      const a = S.answers[S.lineupIdx];
      const kind = el.dataset.react as 'heart' | 'laugh';
      // one phone: reactions are the table's, keyed by a counter
      const key = `t${Object.keys(a.reactions).length}`;
      a.reactions[key] = kind;
      sfx.react();
      buzz(9);
      floatEmoji(kind === 'heart' ? '\u2764\uFE0F' : '\u{1F602}', el);
      render();
    });

  const nextCard = document.getElementById('nextcard');
  if (nextCard) nextCard.onclick = () => {
    sfx.card();
    buzz(10);
    S.lineupIdx += 1;
    if (S.lineupIdx >= S.answers.length) { S.turn = 0; S.draftPicks = {}; go('handoff-match'); }
    else render();
  };

  root.querySelectorAll<HTMLElement>('[data-pair]').forEach((el) =>
    el.onclick = () => {
      const [aid, pid] = el.dataset.pair!.split('|');
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(S.draftPicks)) if (v !== pid) next[k] = v;
      if (S.draftPicks[aid] !== pid) next[aid] = pid;
      S.draftPicks = next;
      sfx.tap();
      buzz(9);
      render();
    });

  const lockMatch = document.getElementById('lockmatch');
  if (lockMatch) lockMatch.onclick = () => {
    const me = S.players[S.turn];
    for (const [answerId, guessedAuthorId] of Object.entries(S.draftPicks)) {
      S.matches.push({ guesserId: me.id, answerId, guessedAuthorId });
    }
    feel('lock', [14, 30, 14]);
    S.turn += 1;
    S.draftPicks = {};
    if (S.turn >= S.players.length) finishRound();
    else go('handoff-match');
  };

  const toTalk = document.getElementById('totalk');
  if (toTalk) toTalk.onclick = () => { feel('spotlight', [20, 60, 30]); go('tabletalk'); };

  const nextRound = document.getElementById('nextround');
  if (nextRound) nextRound.onclick = () => {
    feel('press', 12);
    if (S.roundNumber >= S.totalRounds) {
      go('final');
      sfx.fanfare();
      buzz([24, 60, 24, 60, 40]);
      confetti();
      return;
    }
    // the deck goes to whoever read the room best, never twice in a row
    const best = S.roundScores!.lines
      .filter((l) => l.playerId !== dealer().id)
      .sort((a, b) => b.readTheRoom - a.readTheRoom)[0];
    S.dealerIdx = best ? idxOf(best.playerId) : (S.dealerIdx + 1) % S.players.length;
    startRound();
  };

  const again = document.getElementById('again');
  if (again) again.onclick = () => {
    S.roundNumber = 0;
    S.dealerIdx = 0;
    S.seed = Math.floor(Math.random() * 2 ** 31);
    for (const p of S.players) p.score = 0;
    go('setup');
  };
}

function toast(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// sanity: the pack really did come along for the ride
console.log(`Games with Words — pass & play · ${CORE_PACK.length} words · ${FRAMES.length} frames`);
void FRAMES_BY_ID;
render();
