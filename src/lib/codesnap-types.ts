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
  brandHashtag: string;
  bottomText: string;
  showBottomText: boolean;
  // audio
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
  theme: "vercel-dark",
  background: "vercel-grain",
  customGradient: {
    from: "#ff5722",
    to: "#1a1a1a",
    direction: "135deg",
  },
  fontSize: 32,
  padding: 56,
  showLineNumbers: false,
  windowChrome: true,
  typingSpeed: 28,
  startDelay: 0.4,
  holdEnd: 1.5,
  showCursor: true,
  title: "Quicksort in 7 lines",
  showTitle: false,
  brandHandle: "@codesnap",
  brandHashtag: "#code",
  bottomText: "CODE · IN · MOTION",
  showBottomText: true,
  audioDataUrl: null,
  audioName: null,
  audioVolume: 0.8,
  audioFadeOut: 1.5,
};
export const FPS = 30;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export function computeDurationFrames(cfg: SnippetConfig): number {
  const chars = cfg.code.length;
  const typingSeconds = chars / Math.max(1, cfg.typingSpeed);
  const total = cfg.startDelay + typingSeconds + cfg.holdEnd;
  return Math.max(FPS, Math.round(total * FPS));
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
