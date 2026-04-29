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
  | "vercel-dark"
  | "chrome-y2k";

export type BackgroundStyle =
  | "ember-gradient"
  | "voltage-gradient"
  | "ink-grid"
  | "paper-noise"
  | "duotone-pop"
  | "custom-gradient"
  | "vercel-grain"
  | "chrome-flat";

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
  // outro / CTA text typed after scan
  outroEnabled: boolean;
  outroText: string;
  // background image
  backgroundImageDataUrl: string | null;
  backgroundImageName: string | null;
  backgroundImageOverlay: number; // 0..1 — dark overlay opacity
  // sound effects
  sfxEnabled: boolean;
  sfxVolume: number; // 0..1 — master volume for all SFX
  // background music
  bgMusicPreset: string | null; // MusicPresetKey or null (used when no file uploaded)
  bgMusicDataUrl: string | null; // uploaded file takes priority over preset
  bgMusicName: string | null;
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
  theme: "paper-light",
  background: "paper-noise",
  customGradient: {
    from: "#ff5722",
    to: "#1a1a1a",
    direction: "135deg",
  },
  fontSize: 24,
  padding: 56,
  showLineNumbers: false,
  windowChrome: true,
  typingSpeed: 30,
  startDelay: 0.4,
  holdEnd: 5,
  showCursor: true,
  title: "Quicksort in 7 lines",
  showTitle: true,
  brandHandle: "@ayrtonnacer",
  scanEnabled: true,
  scanSpeed: 3.0,
  scanZoom: 4.0,
  outroEnabled: false,
  outroText: "",
  backgroundImageDataUrl: null,
  backgroundImageName: null,
  backgroundImageOverlay: 0.3,
  sfxEnabled: true,
  sfxVolume: 1.0,
  bgMusicPreset: "midnight-buffering",
  bgMusicDataUrl: null,
  bgMusicName: null,
  bgMusicVolume: 0.8,
  bgMusicFadeOut: 2.0,
  audioDataUrl: null,
  audioName: null,
  audioVolume: 1.0,
  audioFadeOut: 0,
};

export const FPS = 30;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

export const SCAN_ZOOM_FRAMES     = Math.round(FPS * 0.45);
export const SCAN_SNAP_FRAMES     = Math.round(FPS * 0.25);
export const SCAN_BASE_READ_FRAMES = Math.round(FPS * 0.3);
export const SCAN_PRE_PAUSE_FRAMES = Math.round(FPS * 0.35);

export interface LinePanTiming {
  scrollDist: number;
  readFrames: number;
}

export function computeLinePanTimings(cfg: SnippetConfig): LinePanTiming[] {
  const charWidth      = cfg.fontSize * 0.6;
  const visibleWidth   = VIDEO_WIDTH / Math.max(1, cfg.scanZoom);
  const xCodeLeft      = cfg.padding * 2;
  const pixelsPerFrame = Math.max(0.1, cfg.scanSpeed * (VIDEO_WIDTH / 1000));
  const lines          = cfg.code.split("\n");
  const lineNumWidth   = cfg.showLineNumbers
    ? (String(lines.length).length + 1) * charWidth + 24
    : 0;
  return lines.map(line => {
    const lineContentEnd = xCodeLeft + lineNumWidth + line.trimEnd().length * charWidth;
    const idealTx    = visibleWidth - lineContentEnd;
    const targetTx   = Math.min(idealTx, -xCodeLeft);
    const scrollDist = Math.abs(-xCodeLeft - targetTx);
    const readFrames = SCAN_BASE_READ_FRAMES + Math.round(scrollDist / pixelsPerFrame);
    return { scrollDist, readFrames };
  });
}

export function computeDurationFrames(cfg: SnippetConfig): number {
  const typingSeconds = cfg.code.length / Math.max(1, cfg.typingSpeed);

  let scanSec = 0;
  if (cfg.scanEnabled) {
    const panTimings = computeLinePanTimings(cfg);
    const scanFrames = SCAN_ZOOM_FRAMES * 2
      + panTimings.reduce((sum, t) => sum + t.readFrames, 0)
      + SCAN_SNAP_FRAMES * (panTimings.length - 1);
    scanSec = SCAN_PRE_PAUSE_FRAMES / FPS + scanFrames / FPS;
  }

  const outroSeconds = cfg.outroEnabled && cfg.outroText.length > 0
    ? cfg.outroText.length / Math.max(1, cfg.typingSpeed)
    : 0;

  const total = cfg.startDelay + typingSeconds + scanSec + outroSeconds + cfg.holdEnd;
  return Math.max(FPS, Math.round(total * FPS));
}

/** Key video timestamps in seconds — used by export for SFX placement. */
export function computeVideoTimings(cfg: SnippetConfig): {
  typingStartSec: number;
  typingEndSec: number;
  zoomInStartSec: number;
  zoomOutStartSec: number;
  outroStartSec: number;
  outroEndSec: number;
} {
  const typingStartSec = cfg.startDelay;
  const typingEndSec   = typingStartSec + cfg.code.length / Math.max(1, cfg.typingSpeed);

  let zoomInStartSec  = Infinity;
  let zoomOutStartSec = Infinity;
  let outroStartSec   = typingEndSec;

  if (cfg.scanEnabled) {
    const panTimings = computeLinePanTimings(cfg);
    const panFrames  = panTimings.reduce((sum, t) => sum + t.readFrames, 0)
      + SCAN_SNAP_FRAMES * (panTimings.length - 1);

    zoomInStartSec  = typingEndSec + SCAN_PRE_PAUSE_FRAMES / FPS;
    zoomOutStartSec = zoomInStartSec + SCAN_ZOOM_FRAMES / FPS + panFrames / FPS;
    outroStartSec   = zoomOutStartSec + SCAN_ZOOM_FRAMES / FPS;
  }

  const outroEndSec = cfg.outroEnabled && cfg.outroText.length > 0
    ? outroStartSec + cfg.outroText.length / Math.max(1, cfg.typingSpeed)
    : Infinity;

  return { typingStartSec, typingEndSec, zoomInStartSec, zoomOutStartSec, outroStartSec, outroEndSec };
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
