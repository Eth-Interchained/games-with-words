import React, { useEffect, useMemo, useState } from 'react';
import type { ClientAnswer, ClientRoom, ClientRound, Player, Reaction } from '../../../shared/types.ts';
import type { ClientMessage } from '../../../shared/protocol.ts';
import { FRAMES_BY_ID, PERMISSION_LINE } from '../../../shared/frames.ts';
import { MAX_ANSWER_LENGTH } from '../../../shared/filter.ts';
import { Avatar, Tile, Timer, Waiting, WordsInPlay, colorFor } from '../ui.tsx';
import { buzz, feel, floatEmoji, sfx } from '../fx.ts';

interface Props {
  room: ClientRoom;
  round: ClientRound;
  me: Player;
  isDealer: boolean;
  send: (m: ClientMessage) => void;
}

const ROW_LABELS = ['Something solid', 'Something that happens', 'Something you feel'];

/* ------------------------------------------------------------------ deal */

export function Dealing({ room, round, me, isDealer, send }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const dealer = room.players.find((p) => p.id === round.dealerId);

  if (!isDealer) {
    return (
      <div className="center stack">
        <div className="kicker">Round {round.number} of {room.settings.totalRounds}</div>
        <h1 style={{ fontSize: 34, letterSpacing: '-0.02em' }}>
          {dealer?.nickname} is picking
          <br />
          <span style={{ color: 'var(--ember)' }}>three words.</span>
        </h1>
        <p className="lede">Whatever they choose, everybody answers it.</p>
        <Waiting label="Waiting on the deck" />
      </div>
    );
  }

  const hand = round.hand ?? [];
  const toggle = (id: string) => {
    const adding = !picked.includes(id);
    if (adding && picked.length < 3) sfx.tap(); else sfx.untap();
    buzz(8);
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id],
    );
  };

  return (
    <div className="stack grow">
      <div>
        <div className="kicker">Round {round.number} — you are dealing</div>
        <h1 style={{ fontSize: 30, marginTop: 6 }}>Pick any three.</h1>
        <p className="lede tiny" style={{ marginTop: 6 }}>
          Mix the rows for a better round. Everyone answers what you choose — including you.
        </p>
      </div>

      {[0, 1, 2].map((r) => (
        <div key={r}>
          <div className="row-label">{ROW_LABELS[r]}</div>
          <div className="tile-grid" style={{ marginTop: 8 }}>
            {hand.slice(r * 3, r * 3 + 3).map((w) => (
              <Tile
                key={w.id}
                word={w}
                picked={picked.includes(w.id)}
                dimmed={picked.length >= 3 && !picked.includes(w.id)}
                onClick={() => toggle(w.id)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="grow" />
      <button
        className="btn ember"
        disabled={picked.length !== 3}
        onClick={() => { feel('lock', [14, 40, 14]); send({ type: 'choose_words', wordIds: picked }); }}
      >
        {picked.length === 3 ? 'Put these words in play' : `Pick ${3 - picked.length} more`}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- writing */

export function Writing({ room, round, me, send }: Props) {
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [nudge, setNudge] = useState(false);
  const mine = round.answers.find((a) => a.mine);
  const frame = round.frameId ? FRAMES_BY_ID[round.frameId] : undefined;

  useEffect(() => { if (mine) setSent(true); }, [mine]);

  // the three words drop in — one note each
  useEffect(() => {
    if (mine) return;
    [0, 1, 2].forEach((i) => sfx.wordDrop(i));
    buzz([10, 90, 10, 90, 14]);
  }, []);

  if (sent || mine) {
    return (
      <div className="stack grow">
        <WordsInPlay words={round.words} compact />
        <div className="divider" />
        <div className="center stack" style={{ gap: 18 }}>
          <div className="kicker">Locked in</div>
          <div className="answer-card">{mine?.body ?? body}</div>
          <Waiting
            label={`${round.submittedCount} of ${room.players.filter((p) => p.connected).length} written`}
          />
        </div>
        <Timer deadline={round.writingDeadline} total={room.settings.writingSeconds} />
      </div>
    );
  }

  const over = body.length > MAX_ANSWER_LENGTH;

  return (
    <div className="stack grow">
      <WordsInPlay words={round.words} />
      <div className="stack" style={{ gap: 8, marginTop: 4 }}>
        <div className="kicker">{frame?.label}</div>
        <div className="question">{round.question}</div>
        <div className="permission">{PERMISSION_LINE}</div>
      </div>

      <textarea
        className="field"
        placeholder="Say the thing you'd actually say…"
        value={body}
        maxLength={MAX_ANSWER_LENGTH + 40}
        autoFocus
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="spread tiny">
        <button className="btn ghost small" onClick={() => setNudge((n) => !n)}>
          {nudge ? 'Hide nudge' : 'Need a nudge?'}
        </button>
        <span className={over ? '' : 'dim'} style={{ color: over ? 'var(--rose)' : undefined }}>
          {body.length}/{MAX_ANSWER_LENGTH}
        </span>
      </div>
      {nudge && <p className="lede tiny" style={{ fontStyle: 'italic' }}>{frame?.nudge}</p>}

      <div className="grow" />
      <Timer deadline={round.writingDeadline} total={room.settings.writingSeconds} />
      <button
        className="btn ember"
        disabled={body.trim().length < 2 || over}
        onClick={() => { feel('lock', 16); send({ type: 'answer', body: body.trim() }); setSent(true); }}
      >
        Lock it in
      </button>
      <p className="tiny dim" style={{ textAlign: 'center' }}>
        Being unmistakably <em>you</em> is worth more than hiding.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- lineup */

function Reactions({
  answer, send,
}: { answer: ClientAnswer; send: (m: ClientMessage) => void }) {
  const counts = (r: Reaction) =>
    Object.values(answer.reactions).filter((x) => x === r).length;
  const opts: { key: Reaction; icon: string }[] = [
    { key: 'heart', icon: '❤️' },
    { key: 'laugh', icon: '😂' },
    { key: 'eyes', icon: '👀' },
  ];
  if (answer.mine) {
    return (
      <div className="row tiny dim" style={{ justifyContent: 'center', gap: 14 }}>
        {opts.map((o) => (
          <span key={o.key}>{o.icon} {counts(o.key)}</span>
        ))}
        <span className="chip ember">yours</span>
      </div>
    );
  }
  return (
    <div className="reactions">
      {opts.map((o) => (
        <button
          key={o.key}
          className="react-btn"
          onClick={(e) => {
            sfx.react();
            buzz(9);
            floatEmoji(o.icon, e.currentTarget);
            send({ type: 'react', answerId: answer.id, reaction: o.key });
          }}
        >
          {o.icon} <span className="n">{counts(o.key)}</span>
        </button>
      ))}
    </div>
  );
}

export function Lineup({ room, round, isDealer, send }: Props) {
  const idx = Math.min(round.lineupIndex, Math.max(0, round.answers.length - 1));
  const answer = round.answers[idx];
  useEffect(() => { sfx.card(); buzz(10); }, [idx]);
  if (!answer) return <Waiting label="Shuffling" />;

  return (
    <div className="stack grow">
      <WordsInPlay words={round.words} compact />
      <div className="spread">
        <span className="kicker">The line-up</span>
        <span className="pill-count">{idx + 1} / {round.answers.length}</span>
      </div>

      <div className="center" style={{ gap: 18 }}>
        <div className={`answer-card ${answer.mine ? 'mine' : ''}`} key={answer.id}>
          {answer.body}
        </div>
        <Reactions answer={answer} send={send} />
      </div>

      {isDealer ? (
        <button className="btn" onClick={() => { feel('press', 12); send({ type: 'advance' }); }}>
          {idx + 1 >= round.answers.length ? 'Everyone has read them — start matching' : 'Next answer'}
        </button>
      ) : (
        <Waiting label="The dealer turns the cards" />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- matching */

export function Matching({ room, round, me, isDealer, send }: Props) {
  const others = room.players.filter((p) => p.id !== me.id);
  const theirs = round.answers.filter((a) => !a.mine);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (round.yourMatches.length > 0) {
      setPicks(Object.fromEntries(round.yourMatches.map((m) => [m.answerId, m.guessedAuthorId])));
      setLocked(true);
    }
  }, [round.yourMatches.length]);

  const assign = (answerId: string, playerId: string) => {
    sfx.tap();
    buzz(9);
    setPicks((prev) => {
      const next: Record<string, string> = {};
      // a name can only sit on one card — this is a matching puzzle
      for (const [aid, pid] of Object.entries(prev)) {
        if (pid !== playerId) next[aid] = pid;
      }
      next[answerId] = prev[answerId] === playerId ? '' : playerId;
      if (!next[answerId]) delete next[answerId];
      return next;
    });
  };

  const complete = theirs.every((a) => picks[a.id]);

  if (locked) {
    return (
      <div className="stack grow">
        <WordsInPlay words={round.words} compact />
        <div className="center stack" style={{ gap: 14 }}>
          <div className="kicker">Guesses in</div>
          <h2 style={{ fontSize: 26 }}>Let's see who knew who.</h2>
          <Waiting
            label={`${round.matchedCount} of ${room.players.filter((p) => p.connected).length} have guessed`}
          />
        </div>
        {isDealer && (
          <button className="btn ghost" onClick={() => send({ type: 'advance' })}>
            Close it and reveal
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="stack grow">
      <WordsInPlay words={round.words} compact />
      <div>
        <div className="kicker">Who wrote what</div>
        <p className="lede tiny" style={{ marginTop: 4 }}>
          One name per answer. You know these people better than you think.
        </p>
      </div>

      {theirs.map((a) => (
        <div className="match-item" key={a.id}>
          <div className="body">“{a.body}”</div>
          <div className="name-picks">
            {others.map((p) => {
              const on = picks[a.id] === p.id;
              const usedElsewhere = Object.entries(picks).some(
                ([aid, pid]) => pid === p.id && aid !== a.id,
              );
              return (
                <button
                  key={p.id}
                  className={`name-pick ${on ? 'on' : ''} ${usedElsewhere ? 'used' : ''}`}
                  onClick={() => assign(a.id, p.id)}
                >
                  <span className="dot" style={{ background: colorFor(p.avatarSeed) }} />
                  {p.nickname}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        className="btn ember"
        disabled={!complete}
        onClick={() => {
          feel('lock', [14, 30, 14]);
          send({
            type: 'matches',
            pairs: Object.entries(picks).map(([answerId, guessedAuthorId]) => ({
              answerId, guessedAuthorId,
            })),
          });
          setLocked(true);
        }}
      >
        {complete ? 'Lock in my guesses' : `${theirs.length - Object.keys(picks).length} to go`}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- reveal */

export function Reveal({ room, round, me, isDealer, send }: Props) {
  const nameOf = (id?: string) => room.players.find((p) => p.id === id)?.nickname ?? '—';
  const playerOf = (id?: string) => room.players.find((p) => p.id === id);
  const myMatches = new Map(round.yourMatches.map((m) => [m.answerId, m.guessedAuthorId]));
  const myScore = round.scores.find((s) => s.playerId === me.id);
  const correct = round.answers.filter(
    (a) => myMatches.get(a.id) && myMatches.get(a.id) === a.authorId,
  ).length;

  // turn the cards over one at a time — the verdict lands per card
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= round.answers.length) return;
    const t = setTimeout(() => {
      const a = round.answers[shown];
      const guessed = myMatches.get(a.id);
      if (a.mine) sfx.card();
      else if (guessed && guessed === a.authorId) { sfx.correct(); buzz([12, 40, 20]); }
      else if (guessed) { sfx.wrong(); buzz(24); }
      else sfx.card();
      setShown((n) => n + 1);
    }, shown === 0 ? 260 : 620);
    return () => clearTimeout(t);
  }, [shown, round.answers.length]);
  const done = shown >= round.answers.length;

  return (
    <div className="stack grow">
      <WordsInPlay words={round.words} compact />
      <div className="spread">
        <span className="kicker">Reveal</span>
        <span className="pill-count">
          you called {correct} of {myMatches.size}
        </span>
      </div>

      {round.answers.slice(0, shown).map((a) => {
        const author = playerOf(a.authorId);
        const guessed = myMatches.get(a.id);
        const got = guessed && guessed === a.authorId;
        return (
          <div
            className={`answer-card small flip ${got ? 'hit' : guessed ? 'miss' : ''}`}
            key={a.id}
          >
            {a.body}
            <div className="card-author row" style={{ gap: 8 }}>
              {author && <Avatar player={author} />}
              <span>{nameOf(a.authorId)}</span>
              {a.mine && <span className="chip ember">you</span>}
              {!a.mine && guessed && (
                <span className={`chip ${got ? 'sage' : ''}`}>
                  {got ? 'you called it' : `you said ${nameOf(guessed)}`}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {!done && <Waiting label="Turning them over" />}

      {done && <div className="divider" />}
      {done && <div className="kicker">This round</div>}
      {done && round.scores
        .slice()
        .sort((a, b) => b.total - a.total)
        .map((s) => {
          const p = playerOf(s.playerId);
          if (!p) return null;
          const bits = [
            s.recognized ? `read as you ×${s.recognized / 2}` : '',
            s.readTheRoom ? `${s.readTheRoom} right` : '',
            s.mostLoved ? 'most loved' : '',
          ].filter(Boolean);
          return (
            <div className="score-line" key={s.playerId}>
              <Avatar player={p} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.nickname}</div>
                <div className="breakdown">{bits.join(' · ') || 'no points this round'}</div>
              </div>
              <span className="delta">+{s.total}</span>
            </div>
          );
        })}

      <div className="grow" />
      {isDealer ? (
        <button
          className="btn ember"
          disabled={!done}
          onClick={() => { feel('spotlight', 18); send({ type: 'advance' }); }}
        >
          One answer deserves the floor
        </button>
      ) : (
        <Waiting label="The dealer has one more card to turn" />
      )}
      {done && myScore && (
        <p className="tiny dim" style={{ textAlign: 'center' }}>
          You picked up {myScore.total} this round.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- tabletalk */

export function TableTalk({ room, round, isDealer, send }: Props) {
  const answer = round.answers.find((a) => a.id === round.tableTalkAnswerId);
  const author = room.players.find((p) => p.id === answer?.authorId);
  const last = round.number >= room.settings.totalRounds;

  const headline =
    round.tableTalkReason === 'surprise'
      ? 'Nobody saw that coming.'
      : round.tableTalkReason === 'loved'
        ? 'This one landed.'
        : 'Let’s hear about this one.';

  useEffect(() => { sfx.spotlight(); buzz([20, 60, 30]); }, []);

  return (
    <div className="stack grow">
      <div className="kicker">Table talk</div>
      <div className="center stack" style={{ gap: 22 }}>
        <h1 style={{ fontSize: 30, letterSpacing: '-0.02em' }}>{headline}</h1>
        {answer && <div className="answer-card">{answer.body}</div>}
        <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
          {author && <Avatar player={author} size="lg" />}
          <div>
            <div className="serif" style={{ fontSize: 22, fontWeight: 700 }}>
              {author?.nickname}
            </div>
            <div className="tiny dim">tell us the whole thing</div>
          </div>
        </div>
        <p className="lede tiny" style={{ textAlign: 'center', fontStyle: 'italic' }}>
          No timer on this part. That’s the point.
        </p>
      </div>

      {isDealer ? (
        <button className="btn" onClick={() => { feel('press', 12); send({ type: 'advance' }); }}>
          {last ? 'Okay — the final word' : 'Okay, next round'}
        </button>
      ) : (
        <Waiting label="Talk it out" />
      )}
    </div>
  );
}
