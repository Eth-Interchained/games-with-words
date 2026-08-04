/**
 * Feel: sound, confetti, floating reactions, haptics.
 *
 * Zero assets. Every sound is synthesised with WebAudio at call time, so the
 * whole layer costs about 4 kB and nothing has to load before the game feels
 * alive. Shared by the multiplayer client and the pass-and-play build.
 *
 * Browsers refuse to start an AudioContext before a user gesture, so the
 * context is created lazily on the first tap and everything before that is a
 * silent no-op rather than an error.
 */

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem('gww.muted') === '1';
} catch { /* private mode */ }

export function isMuted() { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem('gww.muted', muted ? '1' : '0'); } catch { /* ignore */ }
  if (!muted) blip(880, 0.06, 'sine', 0.18);
  return muted;
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** One shaped tone. Everything else is built out of these. */
function blip(
  freq: number,
  dur = 0.09,
  type: OscillatorType = 'sine',
  gain = 0.14,
  delay = 0,
  glideTo?: number,
) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  // quick attack, exponential tail — reads as a mallet rather than a beep
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur = 0.12, gain = 0.06, delay = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ac.createBufferSource();
  const amp = ac.createGain();
  const filt = ac.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1800;
  amp.gain.value = gain;
  src.buffer = buf;
  src.connect(filt).connect(amp).connect(ac.destination);
  src.start(t0);
}

/** A warm pentatonic set — nothing in it can clash with anything else. */
const P = { c: 523.25, d: 587.33, e: 659.25, g: 783.99, a: 880.0, C: 1046.5, G: 1568.0 };

export const sfx = {
  /** picking a word tile up */
  tap: () => blip(P.e, 0.05, 'triangle', 0.09),
  /** putting one back down */
  untap: () => blip(P.d, 0.05, 'triangle', 0.06),
  /** any ordinary button */
  press: () => blip(P.d, 0.045, 'sine', 0.07),
  /** committing something — words in play, answer locked, guesses locked */
  lock: () => { blip(P.e, 0.07, 'triangle', 0.11); blip(P.a, 0.13, 'triangle', 0.10, 0.06); },
  /** each of the three words landing */
  wordDrop: (i = 0) => blip([P.c, P.e, P.g][i] ?? P.g, 0.16, 'triangle', 0.13, i * 0.1),
  /** a new card turning over in the line-up */
  card: () => { noise(0.09, 0.05); blip(P.g, 0.07, 'sine', 0.07, 0.02); },
  /** a reaction tapped */
  react: () => blip(P.C, 0.05, 'sine', 0.08),
  /** you called it */
  correct: () => { blip(P.e, 0.09, 'sine', 0.13); blip(P.G, 0.16, 'sine', 0.11, 0.07); },
  /** you did not */
  wrong: () => blip(220, 0.14, 'sine', 0.09, 0, 165),
  /** round splash */
  round: () => { blip(P.c, 0.1, 'triangle', 0.1); blip(P.g, 0.1, 'triangle', 0.1, 0.09); blip(P.C, 0.22, 'triangle', 0.12, 0.18); },
  /** the table talk card */
  spotlight: () => { blip(P.a, 0.3, 'sine', 0.1); blip(P.e, 0.42, 'sine', 0.08, 0.05); },
  /** end of game */
  fanfare: () => {
    [P.c, P.e, P.g, P.C, P.G].forEach((f, i) => blip(f, 0.3, 'triangle', 0.12, i * 0.09));
    noise(0.4, 0.04, 0.3);
  },
  /** someone joined the lobby */
  join: () => { blip(P.g, 0.07, 'sine', 0.09); blip(P.C, 0.1, 'sine', 0.08, 0.05); },
  /** someone readied up */
  ready: () => blip(P.G, 0.08, 'sine', 0.09),
};

/* ------------------------------------------------------------- haptics */

export function buzz(pattern: number | number[] = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* no motor */ }
}

/** Sound and haptic together — almost every call site wants both. */
export function feel(sound: keyof typeof sfx, haptic: number | number[] = 10) {
  sfx[sound]();
  buzz(haptic);
}

/* ------------------------------------------------------------ confetti */

export function confetti(durationMs = 2200) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2000';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  // getContext can THROW (not just return null) on locked-down or headless
  // platforms — confetti is decoration and must never take the game with it
  let g: CanvasRenderingContext2D | null = null;
  try {
    g = canvas.getContext('2d');
  } catch {
    g = null;
  }
  if (!g) { canvas.remove(); return; }
  g.scale(dpr, dpr);

  const W = window.innerWidth;
  const H = window.innerHeight;
  const colors = ['#e0763a', '#f6eee2', '#d9b166', '#7fa189', '#c98b6b'];
  const bits = Array.from({ length: 90 }, () => ({
    x: Math.random() * W,
    y: -20 - Math.random() * H * 0.5,
    w: 5 + Math.random() * 7,
    h: 8 + Math.random() * 10,
    vy: 1.8 + Math.random() * 2.6,
    vx: -0.9 + Math.random() * 1.8,
    rot: Math.random() * Math.PI,
    vr: -0.1 + Math.random() * 0.2,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));

  const start = performance.now();
  function frame(now: number) {
    const elapsed = now - start;
    g!.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      g!.save();
      g!.translate(b.x, b.y);
      g!.rotate(b.rot);
      g!.fillStyle = b.c;
      g!.globalAlpha = Math.max(0, 1 - elapsed / durationMs);
      g!.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g!.restore();
    }
    if (elapsed < durationMs) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

/* ----------------------------------------------------- floating emoji */

export function floatEmoji(emoji: string, fromEl?: Element | null) {
  if (typeof document === 'undefined') return;
  const rect = fromEl?.getBoundingClientRect();
  const el = document.createElement('div');
  el.textContent = emoji;
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top : window.innerHeight * 0.6;
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:26px;pointer-events:none;z-index:1500;transform:translate(-50%,-50%);transition:transform 1s cubic-bezier(.2,.8,.3,1),opacity 1s ease`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    const drift = -30 + Math.random() * 60;
    el.style.transform = `translate(calc(-50% + ${drift}px), calc(-50% - 120px)) scale(1.5) rotate(${drift / 3}deg)`;
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 1050);
}

/* --------------------------------------------------------- mute button */

export function muteButtonHTML(): string {
  return `<button class="mute-btn" id="mutebtn" aria-label="Sound">${muted ? '🔇' : '🔊'}</button>`;
}

export function wireMuteButton(root: ParentNode = document) {
  const b = root.querySelector<HTMLElement>('#mutebtn');
  if (!b) return;
  b.onclick = () => {
    const m = toggleMute();
    b.textContent = m ? '🔇' : '🔊';
  };
}
