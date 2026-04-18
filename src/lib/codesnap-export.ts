import { useState, useCallback } from "react";
import { toPng } from "html-to-image";
import {
  computeDurationFrames,
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  type SnippetConfig,
} from "@/lib/codesnap-types";

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
      setFrame: (frame: number) => Promise<void>
    ): Promise<void> => {
      try {
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

        const totalFrames = computeDurationFrames(config);

        // Phase 1: render every frame to a PNG blob
        setProgress({
          phase: "rendering-frames",
          current: 0,
          total: totalFrames,
          message: "Rendering frames...",
          blobUrl: null,
          fileExt: "webm",
        });

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
            setProgress((p) => ({
              ...p,
              current: i + 1,
              message: `Rendering frame ${i + 1} / ${totalFrames}`,
            }));
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        // Phase 2: encode frames into WebM via MediaRecorder
        setProgress({
          phase: "encoding",
          current: 0,
          total: totalFrames,
          message: "Encoding WebM...",
          blobUrl: null,
          fileExt: "webm",
        });

        const canvas = document.createElement("canvas");
        canvas.width = VIDEO_WIDTH;
        canvas.height = VIDEO_HEIGHT;
        const ctx = canvas.getContext("2d")!;

        const canvasStream = canvas.captureStream(FPS);
        const tracks: MediaStreamTrack[] = [
          ...canvasStream.getVideoTracks(),
        ];

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
            setProgress((p) => ({
              ...p,
              current: i + 1,
              message: `Encoding frame ${i + 1} / ${totalFrames}`,
            }));
          }
        }

        recorder.stop();
        await recordingDone;

        if (audioCtx) {
          audioCtx.close();
        }

        const blob = new Blob(chunks, { type: "video/webm" });
        const blobUrl = URL.createObjectURL(blob);

        setProgress({
          phase: "done",
          current: totalFrames,
          total: totalFrames,
          message: "Done!",
          blobUrl,
          fileExt: "webm",
        });
      } catch (err) {
        console.error(err);
        setProgress({
          phase: "error",
          current: 0,
          total: 0,
          message: err instanceof Error ? err.message : "Export failed",
          blobUrl: null,
          fileExt: "webm",
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
