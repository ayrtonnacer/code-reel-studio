import { useState, useCallback } from "react";
import { toCanvas, getFontEmbedCSS } from "html-to-image";
import { domToCanvas as msToCanvas, createContext as msCreateContext, destroyContext as msDestroyContext, type Context as MSContext } from "modern-screenshot";
import {
  computeDurationFrames,
  computeVideoTimings,
  computeLinePanTimings,
  FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  SCAN_SNAP_FRAMES,
  SCAN_ZOOM_FRAMES,
  SCAN_PRE_PAUSE_FRAMES,
  type SnippetConfig,
  type NarrativeOpts,
} from "@/lib/codesnap-types";
import { getMusicPreset, SFX_TYPE_CLICK, SFX_ZOOM_IN, SFX_ZOOM_OUT, SFX_START_CLICK, type MusicPresetKey } from "@/lib/codesnap-sfx";
import { parseNarrative, autoWrapCode } from "@/lib/codesnap-narrative";

export type ExportFormat = "webm" | "mp4";

export type ExportPhase =
  | "idle"
  | "rendering-frames"
  | "done"
  | "error";

export interface ExportProgress {
  phase: ExportPhase;
  current: number;
  total: number;
  message: string;
  blobUrl: string | null;
  fileExt: string;
}

export function isMp4Supported(): boolean {
  return typeof VideoEncoder !== "undefined";
}

// ─── helpers ────────────────────────────────────────────────────────────────

const HTML_TO_IMAGE_OPTS = {
  cacheBust: false,
  pixelRatio: 1,
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
} as const;

/**
 * Computed once per export, then passed to every toCanvas call.
 * `skipFonts: true` was breaking subtitle rendering in MP4 — the SVG
 * foreignObject rasterizer fell back to a system font with different
 * metrics, causing glyphs to overlap. Embedding the @font-face CSS once
 * (with the actual webfont bytes inlined as data URIs) makes every frame
 * render with the same font the preview uses.
 */
let cachedFontEmbedCSS: string | null = null;
let fontEmbedFailed = false;
let msContext: MSContext<HTMLElement> | null = null;

async function captureFrame(el: HTMLElement): Promise<HTMLCanvasElement> {
  // modern-screenshot: uses Blob URLs instead of encodeURIComponent — 3-5× faster
  // and immune to the URIError/URI-malformed bug. Context caches fonts + images.
  if (msContext) {
    try {
      return await msToCanvas(msContext);
    } catch (err) {
      console.warn('[export] modern-screenshot failed, switching to html-to-image:', err);
      msContext = null;
      // fall through to html-to-image
    }
  }
  // html-to-image fallback (kept for safety)
  if (fontEmbedFailed) {
    return toCanvas(el, { ...HTML_TO_IMAGE_OPTS, skipFonts: true });
  }
  try {
    return await toCanvas(el, { ...HTML_TO_IMAGE_OPTS, fontEmbedCSS: cachedFontEmbedCSS ?? undefined });
  } catch (err) {
    if (err instanceof Error && (err.name === 'URIError' || err.message === 'URI malformed')) {
      cachedFontEmbedCSS = null;
      fontEmbedFailed = true;
      return toCanvas(el, { ...HTML_TO_IMAGE_OPTS, skipFonts: true });
    }
    throw err;
  }
}

// Reusable composite canvas — avoids creating a new canvas per frame
let compositeCanvas: HTMLCanvasElement | null = null;
let compositeCtx: CanvasRenderingContext2D | null = null;

function getCompositeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!compositeCanvas) {
    compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = VIDEO_WIDTH;
    compositeCanvas.height = VIDEO_HEIGHT;
    compositeCtx = compositeCanvas.getContext("2d", { alpha: false })!;
  }
  return { canvas: compositeCanvas, ctx: compositeCtx! };
}

interface AudioSource {
  dataUrl: string;
  volume: number;
  fadeOut: number; // seconds; 0 = no fade
  startTime?: number; // seconds from video start (default: 0)
  endTime?: number;   // seconds to cut the source (for loops with a defined end)
  loop?: boolean;     // loop the source between startTime and endTime
}

/** Connect multiple audio sources to a single MediaStreamAudioDestinationNode. */
async function buildAudioTracks(
  sources: AudioSource[],
  totalFrames: number
): Promise<{ tracks: MediaStreamTrack[]; audioCtx: AudioContext } | null> {
  if (sources.length === 0) return null;

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const totalSec = totalFrames / FPS;

  for (const src of sources) {
    const res = await fetch(src.dataUrl);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const bufferSource = audioCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;

    if (src.loop) {
      bufferSource.loop = true;
      bufferSource.loopEnd = audioBuffer.duration;
    }

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = src.volume;

    const startAt = audioCtx.currentTime + (src.startTime ?? 0);
    if (src.fadeOut > 0) {
      const fadeStart = Math.max(0, totalSec - src.fadeOut);
      gainNode.gain.setValueAtTime(src.volume, audioCtx.currentTime + fadeStart);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + totalSec);
    }

    bufferSource.connect(gainNode);
    gainNode.connect(dest);
    bufferSource.start(startAt);
    if (src.endTime != null) bufferSource.stop(audioCtx.currentTime + src.endTime);
  }

  return { tracks: dest.stream.getAudioTracks(), audioCtx };
}

/** Mix multiple AudioBuffers into a single interleaved per-channel Float32Array array. */
async function mixAudioBuffers(
  sources: AudioSource[],
  totalFrames: number
): Promise<{ channels: Float32Array[]; sampleRate: number } | null> {
  if (sources.length === 0) return null;

  const tmpCtx = new AudioContext();
  const totalSec = totalFrames / FPS;
  const buffers: { buf: AudioBuffer; vol: number; fadeOut: number }[] = [];

  for (const src of sources) {
    const res = await fetch(src.dataUrl);
    const arrayBuffer = await res.arrayBuffer();
    const buf = await tmpCtx.decodeAudioData(arrayBuffer);
    buffers.push({ buf, vol: src.volume, fadeOut: src.fadeOut });
  }
  tmpCtx.close();

  const sampleRate = buffers[0].buf.sampleRate;
  const totalSamples = Math.ceil(totalSec * sampleRate);
  const numChannels = Math.max(...buffers.map((b) => b.buf.numberOfChannels));
  const channels: Float32Array[] = Array.from({ length: numChannels }, () => new Float32Array(totalSamples));

  for (let si = 0; si < buffers.length; si++) {
    const { buf, vol, fadeOut } = buffers[si];
    const src = sources[si];
    const fadeOutSamples = Math.round(fadeOut * sampleRate);
    const fadeStart      = totalSamples - fadeOutSamples;
    const startSample    = Math.round((src.startTime ?? 0) * sampleRate);
    const endSample      = src.endTime != null
      ? Math.min(Math.round(src.endTime * sampleRate), totalSamples)
      : totalSamples;

    for (let ch = 0; ch < numChannels; ch++) {
      const srcCh   = Math.min(ch, buf.numberOfChannels - 1);
      const srcData = buf.getChannelData(srcCh);
      const maxJ    = src.loop ? endSample - startSample : Math.min(srcData.length, endSample - startSample);

      for (let j = 0; j < maxJ; j++) {
        const outS   = startSample + j;
        if (outS >= totalSamples) break;
        const srcIdx = src.loop ? j % srcData.length : j;
        if (!src.loop && srcIdx >= srcData.length) break;
        let v = srcData[srcIdx] * vol;
        if (fadeOut > 0 && outS >= fadeStart && fadeOutSamples > 0) {
          v *= 1 - (outS - fadeStart) / fadeOutSamples;
        }
        channels[ch][outS] = Math.max(-1, Math.min(1, channels[ch][outS] + v));
      }
    }
  }

  return { channels, sampleRate };
}

function buildAudioSources(config: SnippetConfig, totalFrames: number, narrativeOpts: NarrativeOpts): AudioSource[] {
  const sources: AudioSource[] = [];
  const totalSec = totalFrames / FPS;

  // Voiceover
  if (config.audioDataUrl) {
    sources.push({ dataUrl: config.audioDataUrl, volume: config.audioVolume, fadeOut: config.audioFadeOut });
  }

  // Background music: uploaded file takes priority over preset
  const musicDataUrl = config.bgMusicDataUrl
    ?? (config.bgMusicPreset ? getMusicPreset(config.bgMusicPreset as MusicPresetKey) : null);
  if (musicDataUrl) {
    sources.push({
      dataUrl: musicDataUrl,
      volume: config.bgMusicVolume,
      fadeOut: config.bgMusicFadeOut,
      loop: true,
      endTime: totalSec,
    });
  }

  // Sound effects
  if (config.sfxEnabled) {
    const sfxVol = config.sfxVolume ?? 1;
    const isHighlightStatic = config.scanMode !== "zoom-pan";
    const { typingStartSec, typingEndSec, zoomInStartSec, zoomOutStartSec, outroStartSec, outroEndSec } =
      computeVideoTimings(config, narrativeOpts);

    // Mouse click at video start
    sources.push({ dataUrl: SFX_START_CLICK, volume: 0.75 * sfxVol, fadeOut: 0, startTime: 0 });

    // Typing click loop — code
    sources.push({
      dataUrl: SFX_TYPE_CLICK,
      volume: 0.55 * sfxVol,
      fadeOut: 0,
      startTime: typingStartSec,
      endTime: typingEndSec,
      loop: true,
    });

    // Zoom-in/out SFX — only in zoom-pan mode
    if (!isHighlightStatic) {
      if (isFinite(zoomInStartSec)) {
        sources.push({ dataUrl: SFX_ZOOM_IN, volume: 0.75 * sfxVol, fadeOut: 0, startTime: zoomInStartSec });
      }
      if (isFinite(zoomOutStartSec)) {
        sources.push({ dataUrl: SFX_ZOOM_OUT, volume: 0.75 * sfxVol, fadeOut: 0, startTime: zoomOutStartSec });
      }
    }

    // Typing click loop — narrative comments during scan
    if (config.scanEnabled) {
      const modeZoomFrames = isHighlightStatic ? 0 : SCAN_ZOOM_FRAMES;
      const panStartSec = typingEndSec + SCAN_PRE_PAUSE_FRAMES / FPS + modeZoomFrames / FPS;
      const panTimings = computeLinePanTimings(config, narrativeOpts.narrativeMap, narrativeOpts.narrativeLineIndices, narrativeOpts.introLineIndices);
      const nonNarrativeTimings = panTimings.filter(t => t.readFrames > 0);
      let sfxCursor = 0;
      for (let i = 0; i < nonNarrativeTimings.length; i++) {
        const t = nonNarrativeTimings[i];
        const arriveEnd = sfxCursor + t.readFrames;
        const commentEnd = arriveEnd + t.commentTypingFrames;
        const holdEnd = commentEnd + t.commentHoldFrames;
        const isLast = i === nonNarrativeTimings.length - 1;
        sfxCursor = isLast ? holdEnd : holdEnd + SCAN_SNAP_FRAMES;
        if (t.commentTypingFrames > 0) {
          sources.push({
            dataUrl: SFX_TYPE_CLICK,
            volume: 0.50 * sfxVol,
            fadeOut: 0,
            startTime: panStartSec + arriveEnd / FPS,
            endTime: panStartSec + commentEnd / FPS,
            loop: true,
          });
        }
      }
    }

    // Typing click loop — outro CTA
    if (isFinite(outroStartSec) && isFinite(outroEndSec)) {
      sources.push({
        dataUrl: SFX_TYPE_CLICK,
        volume: 0.55 * sfxVol,
        fadeOut: 0,
        startTime: outroStartSec,
        endTime: outroEndSec,
        loop: true,
      });
    }
  }

  return sources;
}

// ─── encoders (streaming: render + encode each frame immediately) ─────────────

type FrameRenderFn = (
  getEl: () => HTMLElement | null,
  setFrame: (f: number) => Promise<void>,
  i: number
) => Promise<HTMLCanvasElement>;

async function renderFrameCanvas(
  getEl: () => HTMLElement | null,
  setFrame: (f: number) => Promise<void>,
  i: number
): Promise<HTMLCanvasElement> {
  await setFrame(i);
  const el = getEl();
  if (!el) throw new Error("Frame element not mounted");

  // Capture DOM (silk canvas excluded via msContext filter — saves ~150ms/frame)
  const domCanvas = await captureFrame(el);

  // Composite silk separately if present: drawImage from WebGL canvas to 2D
  // canvas is ~1ms vs ~150ms for toDataURL+SVG-embed inside modern-screenshot
  const silkCanvas = el.querySelector<HTMLCanvasElement>("canvas[data-silk-canvas]");
  if (!silkCanvas) {
    return domCanvas;
  }

  const { canvas: out, ctx } = getCompositeCanvas();
  ctx.drawImage(silkCanvas, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  ctx.drawImage(domCanvas, 0, 0);
  return out;
}

async function encodeWebm(
  totalFrames: number,
  getFrameElement: () => HTMLElement | null,
  setFrame: (frame: number) => Promise<void>,
  config: SnippetConfig,
  narrativeOpts: NarrativeOpts,
  onProgress: (current: number, message: string) => void
): Promise<Blob> {
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : MediaRecorder.isTypeSupported("video/webm")
    ? "video/webm"
    : null;

  if (!mimeType) {
    throw new Error("Your browser doesn't support WebM recording. Please use Chrome, Edge, or Firefox.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const canvasStream = canvas.captureStream(FPS);
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

  const audioSources = buildAudioSources(config, totalFrames, narrativeOpts);
  const audioResult = await buildAudioTracks(audioSources, totalFrames);
  if (audioResult) {
    audioResult.tracks.forEach((t) => tracks.push(t));
  }

  const stream = new MediaStream(tracks);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const recordingDone = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start();

  const frameDuration = 1000 / FPS;
  for (let i = 0; i < totalFrames; i++) {
    const frameCanvas = await renderFrameCanvas(getFrameElement, setFrame, i);
    ctx.drawImage(frameCanvas, 0, 0);
    await new Promise((r) => setTimeout(r, frameDuration));

    if (i % 5 === 0 || i === totalFrames - 1) {
      onProgress(i + 1, `Rendering + encoding frame ${i + 1} / ${totalFrames}`);
    }
  }

  recorder.stop();
  await recordingDone;
  audioResult?.audioCtx.close();

  return new Blob(chunks, { type: "video/webm" });
}

async function encodeMp4(
  totalFrames: number,
  getFrameElement: () => HTMLElement | null,
  setFrame: (frame: number) => Promise<void>,
  config: SnippetConfig,
  narrativeOpts: NarrativeOpts,
  onProgress: (current: number, message: string) => void
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const audioSources = buildAudioSources(config, totalFrames, narrativeOpts);
  const mixedAudio = audioSources.length > 0 ? await mixAudioBuffers(audioSources, totalFrames) : null;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: VIDEO_WIDTH, height: VIDEO_HEIGHT, frameRate: FPS },
    ...(mixedAudio
      ? { audio: { codec: "aac", numberOfChannels: mixedAudio.channels.length, sampleRate: mixedAudio.sampleRate } }
      : {}),
    fastStart: "in-memory",
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });

  videoEncoder.configure({
    codec: "avc1.640032",
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    bitrate: 8_000_000,
    framerate: FPS,
  });

  const frameDurationUs = Math.round(1_000_000 / FPS);
  const exportStartedAt = performance.now();

  for (let i = 0; i < totalFrames; i++) {
    const frameCanvas = await renderFrameCanvas(getFrameElement, setFrame, i);
    const vf = new VideoFrame(frameCanvas, { timestamp: i * frameDurationUs, duration: frameDurationUs });
    videoEncoder.encode(vf, { keyFrame: i % 30 === 0 });
    vf.close();

    if (i % 5 === 0 || i === totalFrames - 1) {
      onProgress(i + 1, `Rendering + encoding frame ${i + 1} / ${totalFrames}`);
    }
    // Periodic perf log: per-frame avg + ETA. Helps diagnose slow exports.
    if (i > 0 && (i % 60 === 0 || i === totalFrames - 1)) {
      const elapsedTotal = performance.now() - exportStartedAt;
      const avgPerFrame = elapsedTotal / (i + 1);
      const remaining = (totalFrames - i - 1) * avgPerFrame;
      console.log(
        `[export] frame ${i + 1}/${totalFrames} · avg ${avgPerFrame.toFixed(1)}ms/frame · ` +
        `elapsed ${(elapsedTotal / 1000).toFixed(1)}s · ETA ${(remaining / 1000).toFixed(1)}s`
      );
    }
    // Yield every 4 frames or when encoder queue is deep — avoids blocking the
    // main thread on every frame while still draining the HW encoder queue.
    if (i % 4 === 3 || videoEncoder.encodeQueueSize > 5) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  console.log(
    `[export] DONE · ${totalFrames} frames · ${((performance.now() - exportStartedAt) / 1000).toFixed(1)}s total`
  );

  await videoEncoder.flush();

  if (mixedAudio) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { throw e; },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: mixedAudio.sampleRate,
      numberOfChannels: mixedAudio.channels.length,
      bitrate: 128_000,
    });

    const chunkSize = 1024;
    const totalSamples = mixedAudio.channels[0].length;
    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      const frameSize = Math.min(chunkSize, totalSamples - offset);
      const data = new Float32Array(frameSize * mixedAudio.channels.length);
      for (let ch = 0; ch < mixedAudio.channels.length; ch++) {
        data.set(mixedAudio.channels[ch].subarray(offset, offset + frameSize), ch * frameSize);
      }
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate: mixedAudio.sampleRate,
        numberOfFrames: frameSize,
        numberOfChannels: mixedAudio.channels.length,
        timestamp: Math.round((offset / mixedAudio.sampleRate) * 1_000_000),
        data,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
  }

  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useVideoExport() {
  const [progress, setProgress] = useState<ExportProgress>({
    phase: "idle",
    current: 0,
    total: 0,
    message: "",
    blobUrl: null,
    fileExt: "webm",
  });

  const exportWithFrameSetter = useCallback(
    async (
      config: SnippetConfig,
      getFrameElement: () => HTMLElement | null,
      setFrame: (frame: number) => Promise<void>,
      format: ExportFormat = "webm"
    ): Promise<void> => {
      const ext = format === "mp4" ? "mp4" : "webm";
      try {
        // Compute narrative opts once so all audio timing is in sync with the renderer
        const narrativeInfo = parseNarrative(config.code, config.language);
        const charWidth = config.fontSize * 0.6;
        const lineNumWidth = config.showLineNumbers
          ? (String(config.code.split("\n").length).length + 1) * charWidth + 24
          : 0;
        const codeAreaWidth = (VIDEO_WIDTH - config.padding * 2) - config.padding * 2;
        const maxCharsPerLine = Math.max(20, Math.floor((codeAreaWidth - lineNumWidth) / charWidth));
        const wrappedAct1Code = autoWrapCode(narrativeInfo.act1Code, maxCharsPerLine, config.language);
        const narrativeOpts: NarrativeOpts = {
          act1CodeLength: wrappedAct1Code.length,
          narrativeMap: narrativeInfo.narrativeMap,
          narrativeLineIndices: narrativeInfo.narrativeLineIndices,
          introLineIndices: narrativeInfo.introLineIndices,
        };

        const totalFrames = computeDurationFrames(config, narrativeOpts);

        // Embed webfonts once so every frame rasterizes with the real font
        // (Plus Jakarta Sans, JetBrains Mono…). Without this, the exporter
        // falls back to a system font and subtitles overlap.
        msContext = null;
        fontEmbedFailed = false;
        const frameEl = getFrameElement();
        if (frameEl) {
          try {
            // modern-screenshot context: pre-warms fonts + images once for all frames.
            // filter: skip the silk WebGL canvas — it's composited separately via
            // drawImage in renderFrameCanvas, avoiding ~150ms/frame of toDataURL +
            // base64 + SVG-embed overhead per frame.
            msContext = await msCreateContext(frameEl, {
              width: VIDEO_WIDTH,
              height: VIDEO_HEIGHT,
              scale: 1,
              filter: (node) => {
                if (node instanceof HTMLCanvasElement && node.dataset.silkCanvas !== undefined) {
                  return false;
                }
                return true;
              },
            });
          } catch (err) {
            console.warn("[export] modern-screenshot context failed, using html-to-image fallback:", err);
            msContext = null;
            try {
              cachedFontEmbedCSS = await getFontEmbedCSS(frameEl);
            } catch (e) {
              cachedFontEmbedCSS = null;
            }
          }
        }

        setProgress({ phase: "rendering-frames", current: 0, total: totalFrames, message: "Rendering...", blobUrl: null, fileExt: ext });

        const blob =
          format === "mp4"
            ? await encodeMp4(totalFrames, getFrameElement, setFrame, config, narrativeOpts, (current, message) => setProgress((p) => ({ ...p, current, message })))
            : await encodeWebm(totalFrames, getFrameElement, setFrame, config, narrativeOpts, (current, message) => setProgress((p) => ({ ...p, current, message })));

        const blobUrl = URL.createObjectURL(blob);
        setProgress({ phase: "done", current: totalFrames, total: totalFrames, message: "Done!", blobUrl, fileExt: ext });
      } catch (err) {
        console.error(err);
        setProgress({ phase: "error", current: 0, total: 0, message: err instanceof Error ? err.message : "Export failed", blobUrl: null, fileExt: ext });
      } finally {
        // Always release context memory after export (success or failure)
        if (msContext) {
          msDestroyContext(msContext);
          msContext = null;
        }
      }
    },
    []
  );

  const reset = useCallback(() => {
    setProgress((p) => {
      if (p.blobUrl) URL.revokeObjectURL(p.blobUrl);
      return { phase: "idle", current: 0, total: 0, message: "", blobUrl: null, fileExt: "webm" };
    });
  }, []);

  return { progress, exportWithFrameSetter, reset };
}
