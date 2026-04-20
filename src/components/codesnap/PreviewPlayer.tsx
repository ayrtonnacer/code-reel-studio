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
import { Play, RotateCcw, Pause } from "lucide-react";

interface Props {
  config: SnippetConfig;
}

export const PreviewPlayer: React.FC<Props> = ({ config }) => {
  const playerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const durationInFrames = useMemo(() => computeDurationFrames(config), [config]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      playerRef.current?.pause();
      setIsPlaying(false);
    } else {
      playerRef.current?.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  return (
    <div className="flex flex-col gap-4">
      <div className="brutal-border bg-ink p-3" style={{ boxShadow: "8px 8px 0 0 hsl(var(--ember))" }}>
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
            onClick={handlePlayPause}
          >
            {isPlaying ? (
              <><Pause className="mr-1 h-4 w-4" /> Pause</>
            ) : (
              <><Play className="mr-1 h-4 w-4" /> Play</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
