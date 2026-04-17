import { useState, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
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
  | "loading-ffmpeg"
  | "rendering-frames"
  | "encoding"
  | "muxing-audio"
  | "done"
  | "error";
export interface ExportProgress {
  phase: ExportPhase;
  current: number;
  total: number;
  message: string;
  blobUrl: string | null;
}
let ffmpegInstance: FFmpeg | null = null;
async function getFFmpeg(
  onLog: (msg: string) => void
): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => onLog(message));
  // Use jsDelivr core (single-thread, smaller, no SharedArrayBuffer required)
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.wasm`,
      "application/wasm"
    ),
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}
export function useVideoExport() {
  const [progress, setProgress] = useState<ExportProgress>({
    phase: "idle",
    current: 0,
    total: 0,
    message: "",
    blobUrl: null,
  });
  const exportVideo = useCallback(
    async (
      config: SnippetConfig,
      thumbnailContainer: HTMLElement
    ): Promise<void> => {
      try {
        // Revoke previous blob if any
        setProgress((p) => {
          if (p.blobUrl) URL.revokeObjectURL(p.blobUrl);
          return {
            phase: "loading-ffmpeg",
            current: 0,
            total: 0,
            message: "Loading ffmpeg.wasm (~30MB, first time only)...",
            blobUrl: null,
          };
        });
        const ffmpeg = await getFFmpeg(() => {});
        const totalFrames = computeDurationFrames(config);
        setProgress({
          phase: "rendering-frames",
          current: 0,
          total: totalFrames,
          message: "Rendering frames...",
          blobUrl: null,
        });
        const target =
          (thumbnailContainer.querySelector(
            '[data-remotion-canvas]'
          ) as HTMLElement) ||
          (thumbnailContainer.firstElementChild as HTMLElement) ||
          thumbnailContainer;
        throw new Error("Use exportWithFrameSetter instead");
      } catch (err) {
        console.error(err);
        setProgress({
          phase: "error",
          current: 0,
          total: 0,
          message: err instanceof Error ? err.message : "Unknown error",
          blobUrl: null,
        });
      }
    },
    []
  );
  /**
   * Renders the video by repeatedly calling setFrame(i) and waiting for
   * the consumer's component to re-render the offscreen Thumbnail to that
   * frame, then capturing the DOM as PNG.
   */
  const exportWithFrameSetter = useCallback(
    async (
      config: SnippetConfig,
      getFrameElement: () => HTMLElement | null,
      setFrame: (frame: number) => Promise<void>
    ): Promise<void> => {
      try {
        setProgress((p) => {
          if (p.blobUrl) URL.revokeObjectURL(p.blobUrl);
          return {
            phase: "loading-ffmpeg",
            current: 0,
            total: 0,
            message: "Loading ffmpeg.wasm (first time only, ~30MB)...",
            blobUrl: null,
          };
        });
        const ffmpeg = await getFFmpeg(() => {});
        const totalFrames = computeDurationFrames(config);
        setProgress({
          phase: "rendering-frames",
          current: 0,
          total: totalFrames,
          message: "Rendering frames...",
          blobUrl: null,
        });
        // Capture each frame as PNG and write to ffmpeg FS
        for (let i = 0; i < totalFrames; i++) {
          await setFrame(i);
          // Wait for paint
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          const el = getFrameElement();
          if (!el) throw new Error("Frame element not mounted");
          const dataUrl = await toPng(el, {
            cacheBust: false,
            pixelRatio: 1,
            width: VIDEO_WIDTH,
            height: VIDEO_HEIGHT,
            skipFonts: false,
          });
          const idx = String(i).padStart(5, "0");
          await ffmpeg.writeFile(`frame_${idx}.png`, await fetchFile(dataUrl));
          if (i % 3 === 0 || i === totalFrames - 1) {
            setProgress((p) => ({
              ...p,
              current: i + 1,
              message: `Rendering frame ${i + 1} / ${totalFrames}`,
            }));
            // Yield to UI
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        setProgress({
          phase: "encoding",
          current: 0,
          total: 100,
          message: "Encoding WebM with ffmpeg.wasm...",
          blobUrl: null,
        });
        // Encode to WebM using libvpx-vp9 (no audio yet)
        await ffmpeg.exec([
          "-framerate",
          String(FPS),
          "-i",
          "frame_%05d.png",
          "-c:v",
          "libvpx-vp9",
          "-pix_fmt",
          "yuva420p",
          "-b:v",
          "0",
          "-crf",
          "30",
          "-deadline",
          "realtime",
          "-cpu-used",
          "8",
          "video_no_audio.webm",
        ]);
        let finalFile = "video_no_audio.webm";
        // Mux audio if present
        if (config.audioDataUrl) {
          setProgress({
            phase: "muxing-audio",
            current: 0,
            total: 100,
            message: "Mixing audio...",
            blobUrl: null,
          });
          // Detect extension from data URL mime
          const mimeMatch = /^data:audio\/([^;]+);/.exec(config.audioDataUrl);
          const audioExt = (mimeMatch?.[1] || "mp3").split("+")[0];
          const audioFile = `audio.${audioExt === "mpeg" ? "mp3" : audioExt}`;
          await ffmpeg.writeFile(
            audioFile,
            await fetchFile(config.audioDataUrl)
          );
          const totalSec = totalFrames / FPS;
          const fadeStart = Math.max(0, totalSec - config.audioFadeOut);
          await ffmpeg.exec([
            "-i",
            "video_no_audio.webm",
            "-i",
            audioFile,
            "-filter_complex",
            `[1:a]volume=${config.audioVolume},afade=t=out:st=${fadeStart}:d=${config.audioFadeOut}[a]`,
            "-map",
            "0:v",
            "-map",
            "[a]",
            "-c:v",
            "copy",
            "-c:a",
            "libopus",
            "-b:a",
            "128k",
            "-shortest",
            "video_with_audio.webm",
          ]);
          finalFile = "video_with_audio.webm";
        }
        const data = (await ffmpeg.readFile(finalFile)) as Uint8Array;
        const blob = new Blob([data.buffer as ArrayBuffer], {
          type: "video/webm",
        });
        const blobUrl = URL.createObjectURL(blob);
        // Cleanup ffmpeg FS
        try {
          for (let i = 0; i < totalFrames; i++) {
            const idx = String(i).padStart(5, "0");
            await ffmpeg.deleteFile(`frame_${idx}.png`);
          }
          await ffmpeg.deleteFile("video_no_audio.webm");
          if (config.audioDataUrl) {
            await ffmpeg.deleteFile("video_with_audio.webm");
          }
        } catch {
          // ignore cleanup errors
        }
        setProgress({
          phase: "done",
          current: totalFrames,
          total: totalFrames,
          message: "Done!",
          blobUrl,
        });
      } catch (err) {
        console.error(err);
        setProgress({
          phase: "error",
          current: 0,
          total: 0,
          message: err instanceof Error ? err.message : "Export failed",
          blobUrl: null,
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
      };
    });
  }, []);
  return { progress, exportVideo, exportWithFrameSetter, reset };
}
