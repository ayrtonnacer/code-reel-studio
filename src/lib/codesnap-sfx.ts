// Sound effect synthesis — all audio generated in-browser, no external files needed.

const SR     = 22050; // default for music
const SR_SFX = 44100; // high-quality for SFX (better click transients)

function buildWAV(samples: Float32Array, sr = SR): string {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const ws = (o: number, v: string) => { for (let i = 0; i < v.length; i++) dv.setUint8(o + i, v.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true);
  ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, Math.round(samples[i] * 30000))), true);
  const bytes = new Uint8Array(buf);
  const CHUNK = 8192;
  let b = '';
  for (let i = 0; i < bytes.length; i += CHUNK) b += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return 'data:audio/wav;base64,' + btoa(b);
}

// ─── Sound Effects ────────────────────────────────────────────────────────────

// Real keyboard typing sound — served from public/sounds/
export const SFX_TYPE_CLICK = '/sounds/typing-keyboard.mp3';

// Camera-focus click for zoom-in: sharp snap + brief 900→1400 Hz tonal tail (80 ms)
export const SFX_ZOOM_IN: string = (() => {
  const sr = SR_SFX;
  const n  = Math.floor(sr * 0.08); // 80 ms
  const s  = new Float32Array(n);

  // Click body (0–6 ms)
  const cE = Math.floor(sr * 0.006);
  for (let i = 0; i < cE; i++) {
    const t = i / sr;
    s[i] += (Math.random() * 2 - 1) * Math.exp(-t * 800) * 0.55;
    s[i] += Math.sin(2 * Math.PI * 2800 * t) * Math.exp(-t * 700) * 0.5;
  }

  // Tonal tail (4–70 ms): quick rising tone = "locking in"
  const tS = Math.floor(sr * 0.004), tE = Math.floor(sr * 0.070);
  const dur = (tE - tS) / sr;
  for (let i = tS; i < tE; i++) {
    const t = (i - tS) / sr;
    const phase = 900 * t + (1400 - 900) * t * t / (2 * dur);
    s[i] += Math.sin(2 * Math.PI * phase) * Math.exp(-t * 55) * 0.38;
  }

  for (let i = 0; i < n; i++) s[i] = Math.tanh(s[i] * 2) * 0.78;
  return buildWAV(s, sr);
})();

// Camera-focus click for zoom-out: same snap + brief 1400→700 Hz falling tail (80 ms)
export const SFX_ZOOM_OUT: string = (() => {
  const sr = SR_SFX;
  const n  = Math.floor(sr * 0.08); // 80 ms
  const s  = new Float32Array(n);

  // Click body (0–6 ms)
  const cE = Math.floor(sr * 0.006);
  for (let i = 0; i < cE; i++) {
    const t = i / sr;
    s[i] += (Math.random() * 2 - 1) * Math.exp(-t * 800) * 0.55;
    s[i] += Math.sin(2 * Math.PI * 2000 * t) * Math.exp(-t * 700) * 0.5;
  }

  // Tonal tail (4–70 ms): quick falling tone = "releasing"
  const tS = Math.floor(sr * 0.004), tE = Math.floor(sr * 0.070);
  const dur = (tE - tS) / sr;
  for (let i = tS; i < tE; i++) {
    const t = (i - tS) / sr;
    const phase = 1400 * t + (700 - 1400) * t * t / (2 * dur);
    s[i] += Math.sin(2 * Math.PI * phase) * Math.exp(-t * 60) * 0.35;
  }

  for (let i = 0; i < n; i++) s[i] = Math.tanh(s[i] * 2) * 0.78;
  return buildWAV(s, sr);
})();

// ─── Music Presets ────────────────────────────────────────────────────────────

export const MUSIC_PRESETS = [
  { key: 'vaporwave', label: 'Neon Drift',  description: 'Dreamy pads · 80 BPM'   },
  { key: 'chiptune',  label: 'Pixel Rush',  description: 'Retro 8-bit · 140 BPM'  },
  { key: 'lofi',      label: 'Chill Code',  description: 'Lo-fi chill · 85 BPM'   },
] as const;

export type MusicPresetKey = typeof MUSIC_PRESETS[number]['key'];

const _musicCache = new Map<MusicPresetKey, string>();

export function getMusicPreset(key: MusicPresetKey): string {
  if (_musicCache.has(key)) return _musicCache.get(key)!;
  const url = key === 'vaporwave' ? genVaporwave()
            : key === 'chiptune'  ? genChiptune()
            : genLofi();
  _musicCache.set(key, url);
  return url;
}

// ── Vaporwave: slow minor chord pads, 80 BPM ─────────────────────────────────
// Am → F → C → E — 4 bar loop ≈ 12s
function genVaporwave(): string {
  const bpm = 80, beatSec = 60 / bpm, barSec = beatSec * 4;
  const durSec = barSec * 4;
  const s = new Float32Array(Math.floor(SR * durSec));
  const chords = [
    [220, 261.63, 329.63],    // Am
    [174.61, 220, 261.63],    // F
    [130.81, 164.81, 196],    // C
    [164.81, 207.65, 261.63], // E
  ];
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const barPos = t % barSec;
    const chord = chords[Math.floor(t / barSec) % chords.length];
    const env = Math.min(1, barPos / (beatSec * 0.6));
    let v = 0;
    for (const f of chord) {
      v += Math.sin(2 * Math.PI * f * t) * 0.17;
      v += Math.sin(2 * Math.PI * f * 2 * t) * 0.04;
      v += Math.sin(2 * Math.PI * f * 1.004 * t) * 0.07; // detune chorus
    }
    s[i] = Math.tanh(v * env * 2.5) * 0.44;
  }
  return buildWAV(s);
}

// ── Chiptune: square wave arpeggio, 140 BPM ──────────────────────────────────
// C major arpeggio + bass — 4 bar loop ≈ 6.9s
function genChiptune(): string {
  const bpm = 140, beatSec = 60 / bpm, barSec = beatSec * 4;
  const durSec = barSec * 4;
  const s = new Float32Array(Math.floor(SR * durSec));
  const sq = (f: number, t: number) => Math.sign(Math.sin(2 * Math.PI * f * t));
  const arpNotes  = [261.63, 329.63, 392, 523.25, 392, 329.63];
  const bassNotes = [130.81, 130.81, 98, 98];
  const sixteenth = beatSec / 4;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const sixIdx  = Math.floor(t / sixteenth);
    const notePos = (t % sixteenth) / sixteenth;
    const arpEnv  = notePos < 0.75 ? 1 : Math.exp(-(notePos - 0.75) * 30);
    const beatIdx = Math.floor(t / beatSec) % 4;
    const beatPos = (t % beatSec) / beatSec;
    const bassEnv = beatPos < 0.35 ? 1 : Math.exp(-(beatPos - 0.35) * 12);
    const eightPos = (t % (beatSec / 2)) / (beatSec / 2);
    const hhEnv   = Math.exp(-eightPos * 90);
    const v = sq(arpNotes[sixIdx % arpNotes.length], t) * arpEnv * 0.22
            + sq(bassNotes[beatIdx] * 0.5, t) * bassEnv * 0.18
            + (Math.random() * 2 - 1) * hhEnv * 0.055;
    s[i] = Math.tanh(v * 1.5) * 0.5;
  }
  return buildWAV(s);
}

// ── Lo-fi: jazz chords + gentle kick, 85 BPM ─────────────────────────────────
// Dm7 → G7 → Cmaj7 → Am7 — 4 bar loop ≈ 11.3s
function genLofi(): string {
  const bpm = 85, beatSec = 60 / bpm, barSec = beatSec * 4;
  const durSec = barSec * 4;
  const s = new Float32Array(Math.floor(SR * durSec));
  const chords = [
    [146.83, 174.61, 220, 261.63], // Dm7
    [98, 123.47, 155.56, 196],     // G7
    [130.81, 164.81, 196, 246.94], // Cmaj7
    [110, 130.81, 164.81, 220],    // Am7
  ];
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const barPos  = t % barSec;
    const chord   = chords[Math.floor(t / barSec) % chords.length];
    const atkSec  = 0.04;
    const env     = barPos < atkSec ? barPos / atkSec : Math.exp(-(barPos - atkSec) * 1.1);
    let v = 0;
    for (const f of chord) {
      v += Math.sin(2 * Math.PI * f * t) * 0.1;
      v += Math.sin(2 * Math.PI * f * 2 * t) * 0.04;
      v += Math.sin(2 * Math.PI * f * 3 * t) * 0.015;
    }
    v *= env;
    const beatNum = Math.floor(t / beatSec) % 4;
    const beatPos = t % beatSec;
    if (beatNum === 0 || beatNum === 2) {
      v += Math.sin(2 * Math.PI * 55 * Math.exp(-beatPos * 35) * t) * Math.exp(-beatPos * 25) * 0.38;
    }
    if (beatNum === 1 || beatNum === 3) {
      v += (Math.random() * 2 - 1) * Math.exp(-beatPos * 80) * 0.04;
    }
    s[i] = Math.tanh(v * 2) * 0.5;
  }
  return buildWAV(s);
}
