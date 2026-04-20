import { useRef, useState, useCallback } from "react";
import { Thumbnail } from "@remotion/player";
import { CodeComposition } from "./CodeComposition";
import {
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  type SnippetConfig,
} from "@/lib/codesnap-types";
import { useVideoExport, isMp4Supported, type ExportFormat } from "@/lib/codesnap-export";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: SnippetConfig;
}

export const ExportDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  config,
}) => {
  const offscreenRef = useRef<HTMLDivElement>(null);
  const [renderFrame, setRenderFrame] = useState(0);
  const [format, setFormat] = useState<ExportFormat>("webm");
  const setFramePromiseRef = useRef<(() => void) | null>(null);
  const { progress, exportWithFrameSetter, reset } = useVideoExport();
  const mp4Supported = isMp4Supported();

  const setFrame = useCallback((frame: number) => {
    return new Promise<void>((resolve) => {
      setFramePromiseRef.current = resolve;
      setRenderFrame(frame);
      requestAnimationFrame(() => {
        if (setFramePromiseRef.current === resolve) {
          setFramePromiseRef.current = null;
          resolve();
        }
      });
    });
  }, []);

  const handleStart = async () => {
    await exportWithFrameSetter(
      config,
      () => offscreenRef.current,
      setFrame,
      format
    );
  };

  const handleDownload = () => {
    if (!progress.blobUrl) return;
    const a = document.createElement("a");
    a.href = progress.blobUrl;
    const safeName =
      config.filename.replace(/\.[^.]+$/, "") || "codesnap";
    const ext = progress.fileExt || "webm";
    a.download = `${safeName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      reset();
      setRenderFrame(0);
    }
    onOpenChange(v);
  };

  const isWorking =
    progress.phase === "rendering-frames" ||
    progress.phase === "encoding";

  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="brutal-border rounded-none bg-paper max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight">
              Export
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Renders and encodes frames directly in your browser.
              Keep this tab focused while exporting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {progress.phase === "idle" && (
              <div className="font-mono text-xs space-y-2 brutal-border bg-concrete p-3">
                <Row label="Resolution" value={`${VIDEO_WIDTH}\u00d7${VIDEO_HEIGHT}`} />
                <Row label="FPS" value={String(FPS)} />
                <Row
                  label="Audio"
                  value={
                    config.audioDataUrl
                      ? config.audioName ?? "Custom"
                      : "None"
                  }
                />

                {/* Format selector */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] tracking-wide text-muted-foreground">
                    Format
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setFormat("webm")}
                      className={`px-2 py-0.5 text-[10px] font-mono brutal-border transition-colors ${
                        format === "webm"
                          ? "bg-ink text-paper"
                          : "bg-paper text-ink hover:bg-concrete"
                      }`}
                    >
                      WebM
                    </button>
                    <button
                      onClick={() => mp4Supported && setFormat("mp4")}
                      disabled={!mp4Supported}
                      title={!mp4Supported ? "Requires Chrome or Edge" : undefined}
                      className={`px-2 py-0.5 text-[10px] font-mono brutal-border transition-colors ${
                        format === "mp4"
                          ? "bg-ink text-paper"
                          : "bg-paper text-ink hover:bg-concrete"
                      } ${!mp4Supported ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      MP4
                    </button>
                  </div>
                </div>

                {format === "mp4" && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    MP4 uses H.264 — compatible with Instagram, TikTok, and
                    YouTube. Faster encoding than WebM.
                  </p>
                )}
                {format === "webm" && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Export runs fully in your browser — no uploads, no installs.
                    Long videos take time: ~1s per frame to render plus video
                    duration for encoding.
                  </p>
                )}
              </div>
            )}
            {progress.phase !== "idle" && (
              <div className="space-y-3">
                <div className="font-mono text-xs flex items-center gap-2">
                  {isWorking && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  {progress.phase === "done" && (
                    <span className="bg-voltage text-ink px-2 py-0.5 brutal-border text-[10px]">
                      Ready
                    </span>
                  )}
                  {progress.phase === "error" && (
                    <span className="bg-destructive text-destructive-foreground px-2 py-0.5 brutal-border text-[10px]">
                      Error
                    </span>
                  )}
                  <span className="truncate">{progress.message}</span>
                </div>
                {(progress.phase === "rendering-frames" ||
                  progress.phase === "encoding") && (
                  <Progress value={pct} className="h-2 brutal-border rounded-none" />
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {progress.phase === "idle" && (
              <Button
                onClick={handleStart}
                className="brutal-border brutal-shadow-sm bg-white text-black hover:bg-white/90 font-mono rounded-none"
              >
                Start Export
              </Button>
            )}
            {progress.phase === "done" && progress.blobUrl && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleClose(false)}
                  className="brutal-border font-mono rounded-none"
                >
                  Close
                </Button>
                <Button
                  onClick={handleDownload}
                  className="brutal-border brutal-shadow-sm bg-white text-black hover:bg-white/90 font-mono rounded-none"
                >
                  <Download className="mr-2 h-4 w-4" /> Download {progress.fileExt.toUpperCase()}
                </Button>
              </>
            )}
            {progress.phase === "error" && (
              <Button
                variant="outline"
                onClick={reset}
                className="brutal-border font-mono rounded-none"
              >
                <X className="mr-2 h-4 w-4" /> Reset
              </Button>
            )}
            {isWorking && (
              <Button
                variant="outline"
                disabled
                className="brutal-border font-mono rounded-none opacity-60"
              >
                Working…
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          width: VIDEO_WIDTH,
          height: VIDEO_HEIGHT,
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <div ref={offscreenRef} style={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT }}>
          <Thumbnail
            component={CodeComposition}
            inputProps={{ config }}
            compositionWidth={VIDEO_WIDTH}
            compositionHeight={VIDEO_HEIGHT}
            durationInFrames={Math.max(
              FPS,
              Math.round(
                (config.startDelay +
                  config.code.length / Math.max(1, config.typingSpeed) +
                  config.holdEnd) *
                  FPS
              )
            )}
            fps={FPS}
            frameToDisplay={renderFrame}
            style={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT }}
          />
        </div>
      </div>
    </>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-[10px] tracking-wide text-muted-foreground">
      {label}
    </span>
    <span className="font-medium">{value}</span>
  </div>
);
