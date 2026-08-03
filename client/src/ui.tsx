import React from 'react';
import type { Player, Word } from '../../shared/types.ts';
import { isMuted, toggleMute } from './fx.ts';

const AVATAR_COLORS: Record<string, string> = {
  ember: '#e0763a', sage: '#7fa189', clay: '#c98b6b', indigo: '#8b93c4',
  ochre: '#d9b166', moss: '#94a86b', rust: '#c4553d', slate: '#93a1ad',
  plum: '#b183a8', wheat: '#ddc79a',
};

export function colorFor(seed: string): string {
  return AVATAR_COLORS[seed] ?? '#d9b166';
}

export function Avatar({ player, size }: { player: Player; size?: 'lg' }) {
  const initials = player.nickname.trim().slice(0, 2).toUpperCase();
  return (
    <div
      className={`avatar ${size === 'lg' ? 'lg' : ''} ${player.connected ? '' : 'off'}`}
      style={{ background: colorFor(player.avatarSeed) }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function WordsInPlay({
  words,
  compact,
}: {
  words: { text: string }[] | undefined;
  compact?: boolean;
}) {
  if (!words) return null;
  return (
    <div className={`words-in-play ${compact ? 'compact' : ''}`}>
      {words.map((w, i) => (
        <div className="w" key={i}>{w.text}</div>
      ))}
    </div>
  );
}

export function Tile({
  word, picked, dimmed, onClick,
}: {
  word: Word; picked?: boolean; dimmed?: boolean; onClick?: () => void;
}) {
  return (
    <button
      className={`tile ${picked ? 'picked' : ''} ${dimmed ? 'dimmed' : ''}`}
      onClick={onClick}
      type="button"
    >
      {word.text}
    </button>
  );
}

export function Waiting({ label }: { label: string }) {
  return (
    <div className="row dim tiny" style={{ justifyContent: 'center' }}>
      <span>{label}</span>
      <span className="waiting-dots">
        <span>.</span><span>.</span><span>.</span>
      </span>
    </div>
  );
}

export function Timer({ deadline, total }: { deadline?: number; total: number }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  if (!deadline) return null;
  const left = Math.max(0, deadline - now);
  const pct = Math.max(0, Math.min(100, (left / (total * 1000)) * 100));
  const secs = Math.ceil(left / 1000);
  const cls = pct < 18 ? 'hot' : pct < 42 ? 'warn' : '';
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className={`timer-bar ${cls}`}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="tiny dim" style={{ textAlign: 'right' }}>
        {secs}s
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

export function TopBar({
  right, muteBtn,
}: { right?: React.ReactNode; muteBtn?: boolean }) {
  const [muted, setMuted] = React.useState(isMuted());
  return (
    <div className="topbar">
      <div className="brand">Games with Words</div>
      <div className="row" style={{ gap: 10 }}>
        <div className="meta">{right}</div>
        {muteBtn && (
          <button
            className="mute-btn"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => setMuted(toggleMute())}
          >
            {muted ? '\u{1F507}' : '\u{1F50A}'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Full-screen beat between rounds. Gives the game a pulse. */
export function RoundSplash({
  round, total, dealerName, onDone,
}: { round: number; total: number; dealerName: string; onDone: () => void }) {
  const [out, setOut] = React.useState(false);
  React.useEffect(() => {
    const a = setTimeout(() => setOut(true), 1150);
    const b = setTimeout(onDone, 1600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [onDone]);
  return (
    <div className={`splash ${out ? 'out' : ''}`}>
      <div className="sub">Round {round} of {total}</div>
      <div className="n">{round}</div>
      <div className="who">{dealerName} deals</div>
    </div>
  );
}
