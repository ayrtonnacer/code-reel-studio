# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server on :8080
npm run build      # Production build
npm run lint       # ESLint check
npm run test       # Run tests once
npm run test:watch # Watch mode
```

## What This App Does

CodeSnap Video converts code snippets into vertical 9:16 videos (1080×1920px, 30 FPS) for social media (TikTok, Reels, Shorts). Everything runs client-side — no backend.

## Architecture

**Single-page app.** `Index.tsx` owns the entire `SnippetConfig` state and passes it down. Left column: code input + config tabs. Right column: sticky live preview + export.

**Core data type:** `SnippetConfig` in `src/lib/codesnap-types.ts` — the single source of truth for code, visual style, animation settings, branding, and audio.

**Video rendering pipeline:**

1. `CodeComposition.tsx` — Remotion composition. Uses `useCurrentFrame()` to calculate how many characters to reveal at the current frame, producing a typing animation. Tokenizes code for syntax highlighting and renders inline-styled spans.
2. `PreviewPlayer.tsx` — wraps Remotion's `<Player>` for live preview with play/pause/fullscreen controls.
3. `ExportDialog.tsx` + `useVideoExport` hook (`src/lib/codesnap-export.ts`) — renders every frame as PNG via `html-to-image`, then encodes the PNG sequence to MP4 (H.264 via libx264) using FFmpeg.wasm. Optionally mixes in audio with fade-out.

**FFmpeg.wasm** loads ~30MB on first export (cached by the browser). All encoding is client-side.

**Custom tokenizer** in `src/lib/codesnap-tokenize.ts` — lightweight lexer supporting 17 languages; returns `Token[]` with type classifications used by `CodeComposition` for coloring.

**Themes & backgrounds** in `src/lib/codesnap-themes.ts` and `codesnap-types.ts` — 6 code color themes, 5 preset gradients + custom gradient support.

## Key Files

| File | Role |
|------|------|
| `src/lib/codesnap-types.ts` | `SnippetConfig` type, `DEFAULT_CONFIG`, FPS/dimension constants |
| `src/lib/codesnap-export.ts` | `useVideoExport` hook — FFmpeg encoding logic |
| `src/lib/codesnap-tokenize.ts` | Custom syntax tokenizer |
| `src/lib/codesnap-themes.ts` | Theme color maps |
| `src/components/codesnap/CodeComposition.tsx` | Remotion composition (frame renderer) |
| `src/components/codesnap/ConfigPanel.tsx` | 4-tab config editor (Style / Background / Text / Anim·Audio) |
| `src/components/codesnap/ExportDialog.tsx` | Export modal with progress |
| `src/pages/Index.tsx` | Root page — owns all state |

## Video Duration Formula

```
totalFrames = (startDelay + (code.length / typingSpeed) + holdEnd) * FPS
```

`FPS = 30`, dimensions `1080×1920`. These constants live in `codesnap-types.ts`.

## UI Stack

Tailwind CSS + Radix UI primitives wrapped as shadcn/ui components (`src/components/ui/`). Custom design tokens: `ink`, `paper`, `ember`, `voltage` color variables defined in `tailwind.config.ts`. Fonts: Archivo Black (headings), Inter (UI), JetBrains Mono (code).
