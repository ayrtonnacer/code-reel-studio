export type Language =
  | "javascript"
  | "typescript"
  | "tsx"
  | "jsx"
  | "python"
  | "go"
  | "rust"
  | "ruby"
  | "java"
  | "csharp"
  | "cpp"
  | "bash"
  | "sql"
  | "html"
  | "css"
  | "json";

export type Theme =
  | "scale-dark"
  | "synthwave"
  | "github-dark"
  | "monokai"
  | "dracula"
  | "paper-light"
  | "vercel-dark";

export type BackgroundStyle =
  | "ember-gradient"
  | "voltage-gradient"
  | "ink-grid"
  | "paper-noise"
  | "duotone-pop"
  | "custom-gradient"
  | "vercel-grain";

export type GradientDirection =
  | "to right"
  | "to bottom"
  | "to bottom right"
  | "to bottom left"
  | "135deg"
  | "45deg"
  | "radial";

export interface CustomGradient {
  from: string; // hex
  to: string; // hex
  direction: GradientDirection;
}

export interface SnippetConfig {
  code: string;
  language: Language;
  filename: string;
  theme: Theme;
  background: BackgroundStyle;
  customGradient: CustomGradient;
  fontSize: number;
  padding: number;
  showLineNumbers: boolean;
  windowChrome: boolean;
  // animation
  typingSpeed: number; // chars per second
  startDelay: number; // seconds
  holdEnd: number; // seconds at the end
  showCursor: boolean;
  // branding / text
  title: string;
  showTitle: boolean;
  brandHandle: string;
  // scan effect
  scanEnabled: boolean;
  scanSpeed: number; // lines per second (e.g. 0.6 = ~1.7s per line)
  scanZoom: number;  // zoom multiplier during scan (e.g. 7 = very aggressive)
  // sound effects
  sfxEnabled: boolean;
  // background music preset
  bgMusicPreset: string | null; // MusicPresetKey or null
  bgMusicVolume: number; // 0..1
  bgMusicFadeOut: number; // seconds
  // voiceover
  audioDataUrl: string | null;
  audioName: string | null;
  audioVolume: number; // 0..1
  audioFadeOut: number; // seconds
}

export const DEFAULT_CODE = `def quicksort(arr):
  if len(arr) <= 1: return arr
  pivot = arr[len(arr) // 2]
  left = [x for x in arr if x < pivot]
  middle = [x for x in arr if x == pivot]
  right = [x for x in arr if x > pivot]
  return quicksort(left) + middle + quicksort(right)
`;

export const DEFAULT_CONFIG: SnippetConfig = {
  code: DEFAULT_CODE,
  language: "python",
  filename: "quicksort.py",
  theme: "scale-dark",
  background: "vercel-grain",
  customGradient: {
    from: "#ff5722",
    to: "#1a1a1a",
    direction: "135deg",
  },
  fontSize: 24,
  padding: 56,
  showLineNumbers: false,
  windowChrome: true,
  typingSpeed: 28,
  startDelay: 0.4,
  holdEnd: 1.5,
  showCursor: true,
  title: "Quicksort in 7 lines",
  showTitle: true,
  brandHandle: "@ayrtonnacer",
  scanEnabled: true,
  scanSpeed: 0.20,
  scanZoom: 12,
  sfxEnabled: false,
  bgMusicPreset: null,
  bgMusicVolume: 0.25,
  bgMusicFadeOut: 2.0,
  audioDataUrl: null,
  audioName: null,
  audioVolume: 1.0,
  audioFadeOut: 0,
};

export const FPS = 30;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

export function computeDurationFrames(cfg: SnippetConfig): number {
  const chars = cfg.code.length;
  const typingSeconds = chars / Math.max(1, cfg.typingSpeed);

  // Scan-read effect duration (must mirror the logic in CodeComposition)
  const lines         = cfg.code.split("\n");
  const ZOOM_SEC      = 0.45;  // zoom-in / zoom-out each
  const SNAP_SEC      = 0.25;  // snap between lines
  const BASE_READ_SEC = 0.3;   // minimum read time per line
  const charWidth     = cfg.fontSize * 0.6;
  const pixelsPerFrame = Math.max(0.1, cfg.scanSpeed * (VIDEO_WIDTH / 1000));
  const pixelsPerSec   = pixelsPerFrame * FPS;
  const visibleWidth   = VIDEO_WIDTH / Math.max(1, cfg.scanZoom);
  const xCodeLeft      = cfg.padding * 2;
  const lineNumWidth   = cfg.showLineNumbers
    ? (String(lines.length).length + 1) * charWidth + 24
    : 0;

  let scanSec = ZOOM_SEC + ZOOM_SEC; // zoom-in + zoom-out
  lines.forEach((line, idx) => {
    const lineContentEnd = xCodeLeft + lineNumWidth + line.trimEnd().length * charWidth;
    const idealTx  = visibleWidth - lineContentEnd;
    const targetTx = Math.min(idealTx, -xCodeLeft);
    const scrollDist = Math.abs(-xCodeLeft - targetTx);
    const readSec = BASE_READ_SEC + scrollDist / pixelsPerSec;
    scanSec += readSec;
    if (idx < lines.length - 1) scanSec += SNAP_SEC;
  });

  const total = cfg.startDelay + typingSeconds + (cfg.scanEnabled ? 0.35 /* pause */ + scanSec : 0) + cfg.holdEnd;
  return Math.max(FPS, Math.round(total * FPS));
}

/** Key video timestamps in seconds — used by export for SFX placement. */
export function computeVideoTimings(cfg: SnippetConfig): {
  typingStartSec: number;
  typingEndSec: number;
  zoomInStartSec: number;
  zoomOutStartSec: number;
} {
  const typingStartSec = cfg.startDelay;
  const typingEndSec   = typingStartSec + cfg.code.length / Math.max(1, cfg.typingSpeed);

  if (!cfg.scanEnabled) {
    return { typingStartSec, typingEndSec, zoomInStartSec: Infinity, zoomOutStartSec: Infinity };
  }

  const ZOOM_SEC       = 0.45;
  const SNAP_SEC       = 0.25;
  const BASE_READ_SEC  = 0.3;
  const charWidth      = cfg.fontSize * 0.6;
  const pixelsPerSec   = Math.max(0.1, cfg.scanSpeed * (VIDEO_WIDTH / 1000)) * FPS;
  const visibleWidth   = VIDEO_WIDTH / Math.max(1, cfg.scanZoom);
  const xCodeLeft      = cfg.padding * 2;
  const lines          = cfg.code.split('\n');
  const lineNumWidth   = cfg.showLineNumbers
    ? (String(lines.length).length + 1) * charWidth + 24
    : 0;

  let panDuration = 0;
  lines.forEach((line, idx) => {
    const lineContentEnd = xCodeLeft + lineNumWidth + line.trimEnd().length * charWidth;
    const idealTx    = visibleWidth - lineContentEnd;
    const targetTx   = Math.min(idealTx, -xCodeLeft);
    const scrollDist = Math.abs(-xCodeLeft - targetTx);
    panDuration += BASE_READ_SEC + scrollDist / pixelsPerSec;
    if (idx < lines.length - 1) panDuration += SNAP_SEC;
  });

  const zoomInStartSec  = typingEndSec + 0.35;
  const zoomOutStartSec = zoomInStartSec + ZOOM_SEC + panDuration;

  return { typingStartSec, typingEndSec, zoomInStartSec, zoomOutStartSec };
}

export function buildBackgroundCss(
  cg: CustomGradient
): React.CSSProperties {
  if (cg.direction === "radial") {
    return {
      background: `radial-gradient(circle at 30% 20%, ${cg.from} 0%, ${cg.to} 100%)`,
    };
  }
  return {
    background: `linear-gradient(${cg.direction}, ${cg.from} 0%, ${cg.to} 100%)`,
  };
}
