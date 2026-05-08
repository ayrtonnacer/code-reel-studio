import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing, spring, Audio, Sequence } from "remotion";
import type { SnippetConfig } from "@/lib/codesnap-types";
import {
  buildBackgroundCss,
  computeLinePanTimings,
  computeVideoTimings,
  splitNoWidow,
  SCAN_ZOOM_FRAMES,
  SCAN_SNAP_FRAMES,
  SCAN_BASE_READ_FRAMES,
  SCAN_PRE_PAUSE_FRAMES,
} from "@/lib/codesnap-types";
import { THEMES, BACKGROUNDS } from "@/lib/codesnap-themes";
import { tokenize } from "@/lib/codesnap-tokenize";
import { getMusicPreset, SFX_TYPE_CLICK, SFX_ZOOM_IN, SFX_ZOOM_OUT, SFX_START_CLICK, type MusicPresetKey } from "@/lib/codesnap-sfx";
import { parseNarrative, autoWrapCode, getCommentLinePrefix } from "@/lib/codesnap-narrative";

// ── Multi-line subtitle word-wrap ────────────────────────────────────────────
// Iteratively splits text at word boundaries so every line fits within maxChars,
// then applies an anti-widow pass (last line must have ≥ 2 words).
function wrapTextToLines(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];

  const lines: string[] = [];
  let rem = trimmed;
  while (rem.length > maxChars) {
    let cut = rem.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars; // no space — hard-break to avoid infinite loop
    lines.push(rem.slice(0, cut).trimEnd());
    rem = rem.slice(cut).trimStart();
  }
  if (rem) lines.push(rem);

  // Anti-widow: last line must have ≥ 2 words
  if (lines.length >= 2) {
    const lastWords = lines[lines.length - 1].split(/\s+/).filter(Boolean);
    if (lastWords.length === 1) {
      const prev = lines[lines.length - 2];
      const sp = prev.lastIndexOf(" ");
      if (sp > 12) {
        lines[lines.length - 2] = prev.slice(0, sp).trimEnd();
        lines[lines.length - 1] = prev.slice(sp + 1) + " " + lines[lines.length - 1];
      }
    }
  }
  return lines;
}


interface Props {
  config: SnippetConfig;
}

export const CodeComposition: React.FC<Props> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const theme = THEMES[config.theme];
  const bg =
    config.background === "custom-gradient"
      ? { css: buildBackgroundCss(config.customGradient) }
      : BACKGROUNDS[config.background];

  const isY2K = config.theme === 'chrome-y2k';
  const isLightBg = config.background === 'chrome-flat' || config.background === 'paper-noise'
    || config.background === 'custom-gradient' || !!config.backgroundImageDataUrl;
  const isHighlightStatic = config.scanMode !== "zoom-pan";

  // ── Narrative parsing ────────────────────────────────────────────────────
  const narrativeInfo = useMemo(
    () => parseNarrative(config.code, config.language),
    [config.code, config.language]
  );

  // All full-code lines (used for Act 2 rendering and lineMetrics)
  const codeLines = useMemo(
    () => config.code.split("\n").map(l => l.replace(/\r$/, "").trimEnd()),
    [config.code]
  );

  // Non-narrative lines only — what gets rendered in flow during Act 2
  const nonNarrativeCodeLines = useMemo(
    () => codeLines
      .map((text, fullIdx) => ({ text, fullIdx }))
      .filter(({ fullIdx }) => !narrativeInfo.narrativeLineIndices.has(fullIdx)),
    [codeLines, narrativeInfo]
  );

  // ── Pan timings — computed early so cardH can account for comment lines ──
  const panTimings = useMemo(
    () => computeLinePanTimings(
      config,
      narrativeInfo.narrativeMap,
      narrativeInfo.narrativeLineIndices,
      narrativeInfo.introLineIndices
    ),
    [config, narrativeInfo]
  );

  // Count extra lines visible in Act 2 that aren't in Act 1
  const totalNarrCommentLinesForCard = config.commentStyle === "inline"
    ? nonNarrativeCodeLines.reduce((sum, { fullIdx }) =>
        sum + (panTimings[fullIdx]?.commentLines?.length ?? 0), 0)
    : 0;
  const totalWrappedIntroLinesForCard = nonNarrativeCodeLines.reduce((sum, { fullIdx }) => {
    const intro = panTimings[fullIdx]?.introWrappedLines;
    return sum + (intro && intro.length > 1 ? intro.length - 1 : 0);
  }, 0);
  const outroLineForCard = config.outroEnabled && config.outroText.length > 0 ? 1 : 0;
  const act2TotalLinesForCard = nonNarrativeCodeLines.length
    + totalNarrCommentLinesForCard + totalWrappedIntroLinesForCard + outroLineForCard;

  // ── Act 1: typed code = act1Code with long lines auto-wrapped ───────────
  const lineHeight = config.fontSize * 1.45;
  const chromeH    = config.windowChrome ? 46 : 0;
  // Card sized for all Act 2 content. In highlight-static mode the card
  // shows everything at once; a CSS scale keeps it within the frame.
  const naturalCardH = act2TotalLinesForCard * lineHeight + config.padding * 2 + chromeH;
  const maxCardDisplayH = height - 260;
  const codeCardScale = isHighlightStatic && naturalCardH > maxCardDisplayH
    ? maxCardDisplayH / naturalCardH
    : 1;
  const cardH = isHighlightStatic ? naturalCardH : Math.min(naturalCardH, height - 420);
  const cardTop    = (height - cardH) / 2;
  const codeAreaTop = cardTop + chromeH + config.padding;

  const charWidth    = config.fontSize * 0.6;
  const lineNumWidth = config.showLineNumbers
    ? (String(codeLines.length).length + 1) * charWidth + 24
    : 0;

  const maxCharsPerLine = useMemo(() => {
    const codeCardWidth = width - config.padding * 2;
    const codeAreaWidth = codeCardWidth - config.padding * 2;
    return Math.max(20, Math.floor((codeAreaWidth - lineNumWidth) / charWidth));
  }, [config.fontSize, config.padding, config.showLineNumbers, width, charWidth, lineNumWidth]);

  const wrappedAct1Code = useMemo(
    () => autoWrapCode(narrativeInfo.act1Code, maxCharsPerLine, config.language),
    [narrativeInfo.act1Code, maxCharsPerLine, config.language]
  );

  // ── Tokenization ─────────────────────────────────────────────────────────
  const act1Tokens = useMemo(
    () => tokenize(wrappedAct1Code, config.language),
    [wrappedAct1Code, config.language]
  );

  // Full-code tokens split by line (for Act 2 code rendering)
  const fullTokens = useMemo(
    () => tokenize(config.code, config.language),
    [config.code, config.language]
  );
  const fullLineTokens = useMemo(() => {
    const result: { text: string; type: string }[][] = [];
    let buffer: { text: string; type: string }[] = [];
    for (const t of fullTokens) {
      const parts = t.text.split("\n");
      parts.forEach((part, idx) => {
        if (part) buffer.push({ text: part, type: t.type });
        if (idx < parts.length - 1) { result.push(buffer); buffer = []; }
      });
    }
    result.push(buffer);
    return result;
  }, [fullTokens]);

  // ── Act 1 typing ─────────────────────────────────────────────────────────
  const act1TotalChars = wrappedAct1Code.length;
  const elapsedSec = frame / fps - config.startDelay;
  const charsTyped = Math.max(0, Math.min(act1TotalChars, Math.floor(elapsedSec * config.typingSpeed)));
  const isTypingCode = charsTyped < act1TotalChars;

  let remaining = charsTyped;
  const visibleTokens: { text: string; type: string }[] = [];
  for (const t of act1Tokens) {
    if (remaining <= 0) break;
    if (t.text.length <= remaining) {
      visibleTokens.push(t);
      remaining -= t.text.length;
    } else {
      visibleTokens.push({ text: t.text.slice(0, remaining), type: t.type });
      remaining = 0;
      break;
    }
  }

  type LineToken = { text: string; type: string };
  const renderedLines: LineToken[][] = [];
  let buf: LineToken[] = [];
  for (const t of visibleTokens) {
    const parts = t.text.split("\n");
    parts.forEach((part, idx) => {
      if (part) buf.push({ text: part, type: t.type });
      if (idx < parts.length - 1) { renderedLines.push(buf); buf = []; }
    });
  }
  renderedLines.push(buf);

  // ── Outro typing ─────────────────────────────────────────────────────────
  const outroPrefix = config.outroEnabled && config.outroText ? getCommentLinePrefix(config.language) : "";
  const outroFull   = config.outroEnabled && config.outroText ? outroPrefix + config.outroText : "";

  const timings = useMemo(
    () => computeVideoTimings(config, {
      act1CodeLength: act1TotalChars,
      narrativeMap: narrativeInfo.narrativeMap,
      narrativeLineIndices: narrativeInfo.narrativeLineIndices,
      introLineIndices: narrativeInfo.introLineIndices,
    }),
    [config, act1TotalChars, narrativeInfo]
  );

  const outroStartFrame = config.outroEnabled && outroFull.length > 0
    ? Math.round(timings.outroStartSec * fps)
    : Infinity;
  const outroElapsed = frame >= outroStartFrame
    ? (frame - outroStartFrame) / fps * config.typingSpeed
    : 0;
  const outroCharsTyped = Math.min(Math.floor(outroElapsed), outroFull.length);
  const outroVisible    = outroFull.slice(0, outroCharsTyped);
  const isTypingOutro   = outroFull.length > 0 && outroCharsTyped < outroFull.length && frame >= outroStartFrame;

  const cursorVisible = Math.floor(frame / (fps * 0.5)) % 2 === 0;

  // ── Intro animation — card fades in after startDelay so background image
  //    is visible alone first ───────────────────────────────────────────────
  const introDelay   = Math.round(config.startDelay * fps);
  const introOpacity = interpolate(frame, [introDelay, introDelay + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const introScale   = interpolate(frame, [introDelay, introDelay + 22], [0.96, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Colors ────────────────────────────────────────────────────────────────
  const colorFor = (type: string): string => {
    switch (type) {
      case "comment":     return theme.comment;
      case "keyword":     return theme.keyword;
      case "string":      return theme.string;
      case "number":      return theme.number;
      case "function":    return theme.function;
      case "variable":    return theme.variable;
      case "punctuation": return theme.punctuation;
      default:            return theme.text;
    }
  };

  // ── Scan timing constants ─────────────────────────────────────────────────
  const SCAN_ZOOM = config.scanZoom;
  const zoomFrames = isHighlightStatic ? 0 : SCAN_ZOOM_FRAMES;
  const xCodeLeft = config.padding * 2;
  const Tx_left   = -xCodeLeft;

  const maxVisibleLines = Math.floor((cardH - chromeH - config.padding * 2) / lineHeight);

  const typingEndFrame = Math.round(
    (config.startDelay + act1TotalChars / Math.max(1, config.typingSpeed)) * fps
  );
  const scanStartFrame = config.scanEnabled
    ? typingEndFrame + SCAN_PRE_PAUSE_FRAMES
    : Infinity;
  const zoomInEndFrame = scanStartFrame + zoomFrames;
  const panStartFrame  = zoomInEndFrame;

  // The X position where the camera lands after zoom-in and from which every
  // line's rightward pan starts. Exactly at the code's left edge so the
  // beginning of every line is always visible on entry.
  const panStartX = Tx_left;

  const isAct1 = frame < scanStartFrame;

  // ── lineMetrics — only for non-narrative lines (the scan pan stops) ───────
  const lineMetrics = useMemo(() => {
    const visibleWidth = width / SCAN_ZOOM;
    return nonNarrativeCodeLines.map(({ text, fullIdx }, visualIdx) => {
      // For intro comment lines, use the longest wrapped line length for camera positioning
      const introWrapped = panTimings[fullIdx]?.introWrappedLines;
      const effectiveText = introWrapped && introWrapped.length > 0
        ? introWrapped.reduce((a, b) => a.trimEnd().length >= b.trimEnd().length ? a : b)
        : text;
      const lineContentEnd = xCodeLeft + lineNumWidth + effectiveText.trimEnd().length * charWidth;
      const idealTx  = visibleWidth - lineContentEnd;
      const targetTx = Math.min(idealTx, Tx_left);
      const scrollDist = Math.abs(Tx_left - targetTx);

      // Use split comment lines from panTimings for camera positioning
      const commentLines = panTimings[fullIdx]?.commentLines ?? [];
      let commentTargetTx = targetTx;
      if (commentLines.length > 0) {
        const commentPrefix = getCommentLinePrefix(config.language);
        const longestLine   = commentLines.reduce((a, b) => a.length >= b.length ? a : b, "");
        const commentLen    = commentPrefix.length + longestLine.length;
        const commentContentEnd = xCodeLeft + lineNumWidth + commentLen * charWidth;
        const idealCommentTx = visibleWidth - commentContentEnd;
        commentTargetTx = Math.min(idealCommentTx, Tx_left);
      }

      const scroll = Math.max(0, visualIdx - maxVisibleLines + 3) * lineHeight;
      const absY   = codeAreaTop + visualIdx * lineHeight - scroll;
      const Ty     = height / 2 - absY;

      return { fullIdx, targetTx, commentTargetTx, scrollDist, Ty, scroll: -scroll, commentLines };
    });
  }, [nonNarrativeCodeLines, SCAN_ZOOM, width, charWidth, lineNumWidth, xCodeLeft, Tx_left, maxVisibleLines, lineHeight, codeAreaTop, height, panTimings, config.language]);

  // ── lineSchedules — one entry per non-narrative line ─────────────────────
  const { lineSchedules, dynamicScanFrames } = useMemo(() => {
    let cursor = 0;
    const schedules = lineMetrics.map((m, schedIdx) => {
      const timing = panTimings[m.fullIdx] ?? { readFrames: SCAN_BASE_READ_FRAMES, commentLine1Frames: 0, commentTypingFrames: 0, commentHoldFrames: 0 };
      const start             = cursor;
      const arriveEnd         = start + timing.readFrames;
      // commentLine2Start = when line 1 typing ends (= commentEnd for single-line comments)
      const commentLine2Start = arriveEnd + (timing.commentLine1Frames ?? timing.commentTypingFrames);
      const commentEnd        = arriveEnd + timing.commentTypingFrames;
      const holdEnd           = commentEnd + timing.commentHoldFrames;
      const isLast            = schedIdx === lineMetrics.length - 1;
      const snapEnd           = isLast ? holdEnd : holdEnd + SCAN_SNAP_FRAMES;
      cursor = snapEnd;
      return { fullIdx: m.fullIdx, start, arriveEnd, commentLine2Start, commentEnd, holdEnd, snapEnd };
    });
    return { lineSchedules: schedules, dynamicScanFrames: cursor };
  }, [lineMetrics, panTimings]);

  // Quick lookup: fullIdx → schedule
  const schedByFullIdx = useMemo(
    () => new Map(lineSchedules.map(s => [s.fullIdx, s])),
    [lineSchedules]
  );

  const panEndFrame       = panStartFrame + dynamicScanFrames;
  const zoomOutStartFrame = panEndFrame;
  const zoomOutEndFrame   = zoomOutStartFrame + zoomFrames;

  // ── Scene transform ───────────────────────────────────────────────────────
  const clamp     = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const easeOut   = { ...clamp, easing: Easing.out(Easing.cubic) };
  const easeInOut = { ...clamp, easing: Easing.inOut(Easing.cubic) };

  let sceneZoom        = 1;
  let sceneTranslateX  = 0;
  let sceneTranslateY  = 0;

  // Act 1 auto-scroll
  const extraOutroLine = outroVisible.length > 0 ? 1 : 0;
  const act1ScrollLines = Math.max(0, renderedLines.length + extraOutroLine - maxVisibleLines + 2);
  const act1ScrollY = -act1ScrollLines * lineHeight;

  // Act 2 scroll (post zoom-out) — account for extra lines from narrative comments and wrapped intro comments
  const totalNarrativeCommentLines = config.commentStyle === "inline"
    ? lineMetrics.reduce((sum, m) => sum + m.commentLines.length, 0)
    : 0;
  const totalWrappedIntroExtraLines = nonNarrativeCodeLines.reduce((sum, { fullIdx }) => {
    const intro = panTimings[fullIdx]?.introWrappedLines;
    return sum + (intro && intro.length > 1 ? intro.length - 1 : 0);
  }, 0);
  const act2TotalLines = nonNarrativeCodeLines.length + extraOutroLine + totalNarrativeCommentLines + totalWrappedIntroExtraLines;
  const act2ScrollLines = Math.max(0, act2TotalLines - maxVisibleLines + 2);
  const act2ScrollY = -act2ScrollLines * lineHeight;

  let effectiveScrollY = act1ScrollY;

  if (isHighlightStatic) {
    // Static mode: camera never moves; everything stays at zoom 1
    sceneZoom = 1;
    sceneTranslateX = 0;
    sceneTranslateY = 0;
    effectiveScrollY = frame < scanStartFrame ? act1ScrollY : 0;
  } else {
    // Zoom-pan mode
    if (frame < scanStartFrame) {
      effectiveScrollY = act1ScrollY;

    } else if (frame <= zoomInEndFrame) {
      const m0 = lineMetrics[0] ?? { Ty: 0, scroll: 0 };
      sceneZoom        = interpolate(frame, [scanStartFrame, zoomInEndFrame], [1, SCAN_ZOOM], easeOut);
      sceneTranslateY  = interpolate(frame, [scanStartFrame, zoomInEndFrame], [0, m0.Ty], easeOut);
      sceneTranslateX  = interpolate(frame, [scanStartFrame, zoomInEndFrame], [0, panStartX], easeOut);
      effectiveScrollY = 0;

    } else if (frame < panEndFrame) {
      sceneZoom = SCAN_ZOOM;
      const scanFrame = frame - panStartFrame;
      const schedIdx  = lineSchedules.findIndex(s => scanFrame < s.snapEnd);
      const ci        = schedIdx === -1 ? lineSchedules.length - 1 : schedIdx;
      const sched     = lineSchedules[ci];
      const curr      = lineMetrics[ci];

      if (!sched || !curr) {
        effectiveScrollY = 0;
      } else {
        const inLineFrame = scanFrame - sched.start;

        if (scanFrame < sched.arriveEnd) {
          effectiveScrollY = curr.scroll;
          sceneTranslateY  = curr.Ty;
          sceneTranslateX  = interpolate(
            inLineFrame, [0, Math.max(1, sched.arriveEnd - sched.start)],
            [panStartX, curr.targetTx], easeOut
          );
        } else if (scanFrame < sched.commentLine2Start) {
          effectiveScrollY = curr.scroll;
          sceneTranslateY  = curr.Ty;
          const commentFrame  = scanFrame - sched.arriveEnd;
          const line1Duration = Math.max(1, sched.commentLine2Start - sched.arriveEnd);
          const snapBackFrames = curr.targetTx === panStartX ? 0 : Math.min(4, Math.floor(line1Duration / 3));
          if (snapBackFrames > 0 && commentFrame < snapBackFrames) {
            sceneTranslateX = interpolate(commentFrame, [0, snapBackFrames], [curr.targetTx, panStartX], easeOut);
          } else {
            const f = Math.max(0, commentFrame - snapBackFrames);
            const d = Math.max(1, line1Duration - snapBackFrames);
            sceneTranslateX = interpolate(f, [0, d], [panStartX, curr.commentTargetTx], clamp);
          }
        } else if (scanFrame < sched.commentEnd) {
          effectiveScrollY = curr.scroll;
          sceneTranslateY  = curr.Ty;
          sceneTranslateX  = curr.commentTargetTx;
        } else if (scanFrame < sched.holdEnd) {
          effectiveScrollY = curr.scroll;
          sceneTranslateY  = curr.Ty;
          sceneTranslateX  = curr.commentTargetTx;
        } else {
          const next      = lineMetrics[ci + 1] ?? curr;
          const snapFrame = scanFrame - sched.holdEnd;
          const snapProg  = spring({
            fps,
            frame: snapFrame,
            config: { damping: 40, stiffness: 200 },
            durationInFrames: SCAN_SNAP_FRAMES,
          });
          effectiveScrollY = curr.scroll           + (next.scroll   - curr.scroll)   * snapProg;
          sceneTranslateY  = curr.Ty               + (next.Ty       - curr.Ty)       * snapProg;
          sceneTranslateX  = curr.commentTargetTx  + (panStartX     - curr.commentTargetTx) * snapProg;
        }
      }

    } else if (frame <= zoomOutEndFrame) {
      const last = lineMetrics[lineMetrics.length - 1] ?? { Ty: 0, targetTx: 0, scroll: 0 };
      sceneZoom        = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [SCAN_ZOOM, 1], easeInOut);
      sceneTranslateY  = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [last.Ty, 0], easeInOut);
      sceneTranslateX  = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [last.targetTx, 0], easeInOut);
      effectiveScrollY = 0;

    } else {
      sceneZoom        = 1;
      sceneTranslateX  = 0;
      sceneTranslateY  = 0;
      effectiveScrollY = act2ScrollY;
    }
  }

  // ── Highlight line (visual index into nonNarrativeCodeLines) ─────────────
  let highlightSchedIdx = -1;
  if (frame >= panStartFrame && frame < panEndFrame) {
    const scanF = frame - panStartFrame;
    const si    = lineSchedules.findIndex(s => scanF < s.snapEnd);
    if (si !== -1 && scanF < lineSchedules[si].holdEnd) {
      highlightSchedIdx = si;
    }
  }

  // Fade fraction for the highlight-static left-border accent (0..1)
  let highlightFraction = 0;
  if (isHighlightStatic && highlightSchedIdx !== -1) {
    const sched = lineSchedules[highlightSchedIdx];
    const scanF = frame - panStartFrame;
    if (scanF < sched.holdEnd) {
      highlightFraction = Math.min(1, (scanF - sched.start) / 8);
    } else {
      highlightFraction = Math.max(0, 1 - (scanF - sched.holdEnd) / Math.max(1, SCAN_SNAP_FRAMES));
    }
  }

  // ── Narrative comment typing (inline mode) ────────────────────────────────
  const getNarrativeChars = (codeLineFullIdx: number, metricLines: string[]): {
    line1Chars: number; line2Chars: number;
    typingLine1: boolean; typingLine2: boolean;
    totalChars: number; isTyping: boolean;
  } => {
    const none = { line1Chars: 0, line2Chars: 0, typingLine1: false, typingLine2: false, totalChars: 0, isTyping: false };
    if (!config.scanEnabled || frame < panStartFrame) return none;
    // After scan ends, comments remain fully visible
    if (frame >= panEndFrame) {
      const line1Text = metricLines[0] ?? "";
      const line2Text = metricLines[1] ?? "";
      return { line1Chars: line1Text.length, line2Chars: line2Text.length, typingLine1: false, typingLine2: false, totalChars: line1Text.length + line2Text.length, isTyping: false };
    }
    const sched = schedByFullIdx.get(codeLineFullIdx);
    if (!sched || metricLines.length === 0) return none;
    const scanFrame = frame - panStartFrame;
    if (scanFrame < sched.arriveEnd) return none;

    const line1Text = metricLines[0] ?? "";
    const line2Text = metricLines[1] ?? "";

    if (scanFrame < sched.commentLine2Start) {
      const commentScanFrame = scanFrame - sched.arriveEnd;
      const line1Chars = Math.min(line1Text.length, Math.floor(commentScanFrame / fps * config.typingSpeed));
      return { line1Chars, line2Chars: 0, typingLine1: line1Chars < line1Text.length, typingLine2: false, totalChars: line1Chars, isTyping: line1Chars < line1Text.length };
    } else if (scanFrame < sched.commentEnd) {
      const line2ScanFrame = scanFrame - sched.commentLine2Start;
      const line2Chars = Math.min(line2Text.length, Math.floor(line2ScanFrame / fps * config.typingSpeed));
      return { line1Chars: line1Text.length, line2Chars, typingLine1: false, typingLine2: line2Chars < line2Text.length, totalChars: line1Text.length + line2Chars, isTyping: line2Chars < line2Text.length };
    } else {
      return { line1Chars: line1Text.length, line2Chars: line2Text.length, typingLine1: false, typingLine2: false, totalChars: line1Text.length + line2Text.length, isTyping: false };
    }
  };

  // Subtitle text (when commentStyle === "subtitle")
  let subtitleText = "";
  let isTypingSubtitle = false;
  if (config.scanEnabled && config.commentStyle === "subtitle" && frame >= panStartFrame && frame < panEndFrame) {
    const scanFrame = frame - panStartFrame;
    const si = lineSchedules.findIndex(s => scanFrame < s.snapEnd);
    if (si !== -1) {
      const sched = lineSchedules[si];
      if (scanFrame >= sched.arriveEnd && scanFrame < sched.holdEnd) {
        const commentText = narrativeInfo.narrativeMap.get(sched.fullIdx) ?? "";
        const metricLines = lineMetrics[si]?.commentLines ?? [];
        if (commentText && metricLines.length > 0) {
          const { totalChars, isTyping } = getNarrativeChars(sched.fullIdx, metricLines);
          subtitleText = commentText.slice(0, totalChars);
          isTypingSubtitle = isTyping;
        }
      }
    }
  }

  // Is a narrative comment actively being typed? (for SFX)
  const isTypingNarrativeComment = (() => {
    if (!config.scanEnabled || frame < panStartFrame || frame >= panEndFrame) return false;
    const scanFrame = frame - panStartFrame;
    const si = lineSchedules.findIndex(s => scanFrame < s.snapEnd);
    if (si === -1) return false;
    const sched = lineSchedules[si];
    return scanFrame >= sched.arriveEnd && scanFrame < sched.commentEnd;
  })();

  // ── Title opacity ─────────────────────────────────────────────────────────
  const titleOpacity =
    config.showTitle && config.title.trim()
      ? interpolate(frame, [Math.round(fps * 1.5), Math.round(fps * 2.5)], [1, 0], clamp)
      : 0;

  const fontScale = "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif";
  const startTypingFrame = Math.round(config.startDelay * fps);

  // ── Background music ──────────────────────────────────────────────────────
  const bgMusicUrl = useMemo(
    () => config.bgMusicDataUrl
      ?? (config.bgMusicPreset ? getMusicPreset(config.bgMusicPreset as MusicPresetKey) : null),
    [config.bgMusicDataUrl, config.bgMusicPreset]
  );

  // ── Cursor element ─────────────────────────────────────────────────────────
  const cursor = (
    <span style={{
      display: "inline-block",
      width: 2,
      height: config.fontSize * 1.1,
      background: theme.cursor,
      verticalAlign: "middle",
      marginLeft: 1,
      opacity: cursorVisible ? 1 : 0,
    }} />
  );

  const commentPrefix = getCommentLinePrefix(config.language);

  const hexToRgba = (hex: string, opacity: number): string => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  };

  return (
    <AbsoluteFill style={config.backgroundImageDataUrl ? undefined : bg.css}>
      {/* Background image */}
      {config.backgroundImageDataUrl && (
        <>
          <AbsoluteFill style={{
            backgroundImage: `url(${config.backgroundImageDataUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }} />
          {config.backgroundImageOverlay > 0 && (
            <AbsoluteFill style={{
              backgroundColor: `rgba(0,0,0,${config.backgroundImageOverlay})`,
            }} />
          )}
        </>
      )}

      {/* Voiceover */}
      {config.audioDataUrl && (
        <Audio
          src={config.audioDataUrl}
          volume={(f) => {
            if (config.audioFadeOut <= 0) return config.audioVolume;
            const fadeFrames = Math.max(1, Math.round(config.audioFadeOut * fps));
            const fadeStart  = durationInFrames - fadeFrames;
            const fade = f >= fadeStart
              ? interpolate(f, [fadeStart, durationInFrames], [1, 0], clamp)
              : 1;
            return config.audioVolume * fade;
          }}
        />
      )}

      {/* Background music */}
      {bgMusicUrl && (
        <Audio
          src={bgMusicUrl}
          loop
          volume={(f) => {
            if (config.bgMusicFadeOut <= 0) return config.bgMusicVolume;
            const fadeFrames = Math.max(1, Math.round(config.bgMusicFadeOut * fps));
            const fadeStart  = durationInFrames - fadeFrames;
            const fade = f >= fadeStart
              ? interpolate(f, [fadeStart, durationInFrames], [1, 0], clamp)
              : 1;
            return config.bgMusicVolume * fade;
          }}
        />
      )}

      {/* Sound effects */}
      {config.sfxEnabled && (
        <>
          <Sequence from={0}>
            <Audio src={SFX_START_CLICK} volume={config.sfxVolume * 0.75} />
          </Sequence>

          {/* Typing click — Act 1 code typing */}
          {frame >= startTypingFrame && isTypingCode && (
            <Audio
              src={SFX_TYPE_CLICK}
              volume={config.sfxVolume * 0.55}
              loop
            />
          )}

          {/* Typing click — narrative comment typing in Act 2 */}
          {isTypingNarrativeComment && (
            <Audio
              src={SFX_TYPE_CLICK}
              volume={config.sfxVolume * 0.50}
              loop
            />
          )}

          {/* Zoom-in/out — only in zoom-pan mode */}
          {config.scanEnabled && !isHighlightStatic && (
            <>
              <Sequence from={scanStartFrame}>
                <Audio src={SFX_ZOOM_IN} volume={config.sfxVolume * 0.75} />
              </Sequence>
              <Sequence from={zoomOutStartFrame}>
                <Audio src={SFX_ZOOM_OUT} volume={config.sfxVolume * 0.75} />
              </Sequence>
            </>
          )}

          {/* Typing click — outro */}
          {isTypingOutro && (
            <Audio
              src={SFX_TYPE_CLICK}
              volume={config.sfxVolume * 0.55}
              loop
            />
          )}
        </>
      )}

      {/* Zoom wrapper */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${sceneZoom}) translateX(${sceneTranslateX}px) translateY(${sceneTranslateY}px)`,
          transformOrigin: "0% 50%",
        }}
      >
        {/* Brand watermark */}
        <div style={{
          position: "absolute",
          top: 60,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 20,
        }}>
          <div style={{
            fontFamily: fontScale,
            color: isLightBg ? "rgba(0, 0, 0, 0.28)" : "rgba(255, 255, 255, 0.4)",
            fontSize: 24,
            letterSpacing: "0.02em",
            fontWeight: 500,
          }}>
            {config.brandHandle}
          </div>
        </div>

        {/* Title — fades out at 1.5s */}
        {config.showTitle && config.title.trim() && (
          <div style={{
            position: "absolute",
            top: 200,
            left: 80,
            right: 80,
            zIndex: 15,
            fontFamily: fontScale,
            fontSize: config.titleFontSize ?? 58,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            fontWeight: 700,
            textAlign: "center",
            opacity: titleOpacity,
          }}>
            {config.titleBgEnabled ? (
              <span style={{
                display: "inline",
                color: config.titleColor,
                backgroundColor: hexToRgba(config.titleBgColor, config.titleBgOpacity),
                padding: "6px 16px",
                borderRadius: 10,
              }}>
                {config.title.charAt(0).toUpperCase() + config.title.slice(1)}
              </span>
            ) : (
              <span style={{ color: config.titleColor }}>
                {config.title.charAt(0).toUpperCase() + config.title.slice(1)}
              </span>
            )}
          </div>
        )}

        {/* Code card — when subtitles are on, live in the top 2/3 so the
            bottom third is reserved for the TikTok-style caption band. */}
        <div style={{
          position: "absolute",
          top: config.subtitlesEnabled ? "33.33%" : "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${introScale * codeCardScale})`,
          opacity: introOpacity,
          width: width - config.padding * 2,
          ...(() => {
            const subtitleCap = config.subtitlesEnabled ? Math.round(height * (2 / 3)) - 80 : Infinity;
            const scanCap = isHighlightStatic ? Infinity : height - 420;
            const cap = Math.min(subtitleCap, scanCap);
            return Number.isFinite(cap) ? { maxHeight: cap } : {};
          })(),
          background: theme.bg,
          border: isY2K ? `2px solid #000` : `1px solid ${theme.border}`,
          boxShadow: isY2K ? "8px 8px 0 rgba(0,0,0,0.18)" : "0 24px 64px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRadius: isY2K ? 0 : 4,
        }}>
          {/* Window chrome */}
          {config.windowChrome && (isY2K ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              borderBottom: `2px solid #000`,
              background: "linear-gradient(180deg, #4488ff 0%, #1155dd 50%, #0044bb 100%)",
              height: 46,
            }}>
              <div style={{
                flex: 1,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#ffffff',
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                textShadow: '1px 1px 2px rgba(0,0,50,0.6)',
              }}>
                {config.filename}
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {[{ label: '—' }, { label: '□' }, { label: '✕' }].map((btn, i) => (
                  <div key={i} style={{
                    width: 26, height: 22,
                    backgroundColor: '#c0c0c0',
                    border: '2px solid',
                    borderColor: '#ffffff #606060 #606060 #ffffff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontFamily: 'Arial, Helvetica, sans-serif', color: '#000',
                    lineHeight: 1, userSelect: 'none' as const,
                  }}>
                    {btn.label}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 20px",
              borderBottom: `1px solid ${theme.border}`,
              background: "rgba(0, 0, 0, 0.12)",
            }}>
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#ff5f56" }} />
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#ffbd2e" }} />
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#27c93f" }} />
              <div style={{
                marginLeft: 16,
                fontFamily: "'JetBrains Mono', monospace",
                color: theme.lineNumber,
                fontSize: 18,
                fontWeight: 400,
              }}>
                {config.filename}
              </div>
            </div>
          ))}

          {/* Code area */}
          <div style={{
            flex: 1,
            padding: config.padding,
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Scrolling content */}
            <div style={{
              transform: `translateY(${effectiveScrollY}px)`,
              transition: "none",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: config.fontSize,
              lineHeight: `${lineHeight}px`,
              color: theme.text,
              whiteSpace: "pre",
              position: "relative",
            }}>
              {/* ── ACT 1: typing animation using wrappedAct1Code ── */}
              {isAct1 && renderedLines.map((lineTokens, lineIdx) => (
                <div key={lineIdx} style={{ display: "flex", minHeight: lineHeight }}>
                  {config.showLineNumbers && (
                    <span style={{
                      color: theme.lineNumber,
                      width: `${String(codeLines.length).length + 1}ch`,
                      textAlign: "right",
                      paddingRight: 24,
                      userSelect: "none",
                      flexShrink: 0,
                    }}>
                      {lineIdx + 1}
                    </span>
                  )}
                  <span style={{ flex: 1 }}>
                    {lineTokens.map((t, ti) => (
                      <span key={ti} style={{ color: colorFor(t.type) }}>{t.text}</span>
                    ))}
                    {isTypingCode && lineIdx === renderedLines.length - 1 && config.showCursor && cursor}
                  </span>
                </div>
              ))}

              {/* ── ACT 2: full code rendering (no narrative lines in flow) ── */}
              {!isAct1 && nonNarrativeCodeLines.map(({ fullIdx }, visualIdx) => {
                const lineTokens = fullLineTokens[fullIdx] ?? [];
                const isHighlighted = visualIdx === highlightSchedIdx;
                const isIntroComment = narrativeInfo.introLineIndices.has(fullIdx);
                const introWrappedLines = panTimings[fullIdx]?.introWrappedLines;

                // Narrative comment for this code line (inline mode)
                const narrativeText = narrativeInfo.narrativeMap.get(fullIdx);
                const metricCommentLines = lineMetrics[visualIdx]?.commentLines ?? [];
                const { line1Chars, line2Chars, typingLine1, typingLine2 } = narrativeText
                  ? getNarrativeChars(fullIdx, metricCommentLines)
                  : { line1Chars: 0, line2Chars: 0, typingLine1: false, typingLine2: false };

                const highlightBg = isHighlighted
                  ? (isY2K ? "rgba(0,68,200,0.07)" : "rgba(255,255,255,0.09)")
                  : "transparent";
                const staticAccentOpacity = isHighlightStatic && isHighlighted ? highlightFraction : 0;
                const commentLineStyle: React.CSSProperties = {
                  display: "flex",
                  minHeight: lineHeight,
                  background: isHighlightStatic
                    ? `rgba(255, 87, 34, ${0.1 * staticAccentOpacity})`
                    : highlightBg,
                  borderLeft: isHighlightStatic && isHighlighted
                    ? `3px solid rgba(255, 87, 34, ${staticAccentOpacity})`
                    : "none",
                  paddingLeft: isHighlightStatic && isHighlighted ? 4 : 0,
                  borderRadius: 2,
                };
                const lineNumWidth_ch = `${String(codeLines.length).length + 1}ch`;
                const lineNumBlank = config.showLineNumbers ? (
                  <span style={{
                    color: theme.lineNumber,
                    width: lineNumWidth_ch,
                    textAlign: "right",
                    paddingRight: 24,
                    userSelect: "none",
                    flexShrink: 0,
                  }} />
                ) : null;

                return (
                  <React.Fragment key={fullIdx}>
                    {/* Narrative comment — appears above the code line, inline style */}
                    {config.commentStyle === "inline" && narrativeText && line1Chars > 0 && (
                      <div style={commentLineStyle}>
                        {lineNumBlank}
                        <span style={{ flex: 1, color: theme.comment, filter: isHighlighted ? "brightness(1.4)" : undefined }}>
                          {commentPrefix}{metricCommentLines[0]?.slice(0, line1Chars) ?? ""}
                          {typingLine1 && config.showCursor && cursor}
                        </span>
                      </div>
                    )}
                    {config.commentStyle === "inline" && narrativeText && line2Chars > 0 && (
                      <div style={commentLineStyle}>
                        {lineNumBlank}
                        <span style={{ flex: 1, color: theme.comment, filter: isHighlighted ? "brightness(1.4)" : undefined }}>
                          {commentPrefix}{metricCommentLines[1]?.slice(0, line2Chars) ?? ""}
                          {typingLine2 && config.showCursor && cursor}
                        </span>
                      </div>
                    )}

                    {/* Code line — intro comments rendered wrapped if they have 2 lines */}
                    {isIntroComment && introWrappedLines && introWrappedLines.length > 1 ? (
                      introWrappedLines.map((wrappedLine, wIdx) => (
                        <div key={wIdx} style={{
                          display: "flex",
                          minHeight: lineHeight,
                          background: isHighlightStatic
                            ? `rgba(255, 87, 34, ${0.1 * staticAccentOpacity})`
                            : highlightBg,
                          borderLeft: isHighlightStatic && isHighlighted
                            ? `3px solid rgba(255, 87, 34, ${staticAccentOpacity})`
                            : "none",
                          paddingLeft: isHighlightStatic && isHighlighted ? 4 : 0,
                          borderRadius: 2,
                        }}>
                          {config.showLineNumbers && (
                            <span style={{
                              color: theme.lineNumber,
                              width: lineNumWidth_ch,
                              textAlign: "right",
                              paddingRight: 24,
                              userSelect: "none",
                              flexShrink: 0,
                            }}>
                              {wIdx === 0 ? visualIdx + 1 : ""}
                            </span>
                          )}
                          <span style={{ flex: 1, filter: isHighlighted ? "brightness(1.4)" : undefined }}>
                            <span style={{ color: theme.comment }}>{wrappedLine}</span>
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{
                        display: "flex",
                        minHeight: lineHeight,
                        background: isHighlightStatic
                          ? `rgba(255, 87, 34, ${0.1 * staticAccentOpacity})`
                          : highlightBg,
                        borderLeft: isHighlightStatic && isHighlighted
                          ? `3px solid rgba(255, 87, 34, ${staticAccentOpacity})`
                          : "none",
                        paddingLeft: isHighlightStatic && isHighlighted ? 4 : 0,
                        borderRadius: 2,
                      }}>
                        {config.showLineNumbers && (
                          <span style={{
                            color: theme.lineNumber,
                            width: lineNumWidth_ch,
                            textAlign: "right",
                            paddingRight: 24,
                            userSelect: "none",
                            flexShrink: 0,
                          }}>
                            {visualIdx + 1}
                          </span>
                        )}
                        <span style={{
                          flex: 1,
                          filter: isHighlighted ? "brightness(1.4)" : undefined,
                        }}>
                          {lineTokens.map((t, ti) => (
                            <span key={ti} style={{ color: colorFor(t.type) }}>{t.text}</span>
                          ))}
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Outro / CTA line */}
              {outroVisible.length > 0 && (
                <div style={{ display: "flex", minHeight: lineHeight }}>
                  {config.showLineNumbers && (
                    <span style={{
                      color: theme.lineNumber,
                      width: `${String(codeLines.length).length + 1}ch`,
                      textAlign: "right",
                      paddingRight: 24,
                      userSelect: "none",
                      flexShrink: 0,
                    }}>
                      {nonNarrativeCodeLines.length + 1}
                    </span>
                  )}
                  <span style={{ flex: 1, color: theme.comment }}>
                    {outroVisible}
                    {isTypingOutro && config.showCursor && cursor}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Script-driven subtitle overlay (TikTok/Reels style) ── */}
      {config.subtitlesEnabled && (() => {
        const tSec = frame / fps;
        const active = config.subtitleBlocks.find(b => tSec >= b.startSec && tSec < b.endSec);
        if (!active) return null;
        const s = config.subtitleStyle;
        const stroke = Math.max(0, s.strokeWidth);
        const textShadow = stroke > 0
          ? Array.from({ length: 8 }, (_, i) => {
              const ang = (i / 8) * Math.PI * 2;
              const dx = Math.cos(ang) * stroke;
              const dy = Math.sin(ang) * stroke;
              return `${dx.toFixed(1)}px ${dy.toFixed(1)}px 0 ${s.strokeColor}`;
            }).join(", ")
          : "none";
        const positionStyle: React.CSSProperties = s.position === "center"
          ? { top: "50%", transform: "translateY(-50%)" }
          : { bottom: 240 };
        const bgRgba = s.bgEnabled ? hexToRgba(s.bgColor, s.bgOpacity) : "transparent";
        return (
          <div style={{
            position: "absolute",
            left: 60,
            right: 60,
            zIndex: 40,
            display: "flex",
            justifyContent: "center",
            ...positionStyle,
          }}>
            <div style={{
              background: bgRgba,
              borderRadius: s.bgEnabled ? 14 : 0,
              padding: s.bgEnabled ? "16px 26px" : "0",
              fontFamily: fontScale,
              fontSize: s.fontSize,
              lineHeight: 1.35,
              color: s.color,
              textAlign: "center",
              fontWeight: s.fontWeight,
              letterSpacing: "normal",
              textShadow,
              wordBreak: "normal",
              whiteSpace: "normal",
              // Hard-cap at the outer wrapper width so text never bleeds outside the frame.
              // paddingBottom leaves room for descenders (p/g/q/y) + stroke shadow below baseline.
              width: "100%",
              maxWidth: width - 120,
              overflow: "hidden",
              paddingBottom: "0.18em",
            }}>
              {(() => {
                // 0.62em/glyph accounts for Plus Jakarta Sans weight-800 being
                // wider than regular. 83% canvas width gives a generous margin
                // so lines never reach the frame edge.
                const usableWidth = width * 0.83 - (s.bgEnabled ? 52 : 0);
                const charsPerLine = Math.max(14, Math.floor(usableWidth / (s.fontSize * 0.62)));
                // wrapTextToLines handles arbitrarily long phrases (not just 2-line split).
                const lines = wrapTextToLines(active.text, charsPerLine);
                return lines.map((line, i) => (
                  // nowrap per line prevents the SVG rasterizer (html-to-image export)
                  // from re-wrapping with fallback-font metrics. No overflow:hidden here —
                  // that was clipping descenders; parent overflow:hidden handles containment.
                  <div key={i} style={{ whiteSpace: "nowrap", maxWidth: "100%" }}>{line}</div>
                ));
              })()}
            </div>
          </div>
        );
      })()}

      {/* ── Subtitle overlay (TikTok-style, outside the code card) ── */}
      {config.commentStyle === "subtitle" && !config.subtitlesEnabled && subtitleText && (
        <div style={{
          position: "absolute",
          bottom: 180,
          left: 60,
          right: 60,
          zIndex: 30,
          background: "rgba(0,0,0,0.75)",
          borderRadius: 16,
          padding: "20px 28px",
          fontFamily: fontScale,
          fontSize: 42,
          lineHeight: 1.35,
          color: "#ffffff",
          textAlign: "center",
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}>
          {subtitleText}
          {isTypingSubtitle && config.showCursor && (
            <span style={{
              display: "inline-block",
              width: 3,
              height: 42,
              background: "#fff",
              marginLeft: 4,
              verticalAlign: "middle",
              opacity: cursorVisible ? 1 : 0,
            }} />
          )}
        </div>
      )}

      {/* Subtle CRT scanline texture */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 3px)',
        backgroundSize: '100% 3px',
      }} />
    </AbsoluteFill>
  );
};
