import { useState, useCallback } from "react";
import { toPng } from "html-to-image";
import {
  computeDurationFrames,
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  type SnippetConfig,
} from "@/lib/codesnap-types";

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
    throw new Error(
      "Your browser doesn't support WebM recording. Please use Chrome, Edge, or Firefox."
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const canvasStream = canvas.captureStream(FPS);
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

  let audioCtx: AudioContext | null = null;
  if (config.audioDataUrl) {
    audioCtx = new AudioContext();
    const res = await fetch(config.audioDataUrl);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = config.audioVolume;

    const totalSec = totalFrames / FPS;
    const fadeStart = Math.max(0, totalSec - config.audioFadeOut);
    gainNode.gain.setValueAtTime(config.audioVolume, audioCtx.currentTime + fadeStart);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + totalSec);

    source.connect(gainNode);
    gainNode.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => tracks.push(t));
    source.start(audioCtx.currentTime);
  }

  const stream = new MediaStream(tracks);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

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
  audioCtx?.close();

  return new Blob(chunks, { type: "video/webm" });
}

async function encodeMp4(
  frameBlobs: Blob[],
  config: SnippetConfig,
  totalFrames: number,
  onProgress: (current: number, message: string) => void
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const hasAudio = !!config.audioDataUrl;
  let audioCtx: AudioContext | null = null;
  let audioBuffer: AudioBuffer | null = null;

  if (hasAudio) {
    audioCtx = new AudioContext();
    const res = await fetch(config.audioDataUrl!);
    const arrayBuffer = await res.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      frameRate: FPS,
    },
    ...(hasAudio && audioBuffer
      ? {
          audio: {
            codec: "aac",
            numberOfChannels: audioBuffer.numberOfChannels,
            sampleRate: audioBuffer.sampleRate,
          },
        }
      : {}),
    fastStart: "in-memory",
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });

  // H.264 High Profile Level 5.0 — supports 1080×1920 @ 30fps
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
    const frame = new VideoFrame(bitmap, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });
    bitmap.close();
    videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
    frame.close();

    if (i % 5 === 0 || i === frameBlobs.length - 1) {
      onProgress(i + 1, `Encoding frame ${i + 1} / ${totalFrames}`);
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  await videoEncoder.flush();

  // Encode audio if present
  if (hasAudio && audioBuffer) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { throw e; },
    });

    audioEncoder.configure({
      codec: "mp4a.40.2", // AAC-LC
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      bitrate: 128_000,
    });

    // Trim audio to video duration and apply volume
    const totalSec = totalFrames / FPS;
    const sampleRate = audioBuffer.sampleRate;
    const totalSamples = Math.min(
      audioBuffer.length,
      Math.ceil(totalSec * sampleRate)
    );
    const fadeOutSamples = Math.round(config.audioFadeOut * sampleRate);
    const fadeStart = totalSamples - fadeOutSamples;

    // Feed audio in chunks of 1024 samples (AAC frame size)
    const chunkSize = 1024;
    const numberOfChannels = audioBuffer.numberOfChannels;

    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      const frameSize = Math.min(chunkSize, totalSamples - offset);
      const data = new Float32Array(frameSize * numberOfChannels);

      for (let ch = 0; ch < numberOfChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let s = 0; s < frameSize; s++) {
          const sample = offset + s;
          let value = channelData[sample] * config.audioVolume;
          // Linear fade out
          if (sample >= fadeStart && fadeOutSamples > 0) {
            value *= 1 - (sample - fadeStart) / fadeOutSamples;
          }
          data[ch * frameSize + s] = value;
        }
      }

      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: frameSize,
        numberOfChannels,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
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

        setProgress({
          phase: "rendering-frames",
          current: 0,
          total: totalFrames,
          message: "Rendering frames...",
          blobUrl: null,
          fileExt: ext,
        });

        const frameBlobs = await renderFrames(
          totalFrames,
          getFrameElement,
          setFrame,
          (current, message) =>
            setProgress((p) => ({ ...p, current, message }))
        );

        setProgress({
          phase: "encoding",
          current: 0,
          total: totalFrames,
          message: `Encoding ${format.toUpperCase()}...`,
          blobUrl: null,
          fileExt: ext,
        });

        const blob =
          format === "mp4"
            ? await encodeMp4(frameBlobs, config, totalFrames, (current, message) =>
                setProgress((p) => ({ ...p, current, message }))
              )
            : await encodeWebm(frameBlobs, config, totalFrames, (current, message) =>
                setProgress((p) => ({ ...p, current, message }))
              );

        const blobUrl = URL.createObjectURL(blob);
        setProgress({
          phase: "done",
          current: totalFrames,
          total: totalFrames,
          message: "Done!",
          blobUrl,
          fileExt: ext,
        });
      } catch (err) {
        console.error(err);
        setProgress({
          phase: "error",
          current: 0,
          total: 0,
          message: err instanceof Error ? err.message : "Export failed",
          blobUrl: null,
          fileExt: ext,
        });
      }
    },
    []
  );

  const reset = useCallback(() => {
    setProgress((p) => {
      if (p.blobUrl) URL.revokeObjectURL(p.blobUrl);
      return {
        phase: "idle",
        current: 0,
        total: 0,
        message: "",
        blobUrl: null,
        fileExt: "webm",
      };
    });
  }, []);

  return { progress, exportWithFrameSetter, reset };
}
