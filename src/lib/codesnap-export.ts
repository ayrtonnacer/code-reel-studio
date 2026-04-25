import { useState, useCallback } from "react";
import { toPng } from "html-to-image";
import {
  computeDurationFrames,
  computeVideoTimings,
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  type SnippetConfig,
} from "@/lib/codesnap-types";
import { getMusicPreset, SFX_TYPE_CLICK, SFX_ZOOM_IN, SFX_ZOOM_OUT, SFX_INTRO_WHOOSH, type MusicPresetKey } from "@/lib/codesnap-sfx";

export type ExportFormat = "webm" | "mp4";

export type ExportPhase =
  | "idle"
  | "rendering-frames"
  | "encoding"
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

async function renderFrames(
  totalFrames: number,
  getFrameElement: () => HTMLElement | null,
  setFrame: (frame: number) => Promise<void>,
  onProgress: (current: number, message: string) => void
): Promise<Blob[]> {
  const frameBlobs: Blob[] = [];
  for (let i = 0; i < totalFrames; i++) {
    await setFrame(i);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const el = getFrameElement();
    if (!el) throw new Error("Frame element not mounted");

    const dataUrl = await toPng(el, {
      cacheBust: false,
      pixelRatio: 1,
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      skipFonts: true,
    });

    const blob = await (await fetch(dataUrl)).blob();
    frameBlobs.push(blob);

    if (i % 3 === 0 || i === totalFrames - 1) {
      onProgress(i + 1, `Rendering frame ${i + 1} / ${totalFrames}`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return frameBlobs;
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

function buildAudioSources(config: SnippetConfig, totalFrames: number): AudioSource[] {
  const sources: AudioSource[] = [];
  const totalSec = totalFrames / FPS;

  // Voiceover
  if (config.audioDataUrl) {
    sources.push({ dataUrl: config.audioDataUrl, volume: config.audioVolume, fadeOut: config.audioFadeOut });
  }

  // Background music preset
  if (config.bgMusicPreset) {
    sources.push({
      dataUrl: getMusicPreset(config.bgMusicPreset as MusicPresetKey),
      volume: config.bgMusicVolume,
      fadeOut: config.bgMusicFadeOut,
      loop: true,
      endTime: totalSec,
    });
  }

  // Sound effects
  if (config.sfxEnabled) {
    const { typingStartSec, typingEndSec, zoomInStartSec, zoomOutStartSec } = computeVideoTimings(config);

    // Intro whoosh at t=0
    sources.push({ dataUrl: SFX_INTRO_WHOOSH, volume: 0.75, fadeOut: 0, startTime: 0 });

    // Typing click loop
    sources.push({
      dataUrl: SFX_TYPE_CLICK,
      volume: 0.55,
      fadeOut: 0,
      startTime: typingStartSec,
      endTime: typingEndSec,
      loop: true,
    });

    // Zoom-in click
    if (isFinite(zoomInStartSec)) {
      sources.push({ dataUrl: SFX_ZOOM_IN, volume: 0.75, fadeOut: 0, startTime: zoomInStartSec });
    }

    // Zoom-out click
    if (isFinite(zoomOutStartSec)) {
      sources.push({ dataUrl: SFX_ZOOM_OUT, volume: 0.75, fadeOut: 0, startTime: zoomOutStartSec });
    }
  }

  return sources;
}

// ─── encoders ────────────────────────────────────────────────────────────────

async function encodeWebm(
  frameBlobs: Blob[],
  config: SnippetConfig,
  totalFrames: number,
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

  const audioSources = buildAudioSources(config, totalFrames);
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
  for (let i = 0; i < frameBlobs.length; i++) {
    const bitmap = await createImageBitmap(frameBlobs[i]);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    await new Promise((r) => setTimeout(r, frameDuration));

    if (i % 5 === 0 || i === frameBlobs.length - 1) {
      onProgress(i + 1, `Encoding frame ${i + 1} / ${totalFrames}`);
    }
  }

  recorder.stop();
  await recordingDone;
  audioResult?.audioCtx.close();

  return new Blob(chunks, { type: "video/webm" });
}

async function encodeMp4(
  frameBlobs: Blob[],
  config: SnippetConfig,
  totalFrames: number,
  onProgress: (current: number, message: string) => void
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const audioSources = buildAudioSources(config, totalFrames);
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
  for (let i = 0; i < frameBlobs.length; i++) {
    const bitmap = await createImageBitmap(frameBlobs[i]);
    const frame = new VideoFrame(bitmap, { timestamp: i * frameDurationUs, duration: frameDurationUs });
    bitmap.close();
    videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
    frame.close();

    if (i % 5 === 0 || i === frameBlobs.length - 1) {
      onProgress(i + 1, `Encoding frame ${i + 1} / ${totalFrames}`);
    }
    await new Promise((r) => setTimeout(r, 0));
  }

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
        const totalFrames = computeDurationFrames(config);

        setProgress({ phase: "rendering-frames", current: 0, total: totalFrames, message: "Rendering frames...", blobUrl: null, fileExt: ext });

        const frameBlobs = await renderFrames(
          totalFrames, getFrameElement, setFrame,
          (current, message) => setProgress((p) => ({ ...p, current, message }))
        );

        setProgress({ phase: "encoding", current: 0, total: totalFrames, message: `Encoding ${format.toUpperCase()}...`, blobUrl: null, fileExt: ext });

        const blob =
          format === "mp4"
            ? await encodeMp4(frameBlobs, config, totalFrames, (current, message) => setProgress((p) => ({ ...p, current, message })))
            : await encodeWebm(frameBlobs, config, totalFrames, (current, message) => setProgress((p) => ({ ...p, current, message })));

        const blobUrl = URL.createObjectURL(blob);
        setProgress({ phase: "done", current: totalFrames, total: totalFrames, message: "Done!", blobUrl, fileExt: ext });
      } catch (err) {
        console.error(err);
        setProgress({ phase: "error", current: 0, total: 0, message: err instanceof Error ? err.message : "Export failed", blobUrl: null, fileExt: ext });
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
