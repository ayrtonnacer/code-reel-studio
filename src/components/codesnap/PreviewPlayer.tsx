import { Player, PlayerRef } from "@remotion/player";
import { useMemo, useRef, useState, useCallback } from "react";
import { CodeComposition } from "./CodeComposition";
import {
  computeDurationFrames,
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  type SnippetConfig,
} from "@/lib/codesnap-types";
import { Button } from "@/components/ui/button";
import { Play, RotateCcw, Pause, Maximize, Minimize, X } from "lucide-react";

interface Props {
  config: SnippetConfig;
}

export const PreviewPlayer: React.FC<Props> = ({ config }) => {
  const playerRef = useRef<PlayerRef>(null);
  const fullscreenPlayerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const durationInFrames = useMemo(() => computeDurationFrames(config), [config]);

  const handlePlayPause = useCallback((ref: React.RefObject<PlayerRef>) => {
    if (isPlaying) {
      ref.current?.pause();
      setIsPlaying(false);
    } else {
      ref.current?.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const openFullscreen = () => {
    setIsFullscreen(true);
    setIsPlaying(true);
  };

  const closeFullscreen = () => {
    setIsFullscreen(false);
    setIsPlaying(true);
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="brutal-border bg-ink p-3 relative group" style={{ boxShadow: "8px 8px 0 0 hsl(var(--ember))" }}>
          <Player
            ref={playerRef}
            component={CodeComposition}
            inputProps={{ config }}
            durationInFrames={durationInFrames}
            compositionWidth={VIDEO_WIDTH}
            compositionHeight={VIDEO_HEIGHT}
            fps={FPS}
            controls={false}
            autoPlay
            loop
            style={{
              width: "100%",
              aspectRatio: "9 / 16",
              maxHeight: "70vh",
              margin: "0 auto",
              display: "block",
            }}
          />
          <button
            onClick={openFullscreen}
            className="absolute top-2 right-2 bg-black/60 hover:bg-black/90 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Pantalla completa"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-xs text-muted-foreground">
            {VIDEO_WIDTH}×{VIDEO_HEIGHT} · {(durationInFrames / FPS).toFixed(1)}s · {FPS}fps
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="brutal-border brutal-shadow-sm font-mono"
              onClick={() => { playerRef.current?.seekTo(0); setIsPlaying(true); }}
            >
              <RotateCcw className="mr-1 h-4 w-4" /> Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="brutal-border brutal-shadow-sm font-mono"
              onClick={() => handlePlayPause(playerRef)}
            >
              {isPlaying ? (
                <><Pause className="mr-1 h-4 w-4" /> Pause</>
              ) : (
                <><Play className="mr-1 h-4 w-4" /> Play</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="brutal-border brutal-shadow-sm font-mono"
              onClick={openFullscreen}
            >
              <Maximize className="mr-1 h-4 w-4" /> Fullscreen
            </Button>
          </div>
        </div>
      </div>

      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={(e) => { if (e.target === e.currentTarget) closeFullscreen(); }}
        >
          <div className="relative flex flex-col items-center gap-4" style={{ height: "100vh", maxWidth: "calc(100vh * 9 / 16)" }}>
            <Player
              ref={fullscreenPlayerRef}
              component={CodeComposition}
              inputProps={{ config }}
              durationInFrames={durationInFrames}
              compositionWidth={VIDEO_WIDTH}
              compositionHeight={VIDEO_HEIGHT}
              fps={FPS}
              controls={false}
              autoPlay
              loop
              style={{
                width: "100%",
                height: "calc(100vh - 80px)",
                display: "block",
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="brutal-border font-mono bg-black/60 text-white border-white/30 hover:bg-white/10"
                onClick={() => { fullscreenPlayerRef.current?.seekTo(0); setIsPlaying(true); }}
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Reset
              </Button>
              <Button
                size="sm"
                className="brutal-border font-mono bg-ember text-white hover:bg-ember/90"
                onClick={() => handlePlayPause(fullscreenPlayerRef)}
              >
                {isPlaying ? (
                  <><Pause className="mr-1 h-4 w-4" /> Pause</>
                ) : (
                  <><Play className="mr-1 h-4 w-4" /> Play</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="brutal-border font-mono bg-black/60 text-white border-white/30 hover:bg-white/10"
                onClick={closeFullscreen}
              >
                <Minimize className="mr-1 h-4 w-4" /> Exit
              </Button>
            </div>
          </div>
          <button
            onClick={closeFullscreen}
            className="absolute top-4 right-4 bg-black/60 hover:bg-red-600 text-white p-2 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
};
