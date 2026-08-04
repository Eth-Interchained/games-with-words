import React, { useEffect, useMemo, useState } from 'react';
import { useNet } from './net.ts';
import { buzz, confetti, feel, isMuted, sfx, toggleMute } from './fx.ts';
import { Avatar, RoundSplash, TopBar, Toast, Waiting } from './ui.tsx';
import { Dealing, Lineup, Matching, Reveal, TableTalk, Writing } from './screens/Play.tsx';
import type { ClientRoom, Player } from '../../shared/types.ts';
import type { ClientMessage } from '../../shared/protocol.ts';

const NICK_KEY = 'gww.nick';

/* ------------------------------------------------------------------ home */

function Home({
  onJoin, presetCode,
}: {
  onJoin: (code: string, nick: string) => void;
  presetCode: string;
}) {
  const [mode, setMode] = useState<'idle' | 'host' | 'join' | 'rules'>(
    presetCode ? 'join' : 'idle',
  );
  const [nick, setNick] = useState(localStorage.getItem(NICK_KEY) ?? '');
  const [code, setCode] = useState(presetCode);

  const go = (joinCode: string) => {
    const n = nick.trim() || 'Player';
    localStorage.setItem(NICK_KEY, n);
    feel('lock', 14);
    onJoin(joinCode, n);
  };

  if (mode === 'rules') return <Rules onBack={() => setMode('idle')} />;

  return (
    <div className="stack grow">
      <TopBar />
      <div className="center stack" style={{ gap: 26 }}>
        <div>
          <div className="wordmark">
            Games
            <span className="with">with</span>
            Words
          </div>
          <p className="lede" style={{ marginTop: 14, fontSize: 17 }}>
            Three words. Everyone has a different story.
          </p>
        </div>

        {mode !== 'idle' && (
          <div className="stack">
            <input
              className="field"
              placeholder="Your name"
              value={nick}
              maxLength={16}
              autoFocus={!presetCode}
              onChange={(e) => setNick(e.target.value)}
            />
            {mode === 'join' && (
              <input
                className="field code-input"
                placeholder="CODE"
                value={code}
                maxLength={4}
                autoFocus={Boolean(presetCode)}
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
            )}
          </div>
        )}
      </div>

      <div className="stack">
        {mode === 'idle' && (
          <>
            <button className="btn ember" onClick={() => { sfx.press(); setMode('host'); }}>Host a game</button>
            <button className="btn ghost" onClick={() => { sfx.press(); setMode('join'); }}>Join a game</button>
            <button className="btn ghost" onClick={() => { sfx.press(); setMode('rules'); }}>How to play</button>
          </>
        )}
        {mode === 'host' && (
          <>
            <button className="btn ember" disabled={!nick.trim()} onClick={() => go('NEW')}>
              Open the room
            </button>
            <button className="btn ghost" onClick={() => setMode('idle')}>Back</button>
          </>
        )}
        {mode === 'join' && (
          <>
            <button
              className="btn ember"
              disabled={!nick.trim() || code.length < 4}
              onClick={() => go(code)}
            >
              Join
            </button>
            <button className="btn ghost" onClick={() => setMode('idle')}>Back</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- rules */

function Rules({ onBack }: { onBack: () => void }) {
  return (
    <div className="stack grow" style={{ overflowY: 'auto' }}>
      <TopBar right="How to play" />
      <h1 style={{ fontSize: 30 }}>The whole game<br />in five lines.</h1>
      <ol className="stack" style={{ paddingLeft: 20, gap: 12, marginTop: 6 }}>
        <li className="lede">One player deals — they pick <b style={{ color: 'var(--paper)' }}>three words</b> from nine.</li>
        <li className="lede">The app turns those words into a question. <b style={{ color: 'var(--paper)' }}>Everybody answers it</b>, including the dealer.</li>
        <li className="lede">Answers come up <b style={{ color: 'var(--paper)' }}>anonymously</b>, one at a time. React freely.</li>
        <li className="lede">Then <b style={{ color: 'var(--paper)' }}>match every answer to a person</b>. One name per card.</li>
        <li className="lede">Reveal, score, and <b style={{ color: 'var(--paper)' }}>somebody tells the real story</b>.</li>
      </ol>

      <div className="divider" />
      <div className="kicker">Scoring</div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="score-line"><span className="delta">+2</span>
          <div style={{ flex: 1 }}><b>Each person who knew your answer was yours.</b>
            <div className="breakdown">This is the big one.</div></div></div>
        <div className="score-line"><span className="delta">+1</span>
          <div style={{ flex: 1 }}><b>Each answer you match correctly.</b>
            <div className="breakdown">Pay attention and it pays.</div></div></div>
        <div className="score-line"><span className="delta">+1</span>
          <div style={{ flex: 1 }}><b>Most hearts on your answer.</b>
            <div className="breakdown">The room decides.</div></div></div>
      </div>

      <div className="answer-card small" style={{ marginTop: 6 }}>
        The trick: you win by being <em>recognizable</em>, not by hiding. The most
        you-sounding answer scores the most. So write the thing you'd actually say.
      </div>

      <p className="lede tiny">
        Every answer is allowed to be true, fictional, or somewhere in between —
        nobody ever has to reveal anything real.
      </p>

      <div className="grow" />
      <button className="btn" onClick={onBack}>Got it</button>
    </div>
  );
}

/* ----------------------------------------------------------------- lobby */

function Lobby({
  room, me, joinUrl, qrSvg, send, onLeave,
}: {
  room: ClientRoom; me: Player; joinUrl: string; qrSvg: string;
  send: (m: ClientMessage) => void; onLeave: () => void;
}) {
  const isOwner = me.id === room.ownerId;
  const enough = room.players.length >= 3;
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const live = room.players.filter((p) => p.connected);
  const readyCount = live.filter((p) => p.ready).length;
  const allReady = enough && readyCount === live.length;
  const prevCount = React.useRef(room.players.length);
  const prevReady = React.useRef(readyCount);

  useEffect(() => {
    if (room.players.length > prevCount.current) sfx.join();
    prevCount.current = room.players.length;
  }, [room.players.length]);

  useEffect(() => {
    if (readyCount > prevReady.current) sfx.ready();
    prevReady.current = readyCount;
  }, [readyCount]);

  const share = async () => {
    feel('press');
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Games with Words',
          text: `Join my game — code ${room.joinCode}`,
          url: joinUrl,
        });
        return;
      }
    } catch { /* user dismissed the sheet */ }
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable over http */ }
  };

  if (showRules) return <Rules onBack={() => setShowRules(false)} />;

  return (
    <div className="stack grow" style={{ overflowY: 'auto' }}>
      <TopBar right={`${room.players.length} in the room`} muteBtn />

      {isOwner ? (
        <div className="qr-panel">
          {qrSvg
            ? <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            : <div style={{ height: 200 }} />}
          <div className="qr-code">{room.joinCode}</div>
          <div className="qr-hint">Point a camera at this — or share the link</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8, textAlign: 'center', padding: '12px 0' }}>
          <div className="kicker">You're in</div>
          <h1 style={{ fontSize: 34 }}>Room {room.joinCode}</h1>
          <p className="lede">Tap ready when you are.</p>
        </div>
      )}

      <div className="ready-bar" aria-hidden>
        {live.map((p) => <i key={p.id} className={p.ready ? 'on' : ''} />)}
      </div>
      <div className="spread tiny dim" style={{ marginTop: -6 }}>
        <span>{readyCount} of {live.length} ready</span>
        {allReady && <span className="streak">everyone's in</span>}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {room.players.map((p) => (
          <div className={`player-row ${p.id === me.id ? 'you' : ''} ${p.ready ? 'ready' : ''}`} key={p.id}>
            <span className={`ready-dot ${p.ready ? 'on' : ''}`} />
            <Avatar player={p} />
            <span className="nm">{p.nickname}</span>
            {p.isHost && <span className="chip">host</span>}
            {p.id === me.id && <span className="chip ember">you</span>}
            {isOwner && p.id !== me.id && (
              <button className="btn ghost small" onClick={() => send({ type: 'kick', playerId: p.id })}>
                remove
              </button>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="divider" />
          <div className="spread">
            <span className="tiny dim">Rounds</span>
            <div className="row" style={{ gap: 6 }}>
              {[3, 5, 7].map((n) => (
                <button
                  key={n}
                  className="btn ghost small"
                  style={room.settings.totalRounds === n
                    ? { borderColor: 'var(--ember)', color: 'var(--paper)' } : undefined}
                  onClick={() => { sfx.press(); send({ type: 'settings', settings: { totalRounds: n } }); }}
                >{n}</button>
              ))}
            </div>
          </div>
          <div className="spread">
            <span className="tiny dim">Writing time</span>
            <div className="row" style={{ gap: 6 }}>
              {[45, 60, 90].map((n) => (
                <button
                  key={n}
                  className="btn ghost small"
                  style={room.settings.writingSeconds === n
                    ? { borderColor: 'var(--ember)', color: 'var(--paper)' } : undefined}
                  onClick={() => { sfx.press(); send({ type: 'settings', settings: { writingSeconds: n } }); }}
                >{n}s</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grow" />
      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={() => setShowRules(true)}>
            How to play
          </button>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={share}>
            {copied ? 'Link copied' : 'Share link'}
          </button>
        </div>

        <button
          className={`btn ${me.ready ? 'ready-on' : 'ghost'}`}
          onClick={() => { feel(me.ready ? 'press' : 'ready', me.ready ? 8 : [12, 30, 12]); send({ type: 'ready', ready: !me.ready }); }}
        >
          {me.ready ? "You're ready — tap to undo" : "I'm ready"}
        </button>

        {isOwner ? (
          <button
            className="btn ember"
            disabled={!enough}
            onClick={() => { feel('round', [18, 50, 18]); send({ type: 'start' }); }}
          >
            {!enough
              ? `Need ${3 - room.players.length} more`
              : allReady ? 'Launch — everyone is ready' : `Launch anyway (${readyCount}/${live.length})`}
          </button>
        ) : (
          <Waiting label="Waiting for the host to launch" />
        )}
        {!isOwner && <button className="btn ghost small" style={{ width: '100%' }} onClick={onLeave}>Leave</button>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- final */

function Final({
  room, me, send, onLeave,
}: { room: ClientRoom; me: Player; send: (m: ClientMessage) => void; onLeave: () => void }) {
  const standings = room.players.slice().sort((a, b) => b.score - a.score);
  const winner = standings[0];
  const isOwner = me.id === room.ownerId;
  useEffect(() => { sfx.fanfare(); buzz([24, 60, 24, 60, 40]); confetti(); }, []);

  return (
    <div className="stack grow" style={{ overflowY: 'auto' }}>
      <TopBar right="The final word" />
      <div className="stack" style={{ gap: 6 }}>
        <div className="kicker">You started with words</div>
        <h1 style={{ fontSize: 32, letterSpacing: '-0.02em' }}>
          You ended with <span style={{ color: 'var(--ember)' }}>stories.</span>
        </h1>
      </div>

      <div className="stack" style={{ gap: 8, marginTop: 6 }}>
        {room.superlatives.map((s) => {
          const p = room.players.find((x) => x.id === s.playerId);
          return (
            <div className="sup-card" key={s.key}>
              <div className="row" style={{ gap: 9 }}>
                {p && <Avatar player={p} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t">{s.title}</div>
                  <div className="d">{s.detail}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="divider" />
      <div className="kicker">Final standings</div>
      {standings.map((p, i) => (
        <div className={`player-row ${p.id === me.id ? 'you' : ''}`} key={p.id}>
          <span className="serif dim" style={{ width: 18, fontWeight: 700 }}>{i + 1}</span>
          <Avatar player={p} />
          <span className="nm">{p.nickname}</span>
          {i === 0 && <span className="chip ember">most points</span>}
          <span className="sc">{p.score}</span>
        </div>
      ))}

      <p className="lede tiny" style={{ textAlign: 'center', marginTop: 6 }}>
        {winner?.nickname} took the points. Everybody took something else.
      </p>

      <div className="grow" />
      {isOwner ? (
        <button className="btn ember" onClick={() => { feel('press'); send({ type: 'again' }); }}>Play again</button>
      ) : (
        <Waiting label="Waiting on the host" />
      )}
      <button className="btn ghost" onClick={onLeave}>Leave the room</button>
    </div>
  );
}

/* ------------------------------------------------------------------- app */

export default function App() {
  const net = useNet();
  const presetCode = useMemo(() => {
    const m = location.pathname.match(/^\/j\/([A-Za-z0-9]{3,8})/);
    return m ? m[1].toUpperCase() : '';
  }, []);

  const room = net.room;
  const me = room?.players.find((p) => p.id === net.playerId);
  const round = room?.rounds[room.rounds.length - 1];
  const isDealer = Boolean(round && round.dealerId === net.playerId);

  // a beat at the top of every round so the game has a pulse
  const [splashFor, setSplashFor] = useState(0);
  const seenRound = React.useRef(0);
  useEffect(() => {
    if (round && room?.phase === 'dealing' && round.number !== seenRound.current) {
      seenRound.current = round.number;
      setSplashFor(round.number);
      sfx.round();
      buzz([14, 40, 14]);
    }
  }, [round?.number, room?.phase]);

  useEffect(() => {
    if (net.error) {
      const t = setTimeout(net.clearError, 3400);
      return () => clearTimeout(t);
    }
  }, [net.error, net.clearError]);

  // keep the deep-link code out of the URL once we are in
  useEffect(() => {
    if (room && location.pathname !== '/') history.replaceState({}, '', '/');
  }, [room]);

  let body: React.ReactNode;

  if (!room || !me) {
    body = <Home presetCode={presetCode} onJoin={net.join} />;
  } else if (room.phase === 'lobby' || room.phase === 'complete') {
    body = (
      <Lobby room={room} me={me} joinUrl={net.joinUrl} qrSvg={net.qrSvg}
        send={net.send} onLeave={net.leave} />
    );
  } else if (room.phase === 'final') {
    body = <Final room={room} me={me} send={net.send} onLeave={net.leave} />;
  } else if (!round) {
    body = <div className="center"><Waiting label="Dealing" /></div>;
  } else {
    const props = { room, round, me, isDealer, send: net.send };
    switch (room.phase) {
      case 'dealing': body = <Dealing {...props} />; break;
      case 'writing': body = <Writing {...props} />; break;
      case 'lineup': body = <Lineup {...props} />; break;
      case 'matching': body = <Matching {...props} />; break;
      case 'reveal': body = <Reveal {...props} />; break;
      case 'tabletalk': body = <TableTalk {...props} />; break;
      default: body = <div className="center"><Waiting label="One moment" /></div>;
    }
  }

  const dealerName = room?.players.find((p) => p.id === round?.dealerId)?.nickname ?? '';

  return (
    <div className="app">
      {splashFor > 0 && room && round && (
        <RoundSplash
          round={splashFor}
          total={room.settings.totalRounds}
          dealerName={dealerName}
          onDone={() => setSplashFor(0)}
        />
      )}
      {room && me && room.phase !== 'lobby' && (
        <TopBar
          muteBtn
          right={
            round
              ? `R${round.number}/${room.settings.totalRounds} · ${me.score} pts`
              : `${me.score} pts`
          }
        />
      )}
      {body}
      <Toast message={net.toast ?? net.error} />
      {net.status === 'closed' && room && (
        <div className="toast" style={{ background: 'var(--rose)', color: '#fff' }}>
          Reconnecting…
        </div>
      )}
    </div>
  );
}
