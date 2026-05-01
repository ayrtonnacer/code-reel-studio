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
  // narrative comments style during scan
  commentStyle: "inline" | "subtitle";
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

export const DEFAULT_CODE = `# Función de ordenamiento rápido que devuelve una lista ordenada
def quicksort(arr):
  # Caso base: listas de 0 o 1 elemento ya están ordenadas
  if len(arr) <= 1:
    return arr

  # Elegimos el elemento del medio como pivote
  pivot = arr[len(arr) // 2]

  # Elementos menores al pivote
  left = [x for x in arr if x < pivot]

  # Elementos iguales al pivote
  middle = [x for x in arr if x == pivot]

  # Elementos mayores al pivote
  right = [x for x in arr if x > pivot]

  # Llamada recursiva y concatenación de los tres grupos
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
  startDelay: 1.2,
  holdEnd: 5,
  showCursor: true,
  title: "Quicksort en Python",
  showTitle: true,
  brandHandle: "@ayrtonnacer",
  scanEnabled: true,
  scanSpeed: 3.0,
  scanZoom: 2.5,
  commentStyle: "inline",
  outroEnabled: false,
  outroText: "",
  backgroundImageDataUrl: null,
  backgroundImageName: null,
  backgroundImageOverlay: 0,
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
// Hold after a narrative comment finishes typing before snapping to next line
export const SCAN_COMMENT_HOLD_FRAMES = Math.round(FPS * 0.7);

export interface LinePanTiming {
  scrollDist: number;
  readFrames: number;
  /** Split comment lines (0 = no comment, 1 = short, 2 = wrapped long comment) */
  commentLines: string[];
  commentLine1Frames: number;
  commentTypingFrames: number;
  commentHoldFrames: number;
}

export interface NarrativeOpts {
  act1CodeLength: number;
  narrativeMap: Map<number, string>;
  narrativeLineIndices: Set<number>;
}

export function computeLinePanTimings(
  cfg: SnippetConfig,
  narrativeMap?: Map<number, string>,
  narrativeLineIndices?: Set<number>
): LinePanTiming[] {
  const charWidth      = cfg.fontSize * 0.6;
  const visibleWidth   = VIDEO_WIDTH / Math.max(1, cfg.scanZoom);
  const xCodeLeft      = cfg.padding * 2;
  const pixelsPerFrame = Math.max(0.1, cfg.scanSpeed * (VIDEO_WIDTH / 1000));
  const lines          = cfg.code.split("\n");
  const lineNumWidth   = cfg.showLineNumbers
    ? (String(lines.length).length + 1) * charWidth + 24
    : 0;

  return lines.map((line, idx) => {
    // Narrative comment lines are skipped by the scanner
    if (narrativeLineIndices?.has(idx)) {
      return { scrollDist: 0, readFrames: 0, commentTypingFrames: 0, commentHoldFrames: 0 };
    }

    const lineContentEnd = xCodeLeft + lineNumWidth + line.trimEnd().length * charWidth;
    const idealTx    = visibleWidth - lineContentEnd;
    const targetTx   = Math.min(idealTx, -xCodeLeft);
    const scrollDist = Math.abs(-xCodeLeft - targetTx);
    const readFrames = SCAN_BASE_READ_FRAMES + Math.round(scrollDist / pixelsPerFrame);

    const commentText = narrativeMap?.get(idx);
    let commentLines: string[] = [];
    let commentLine1Frames = 0;
    let commentTypingFrames = 0;
    let commentHoldFrames = 0;

    if (commentText) {
      // Inline prefix length for splitting (mirrors getCommentLinePrefix)
      const prefixLen = (() => {
        switch (cfg.language) {
          case "python": case "ruby": case "bash": return 2; // "# "
          case "sql": return 3;                              // "-- "
          case "html": return 5;                             // "<!-- "
          case "css": return 3;                              // "/* "
          default: return 3;                                 // "// "
        }
      })();
      // Wrap at ~1.5× visible width minus left margin and prefix
      const maxChars = Math.max(15,
        Math.floor((visibleWidth * 1.5 - xCodeLeft - lineNumWidth) / charWidth) - prefixLen
      );

      if (commentText.length <= maxChars) {
        commentLines = [commentText];
      } else {
        const breakIdx = commentText.lastIndexOf(" ", maxChars);
        const splitAt  = breakIdx > 0 ? breakIdx : maxChars;
        commentLines = [
          commentText.slice(0, splitAt).trimEnd(),
          commentText.slice(splitAt).trimStart(),
        ];
      }

      commentLine1Frames = Math.ceil(commentLines[0].length / Math.max(1, cfg.typingSpeed) * FPS);
      commentTypingFrames = commentLines.reduce(
        (sum, l) => sum + Math.ceil(l.length / Math.max(1, cfg.typingSpeed) * FPS), 0
      );
      commentHoldFrames = SCAN_COMMENT_HOLD_FRAMES;
    }

    return { scrollDist, readFrames, commentLines, commentLine1Frames, commentTypingFrames, commentHoldFrames };
  });
}

export function computeDurationFrames(cfg: SnippetConfig, narrativeOpts?: NarrativeOpts): number {
  const typingCodeLength = narrativeOpts?.act1CodeLength ?? cfg.code.length;
  const typingSeconds = typingCodeLength / Math.max(1, cfg.typingSpeed);

  let scanSec = 0;
  if (cfg.scanEnabled) {
    const panTimings = computeLinePanTimings(
      cfg,
      narrativeOpts?.narrativeMap,
      narrativeOpts?.narrativeLineIndices
    );
    // Count only non-narrative lines for snap gaps
    const nonNarrativeCount = narrativeOpts
      ? panTimings.filter(t => t.readFrames > 0).length
      : panTimings.length;

    const scanFrames = SCAN_ZOOM_FRAMES * 2
      + panTimings.reduce((sum, t) => sum + t.readFrames + t.commentTypingFrames + t.commentHoldFrames, 0)
      + SCAN_SNAP_FRAMES * Math.max(0, nonNarrativeCount - 1);
    scanSec = SCAN_PRE_PAUSE_FRAMES / FPS + scanFrames / FPS;
  }

  const outroSeconds = cfg.outroEnabled && cfg.outroText.length > 0
    ? cfg.outroText.length / Math.max(1, cfg.typingSpeed)
    : 0;

  const total = cfg.startDelay + typingSeconds + scanSec + outroSeconds + cfg.holdEnd;
  return Math.max(FPS, Math.round(total * FPS));
}

/** Key video timestamps in seconds — used by export for SFX placement. */
export function computeVideoTimings(cfg: SnippetConfig, narrativeOpts?: NarrativeOpts): {
  typingStartSec: number;
  typingEndSec: number;
  zoomInStartSec: number;
  zoomOutStartSec: number;
  outroStartSec: number;
  outroEndSec: number;
} {
  const typingCodeLength = narrativeOpts?.act1CodeLength ?? cfg.code.length;
  const typingStartSec = cfg.startDelay;
  const typingEndSec   = typingStartSec + typingCodeLength / Math.max(1, cfg.typingSpeed);

  let zoomInStartSec  = Infinity;
  let zoomOutStartSec = Infinity;
  let outroStartSec   = typingEndSec;

  if (cfg.scanEnabled) {
    const panTimings = computeLinePanTimings(
      cfg,
      narrativeOpts?.narrativeMap,
      narrativeOpts?.narrativeLineIndices
    );
    const nonNarrativeCount = narrativeOpts
      ? panTimings.filter(t => t.readFrames > 0).length
      : panTimings.length;

    const panFrames = panTimings.reduce(
      (sum, t) => sum + t.readFrames + t.commentTypingFrames + t.commentHoldFrames, 0
    ) + SCAN_SNAP_FRAMES * Math.max(0, nonNarrativeCount - 1);

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
