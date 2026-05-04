/**
 * Auto-sync engine: Whisper transcription with word-level timestamps,
 * then forced alignment of the user-provided script onto those timestamps.
 *
 * Heavy deps (`@huggingface/transformers`) are imported dynamically so the
 * main bundle stays small — the model is fetched on first use only.
 */
import type { SubtitleBlock } from "@/lib/codesnap-types";

export interface SyncProgress {
  phase: "loading-model" | "decoding-audio" | "transcribing" | "aligning" | "done" | "error";
  pct: number;        // 0..100
  message: string;
}

// ── Text normalization ──────────────────────────────────────────────────────

const PUNCT_RE = /[.,;:!¡¿?"'`()[\]{}«»…—–-]/g;

function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(PUNCT_RE, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .trim();
}

function tokenizeScript(text: string): string[] {
  return text
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean);
}

// ── DTW alignment (script word index ↔ ASR word index) ─────────────────────

interface AsrWord { text: string; start: number; end: number }

/**
 * Given a list of script words and a list of ASR words (with timestamps),
 * returns for each script word the ASR word index it best matches.
 *
 * Uses a DP that allows insertions/deletions — robust to ASR errors.
 */
function alignWords(
  script: string[],
  asr: AsrWord[]
): number[] {
  const N = script.length;
  const M = asr.length;
  if (N === 0 || M === 0) return [];

  const normScript = script.map(normalizeWord);
  const normAsr    = asr.map(w => normalizeWord(w.text));

  // dp[i][j] = min cost to align script[0..i) with asr[0..j)
  // back[i][j] = direction: 0=match, 1=skip-asr, 2=skip-script
  const INF = Infinity;
  const dp:  number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(INF));
  const back: Uint8Array[] = Array.from({ length: N + 1 }, () => new Uint8Array(M + 1));
  dp[0][0] = 0;
  for (let j = 1; j <= M; j++) { dp[0][j] = j * 0.5; back[0][j] = 1; } // free skip-asr from start
  for (let i = 1; i <= N; i++) { dp[i][0] = i * 2.0; back[i][0] = 2; } // expensive script-only

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      const a = normScript[i - 1];
      const b = normAsr[j - 1];
      const matchCost = a === b ? 0 : (a && b && (a.startsWith(b) || b.startsWith(a)) ? 0.3 : 1.0);
      const m = dp[i - 1][j - 1] + matchCost;
      const skipAsr    = dp[i][j - 1] + 0.5;   // ASR word with no script counterpart
      const skipScript = dp[i - 1][j] + 1.5;   // script word missing in ASR (rare)

      let best = m, dir: 0 | 1 | 2 = 0;
      if (skipAsr < best) { best = skipAsr; dir = 1; }
      if (skipScript < best) { best = skipScript; dir = 2; }
      dp[i][j] = best;
      back[i][j] = dir;
    }
  }

  // Backtrack from (N, M) — but find best ending j (allow trailing ASR skips).
  let endJ = M;
  let bestEndCost = dp[N][M];
  for (let j = M; j >= 0; j--) {
    if (dp[N][j] < bestEndCost) { bestEndCost = dp[N][j]; endJ = j; }
  }

  // result[i] = asr index matched for script[i] (or -1)
  const result = new Array<number>(N).fill(-1);
  let i = N, j = endJ;
  while (i > 0 && j >= 0) {
    if (i === 0) break;
    const dir = j === 0 ? 2 : back[i][j];
    if (dir === 0) { result[i - 1] = j - 1; i--; j--; }
    else if (dir === 1) { j--; }
    else { i--; }
    if (i === 0) break;
  }

  // Fill unmatched script words by forward-filling from neighbors
  for (let k = 0; k < N; k++) {
    if (result[k] === -1) {
      // look left
      let l = k - 1;
      while (l >= 0 && result[l] === -1) l--;
      // look right
      let r = k + 1;
      while (r < N && result[r] === -1) r++;
      if (l >= 0 && r < N) result[k] = Math.round((result[l] + result[r]) / 2);
      else if (l >= 0) result[k] = Math.min(M - 1, result[l] + 1);
      else if (r < N) result[k] = Math.max(0, result[r] - 1);
      else result[k] = 0;
    }
  }

  return result;
}

// ── Group script words into subtitle blocks (≤ ~6 words / ~32 chars) ───────

function chunkScriptIntoBlocks(words: string[], maxWords = 6, maxChars = 38): string[][] {
  const blocks: string[][] = [];
  let cur: string[] = [];
  let curLen = 0;

  const punctEndRe = /[.!?…¡¿]$/;

  for (const w of words) {
    const wLen = w.length + (cur.length ? 1 : 0);
    if (cur.length >= maxWords || curLen + wLen > maxChars) {
      blocks.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(w);
    curLen += wLen;
    // Sentence ends → close block early
    if (punctEndRe.test(w) && cur.length >= 2) {
      blocks.push(cur);
      cur = [];
      curLen = 0;
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

// ── Decode audio data URL into mono Float32 @ 16kHz ─────────────────────────

async function decodeAudioMono16k(dataUrl: string): Promise<Float32Array> {
  const res = await fetch(dataUrl);
  const arrayBuffer = await res.arrayBuffer();

  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(arrayBuffer);

  // Mix down to mono
  const mono = new Float32Array(buf.length);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i];
  }
  if (buf.numberOfChannels > 1) {
    for (let i = 0; i < mono.length; i++) mono[i] /= buf.numberOfChannels;
  }

  // Resample to 16kHz with OfflineAudioContext for accuracy
  if (buf.sampleRate === 16000) { ctx.close(); return mono; }
  const targetSr = 16000;
  const ratio = targetSr / buf.sampleRate;
  const offlineLen = Math.round(mono.length * ratio);
  const offline = new OfflineAudioContext(1, offlineLen, targetSr);
  const tmpBuf = offline.createBuffer(1, mono.length, buf.sampleRate);
  tmpBuf.copyToChannel(mono, 0);
  const node = offline.createBufferSource();
  node.buffer = tmpBuf;
  node.connect(offline.destination);
  node.start(0);
  const rendered = await offline.startRendering();
  ctx.close();
  return rendered.getChannelData(0).slice();
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Transcribes the audio with Whisper (word-level timestamps), aligns the
 * provided script against those timestamps, and emits SubtitleBlocks.
 *
 * `audioDataUrl` must be a data: URL (already loaded into config).
 */
export async function syncScriptToAudio(
  script: string,
  audioDataUrl: string,
  onProgress: (p: SyncProgress) => void
): Promise<SubtitleBlock[]> {
  const scriptWords = tokenizeScript(script);
  if (scriptWords.length === 0) {
    throw new Error("Script vacío. Pegá el guión primero.");
  }

  onProgress({ phase: "decoding-audio", pct: 5, message: "Decodificando audio…" });
  const audio = await decodeAudioMono16k(audioDataUrl);

  onProgress({ phase: "loading-model", pct: 12, message: "Cargando modelo Whisper (primera vez ~75MB)…" });

  // Lazy-load transformers.js — keeps main bundle small.
  const { pipeline, env } = await import("@huggingface/transformers");
  // @ts-expect-error — runtime config
  env.allowLocalModels = false;

  const transcriber = await pipeline(
    "automatic-speech-recognition",
    "Xenova/whisper-small",
    { dtype: "fp32" } as unknown as Record<string, unknown>,
  );

  onProgress({ phase: "transcribing", pct: 35, message: "Transcribiendo…" });

  const out = (await transcriber(audio, {
    language: "spanish",
    task: "transcribe",
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
  })) as { chunks?: { text: string; timestamp: [number, number | null] }[] };

  const chunks = out.chunks ?? [];
  const asr: AsrWord[] = chunks
    .filter(c => c.text && c.text.trim())
    .map(c => ({
      text: c.text.trim(),
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 0.3,
    }));

  if (asr.length === 0) {
    throw new Error("No se detectó voz en el audio.");
  }

  onProgress({ phase: "aligning", pct: 85, message: "Sincronizando guión con el audio…" });

  const matched = alignWords(scriptWords, asr);
  const blocks = chunkScriptIntoBlocks(scriptWords);

  // Compute timing per block: first matched word's start, last matched word's end
  let cursor = 0;
  const result: SubtitleBlock[] = [];
  for (const blockWords of blocks) {
    const startScriptIdx = cursor;
    const endScriptIdx = cursor + blockWords.length - 1;
    cursor += blockWords.length;

    const firstAsr = asr[matched[startScriptIdx]];
    const lastAsr  = asr[matched[endScriptIdx]];
    let startSec = firstAsr?.start ?? 0;
    let endSec   = lastAsr?.end ?? (startSec + 0.5 * blockWords.length);

    // Guarantee monotonic timing (clip to previous block's end if needed)
    const prev = result[result.length - 1];
    if (prev && startSec < prev.endSec) startSec = prev.endSec;
    if (endSec <= startSec) endSec = startSec + 0.5 * blockWords.length;

    result.push({
      startSec,
      endSec,
      text: blockWords.join(" "),
    });
  }

  onProgress({ phase: "done", pct: 100, message: "Listo." });
  return result;
}

/**
 * Naive fallback when no audio is available: distributes the script
 * proportionally over `totalSec` (defaults to 12s).
 */
export function distributeScriptUniformly(script: string, totalSec: number): SubtitleBlock[] {
  const words = tokenizeScript(script);
  if (words.length === 0) return [];
  const blocks = chunkScriptIntoBlocks(words);
  const totalChars = words.reduce((s, w) => s + w.length, 0);
  let cursor = 0;
  return blocks.map(b => {
    const charLen = b.reduce((s, w) => s + w.length, 0);
    const dur = (charLen / Math.max(1, totalChars)) * totalSec;
    const startSec = cursor;
    const endSec = cursor + Math.max(0.6, dur);
    cursor = endSec;
    return { startSec, endSec, text: b.join(" ") };
  });
}
