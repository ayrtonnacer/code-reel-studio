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
  | "paper-light";

export type BackgroundStyle =
  | "ember-gradient"
  | "voltage-gradient"
  | "ink-grid"
  | "paper-noise"
  | "duotone-pop";

export interface SnippetConfig {
  code: string;
  language: Language;
  filename: string;
  theme: Theme;
  background: BackgroundStyle;
  fontSize: number;
  padding: number;
  showLineNumbers: boolean;
  windowChrome: boolean;
  // animation
  typingSpeed: number; // chars per second
  startDelay: number; // seconds
  holdEnd: number; // seconds at the end
  showCursor: boolean;
  // branding
  brandHandle: string;
  brandHashtag: string;
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
  background: "ember-gradient",
  fontSize: 32,
  padding: 56,
  showLineNumbers: false,
  windowChrome: true,
  typingSpeed: 28,
  startDelay: 0.4,
  holdEnd: 1.5,
  showCursor: true,
  brandHandle: "@codesnap",
  brandHashtag: "#code",
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
