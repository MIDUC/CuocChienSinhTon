/**
 * Âm thanh tổng hợp bằng WebAudio (không cần file âm thanh). Có thể thay bằng file thật sau.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem('ccst-muted') === '1';
} catch {
  /* bỏ qua */
}
const last: Record<string, number> = {};

function ac() {
  if (!ctx) {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx!.createGain();
    master.gain.value = 0.35;
    master.connect(ctx!.destination);
  }
  if (ctx!.state === 'suspended') ctx!.resume();
  return ctx;
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('ccst-muted', muted ? '1' : '0');
  } catch {
    /* bỏ qua */
  }
  return muted;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, slide = 0, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, hp = 800, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(master);
  s.start(t);
}

export type Sfx = 'hit' | 'arrow' | 'die' | 'build' | 'coin' | 'horn' | 'win' | 'lose' | 'chest' | 'click' | 'skill' | 'break' | 'spell' | 'error';

/** Phát âm thanh; tự giới hạn tần suất để không ồn khi đánh đông */
export function play(s: Sfx) {
  if (muted) return;
  const now = performance.now();
  const gap = { hit: 70, arrow: 60, die: 80, coin: 90 }[s as string] ?? 30;
  if (now - (last[s] ?? 0) < gap) return;
  last[s] = now;
  switch (s) {
    case 'hit':
      noise(0.06, 0.12, 1500);
      tone(140 + Math.random() * 40, 0.06, 'square', 0.05, -60);
      break;
    case 'arrow':
      noise(0.08, 0.06, 3000);
      break;
    case 'die':
      tone(300, 0.18, 'sawtooth', 0.06, -220);
      break;
    case 'build':
      tone(220, 0.08, 'square', 0.08);
      tone(330, 0.12, 'square', 0.08, 0, 0.08);
      break;
    case 'coin':
      tone(988, 0.06, 'square', 0.05);
      tone(1319, 0.12, 'square', 0.05, 0, 0.06);
      break;
    case 'horn':
      tone(110, 0.9, 'sawtooth', 0.12, 20);
      tone(165, 0.9, 'sawtooth', 0.08, 25);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.15, 0, i * 0.12));
      break;
    case 'lose':
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.15, 0, i * 0.2));
      break;
    case 'chest':
      [660, 880, 1100, 1320, 1760].forEach((f, i) => tone(f, 0.15, 'triangle', 0.1, 0, i * 0.06));
      break;
    case 'click':
      tone(600, 0.03, 'square', 0.04);
      break;
    case 'skill':
      tone(200, 0.35, 'sawtooth', 0.12, 400);
      noise(0.3, 0.12, 400);
      break;
    case 'break':
      noise(0.35, 0.25, 200);
      tone(80, 0.3, 'square', 0.1, -40);
      break;
    case 'spell':
      noise(0.6, 0.25, 100);
      tone(60, 0.6, 'sawtooth', 0.15, -20);
      break;
    case 'error':
      tone(160, 0.12, 'square', 0.06);
      break;
  }
}
