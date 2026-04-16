import type { Theme, BackgroundStyle } from "./codesnap-types";

export interface ThemeTokens {
  bg: string;
  text: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  function: string;
  variable: string;
  punctuation: string;
  lineNumber: string;
  cursor: string;
  border: string;
}

export const THEMES: Record<Theme, ThemeTokens> = {
  "scale-dark": {
    bg: "#0d1117",
    text: "#e6edf3",
    comment: "#8b949e",
    keyword: "#ff7b72",
    string: "#a5d6ff",
    number: "#79c0ff",
    function: "#d2a8ff",
    variable: "#ffa657",
    punctuation: "#e6edf3",
    lineNumber: "#484f58",
    cursor: "#ff5722",
    border: "#21262d",
  },
  synthwave: {
    bg: "#241b2f",
    text: "#f8f8f2",
    comment: "#8b8b9b",
    keyword: "#ff7edb",
    string: "#ffe261",
    number: "#f97e72",
    function: "#36f9f6",
    variable: "#ff8b39",
    punctuation: "#f8f8f2",
    lineNumber: "#5a4d6e",
    cursor: "#ff7edb",
    border: "#3a2e4a",
  },
  "github-dark": {
    bg: "#1e1e2e",
    text: "#cdd6f4",
    comment: "#6c7086",
    keyword: "#cba6f7",
    string: "#a6e3a1",
    number: "#fab387",
    function: "#89b4fa",
    variable: "#f38ba8",
    punctuation: "#cdd6f4",
    lineNumber: "#45475a",
    cursor: "#f5c2e7",
    border: "#313244",
  },
  monokai: {
    bg: "#272822",
    text: "#f8f8f2",
    comment: "#75715e",
    keyword: "#f92672",
    string: "#e6db74",
    number: "#ae81ff",
    function: "#a6e22e",
    variable: "#fd971f",
    punctuation: "#f8f8f2",
    lineNumber: "#49483e",
    cursor: "#f8f8f2",
    border: "#3e3d32",
  },
  dracula: {
    bg: "#282a36",
    text: "#f8f8f2",
    comment: "#6272a4",
    keyword: "#ff79c6",
    string: "#f1fa8c",
    number: "#bd93f9",
    function: "#50fa7b",
    variable: "#ffb86c",
    punctuation: "#f8f8f2",
    lineNumber: "#44475a",
    cursor: "#ff79c6",
    border: "#44475a",
  },
  "paper-light": {
    bg: "#fafafa",
    text: "#0a0a0a",
    comment: "#6b7280",
    keyword: "#dc2626",
    string: "#16a34a",
    number: "#7c3aed",
    function: "#2563eb",
    variable: "#ea580c",
    punctuation: "#0a0a0a",
    lineNumber: "#9ca3af",
    cursor: "#0a0a0a",
    border: "#e5e7eb",
  },
};

export interface BackgroundDef {
  css: React.CSSProperties;
}

export const BACKGROUNDS: Record<BackgroundStyle, BackgroundDef> = {
  "ember-gradient": {
    css: {
      background:
        "radial-gradient(circle at 20% 10%, #ff5722 0%, #c2410c 35%, #1a1a1a 100%)",
    },
  },
  "voltage-gradient": {
    css: {
      background:
        "linear-gradient(135deg, #ffeb3b 0%, #ff9800 50%, #ff5722 100%)",
    },
  },
  "ink-grid": {
    css: {
      backgroundColor: "#0a0a0a",
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
      backgroundSize: "60px 60px",
    },
  },
  "paper-noise": {
    css: {
      background: "#f5f3ee",
      backgroundImage:
        "radial-gradient(rgba(0,0,0,0.08) 1px, transparent 1px)",
      backgroundSize: "8px 8px",
    },
  },
  "duotone-pop": {
    css: {
      background:
        "linear-gradient(135deg, #ff5722 0%, #ff5722 50%, #ffeb3b 50%, #ffeb3b 100%)",
    },
  },
};
