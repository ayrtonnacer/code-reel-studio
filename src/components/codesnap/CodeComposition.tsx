import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Audio } from "remotion";
import type { SnippetConfig } from "@/lib/codesnap-types";
import { buildBackgroundCss } from "@/lib/codesnap-types";
import { THEMES, BACKGROUNDS } from "@/lib/codesnap-themes";
import { tokenize } from "@/lib/codesnap-tokenize";

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

  const tokens = useMemo(
    () => tokenize(config.code, config.language),
    [config.code, config.language]
  );

  const elapsedSec = frame / fps - config.startDelay;
  const charsTyped = Math.max(0, Math.floor(elapsedSec * config.typingSpeed));

  let remaining = charsTyped;
  const visibleTokens: { text: string; type: string }[] = [];
  for (const t of tokens) {
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

  const totalChars = config.code.length;
  const isTyping   = charsTyped < totalChars;

  const cursorVisible = Math.floor(frame / (fps * 0.5)) % 2 === 0;

  const introOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const introScale   = interpolate(frame, [0, 18], [0.96, 1], { extrapolateRight: "clamp" });

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

  type LineToken = { text: string; type: string };
  const renderedLines: LineToken[][] = [];
  let buffer: LineToken[] = [];
  for (const t of visibleTokens) {
    const parts = t.text.split("\n");
    parts.forEach((part, idx) => {
      if (part) buffer.push({ text: part, type: t.type });
      if (idx < parts.length - 1) { renderedLines.push(buffer); buffer = []; }
    });
  }
  renderedLines.push(buffer);

  const lineHeight       = config.fontSize * 1.45;
  const totalLines       = config.code.split("\n").length;
  const visibleLineCount = renderedLines.length;

  // Auto-scroll during typing
  const cardInnerHeight = height - config.padding * 2 - 200;
  const maxVisibleLines = Math.floor(cardInnerHeight / lineHeight);
  const scrollLines     = Math.max(0, visibleLineCount - maxVisibleLines + 2);
  const typingScrollY   = -scrollLines * lineHeight;

  // ── Scan-read effect ─────────────────────────────────────────────────
  //
  // After typing: zoom in (origin = left edge) and scan each line
  // left-to-right like a reading cursor, then zoom back out.
  //
  // Transform: scale(Z) translateX(Tx) translateY(Ty)
  // with transformOrigin '0% 50%'  (x=0, y=H/2)
  //
  //   screen_x = (orig_x + Tx) * Z
  //   screen_y = (orig_y + Ty − H/2) * Z + H/2
  //
  // Card geometry
  const chromeH        = config.windowChrome ? 46 : 0;
  const cardH          = Math.min(
    totalLines * lineHeight + config.padding * 2 + chromeH,
    height - 420
  );
  const cardTop        = (height - cardH) / 2;
  const codeAreaTop    = cardTop + chromeH + config.padding; // abs-y of first code line

  // X: code content starts at padding*2 from scene left, spans to width−padding*2
  const xCodeLeft   = config.padding * 2;
  const SCAN_ZOOM   = config.scanZoom;
  const ZOOM_FRAMES = Math.round(fps * 0.45);
  const snapFrames  = Math.round(fps * 0.25); // always fast, independent of scanSpeed

  const typingEndFrame = Math.round(
    (config.startDelay + totalChars / Math.max(1, config.typingSpeed)) * fps
  );
  const scanStartFrame = typingEndFrame + Math.round(fps * 0.35);
  const zoomInEndFrame = scanStartFrame + ZOOM_FRAMES;
  const panStartFrame  = zoomInEndFrame;

  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  // translateX anchor: origin is at the left edge of the code area
  const Tx_left = -xCodeLeft;

  // ── Per-line scan metrics ─────────────────────────────────────────────
  // JetBrains Mono ≈ 0.6em per character
  const charWidth    = config.fontSize * 0.6;
  const lineNumWidth = config.showLineNumbers
    ? (String(totalLines).length + 1) * charWidth + 24
    : 0;

  // Clean text for width calculation (trimEnd prevents overshooting into trailing spaces)
  const codeLines = useMemo(() =>
    config.code.split("\n").map(l => l.replace(/\r$/, "").trimEnd()),
    [config.code]
  );

  // Pre-calculate target Tx and geometry for every line
  const lineMetrics = useMemo(() => {
    const visibleWidth = width / SCAN_ZOOM;

    return codeLines.map((lineText, idx) => {
      const lineContentEnd = xCodeLeft + lineNumWidth + lineText.length * charWidth;

      // We want the RIGHT edge of the zoomed viewport to land exactly on lineContentEnd:
      //   screen_right = (lineContentEnd + Tx) * SCAN_ZOOM = width
      //   → Tx = (width / SCAN_ZOOM) - lineContentEnd
      // Clamp so we never over-scroll left of Tx_left.
      const idealTx  = visibleWidth - lineContentEnd;
      const targetTx = Math.min(idealTx, Tx_left);
      const scrollDist = Math.abs(Tx_left - targetTx);

      const scroll = Math.max(0, idx - maxVisibleLines + 3) * lineHeight;
      const absY   = codeAreaTop + idx * lineHeight - scroll;
      const Ty     = height / 2 - absY;

      return { targetTx, scrollDist, Ty, scroll: -scroll };
    });
  }, [codeLines, SCAN_ZOOM, width, charWidth, lineNumWidth, xCodeLeft, Tx_left, maxVisibleLines, lineHeight, codeAreaTop, height]);

  // Distribute frames dynamically: speed is constant (pixels/frame), so longer lines get more time
  const { lineSchedules, dynamicScanFrames } = useMemo(() => {
    const BASE_READ_FRAMES = Math.round(fps * 0.3);
    const pixelsPerFrame   = Math.max(0.1, config.scanSpeed * (width / 1000));

    let cursor = 0;
    const schedules = lineMetrics.map((m, idx) => {
      const readDuration = BASE_READ_FRAMES + Math.round(m.scrollDist / pixelsPerFrame);
      const start   = cursor;
      const end     = start + readDuration;
      const snapEnd = idx === lineMetrics.length - 1 ? end : end + snapFrames;
      cursor = snapEnd;
      return { start, end, snapEnd };
    });

    return { lineSchedules: schedules, dynamicScanFrames: cursor };
  }, [lineMetrics, config.scanSpeed, fps, snapFrames, width]);

  const panEndFrame       = panStartFrame + dynamicScanFrames;
  const zoomOutStartFrame = panEndFrame;
  const zoomOutEndFrame   = zoomOutStartFrame + ZOOM_FRAMES;

  let sceneZoom        = 1;
  let sceneTranslateX  = 0;
  let sceneTranslateY  = 0;
  let effectiveScrollY = typingScrollY;

  if (frame < scanStartFrame) {
    effectiveScrollY = typingScrollY;

  } else if (frame <= zoomInEndFrame) {
    // Zoom-in to top-left of first code line
    const m0 = lineMetrics[0];
    sceneZoom        = interpolate(frame, [scanStartFrame, zoomInEndFrame], [1, SCAN_ZOOM], clamp);
    sceneTranslateY  = interpolate(frame, [scanStartFrame, zoomInEndFrame], [0, m0.Ty], clamp);
    sceneTranslateX  = interpolate(frame, [scanStartFrame, zoomInEndFrame], [0, Tx_left], clamp);
    effectiveScrollY = 0;

  } else if (frame < panEndFrame) {
    sceneZoom = SCAN_ZOOM;
    const scanFrame = frame - panStartFrame;

    // Find which line we are currently scanning
    const lineIdx = lineSchedules.findIndex(s => scanFrame < s.snapEnd);
    const currentIdx = lineIdx === -1 ? lineSchedules.length - 1 : lineIdx;

    const sched = lineSchedules[currentIdx];
    const curr  = lineMetrics[currentIdx];
    const inLineFrame = scanFrame - sched.start;

    if (scanFrame < sched.end) {
      // ── Read phase: sweep left → right, stop when right edge hits last char ──
      effectiveScrollY = curr.scroll;
      sceneTranslateY  = curr.Ty;
      sceneTranslateX  = interpolate(inLineFrame, [0, sched.end - sched.start], [Tx_left, curr.targetTx], clamp);
    } else {
      // ── Snap phase: fast diagonal jump to start of next line ─────
      const next = lineMetrics[currentIdx + 1] || curr;
      const snapFrame = scanFrame - sched.end;
      effectiveScrollY = interpolate(snapFrame, [0, snapFrames], [curr.scroll, next.scroll], clamp);
      sceneTranslateY  = interpolate(snapFrame, [0, snapFrames], [curr.Ty,     next.Ty],     clamp);
      sceneTranslateX  = interpolate(snapFrame, [0, snapFrames], [curr.targetTx, Tx_left],    clamp);
    }

  } else if (frame <= zoomOutEndFrame) {
    // Zoom-out from last scanned line back to full view
    const lastLine = lineMetrics[lineMetrics.length - 1];
    sceneZoom        = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [SCAN_ZOOM, 1], clamp);
    sceneTranslateY  = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [lastLine.Ty, 0], clamp);
    sceneTranslateX  = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [lastLine.targetTx, 0], clamp);
    effectiveScrollY = 0;

  } else {
    sceneZoom        = 1;
    sceneTranslateX  = 0;
    sceneTranslateY  = 0;
    effectiveScrollY = 0;
  }

  // ─────────────────────────────────────────────────────────────────────

  // Title fades out at 1.5 s
  const titleOpacity =
    config.showTitle && config.title.trim()
      ? interpolate(frame, [Math.round(fps * 1.5), Math.round(fps * 2.5)], [1, 0], clamp)
      : 0;

  const fontScale = "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif";

  return (
    <AbsoluteFill style={bg.css}>
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

      {/*
        Zoom wrapper.
        transformOrigin '0% 50%' anchors to the LEFT edge, horizontally centred,
        so the camera opens from the left (where code text starts).
        transform order: scale → translateX → translateY (right-to-left application)
      */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${sceneZoom}) translateX(${sceneTranslateX}px) translateY(${sceneTranslateY}px)`,
          transformOrigin: "0% 50%",
        }}
      >
        {/* Brand watermark */}
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 20,
          }}
        >
          <div style={{
            fontFamily: fontScale,
            color: "rgba(255, 255, 255, 0.4)",
            fontSize: 24,
            letterSpacing: "0.02em",
            fontWeight: 500,
          }}>
            {config.brandHandle}
          </div>
        </div>

        {/* Title — fades out at 1.5 s */}
        {config.showTitle && config.title.trim() && (
          <div style={{
            position: "absolute",
            top: 200,
            left: 80,
            right: 80,
            zIndex: 15,
            fontFamily: fontScale,
            fontSize: 58,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: "#fff",
            fontWeight: 700,
            textAlign: "center",
            opacity: titleOpacity,
          }}>
            {config.title.charAt(0).toUpperCase() + config.title.slice(1)}
          </div>
        )}

        {/* Code card */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${introScale})`,
          opacity: introOpacity,
          width: width - config.padding * 2,
          maxHeight: height - 420,
          background: theme.bg,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRadius: 4,
        }}>
          {config.windowChrome && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 20px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
              background: "rgba(0, 0, 0, 0.2)",
            }}>
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#ff5f56" }} />
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#ffbd2e" }} />
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#27c93f" }} />
              <div style={{
                marginLeft: 16,
                fontFamily: "'JetBrains Mono', monospace",
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: 18,
                fontWeight: 400,
              }}>
                {config.filename}
              </div>
            </div>
          )}

          <div style={{
            flex: 1,
            padding: config.padding,
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{
              transform: `translateY(${effectiveScrollY}px)`,
              transition: "none",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: config.fontSize,
              lineHeight: `${lineHeight}px`,
              color: theme.text,
              whiteSpace: "pre",
            }}>
              {renderedLines.map((lineTokens, lineIdx) => (
                <div key={lineIdx} style={{ display: "flex", minHeight: lineHeight }}>
                  {config.showLineNumbers && (
                    <span style={{
                      color: "rgba(255, 255, 255, 0.2)",
                      width: `${String(totalLines).length + 1}ch`,
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
                      <span key={ti} style={{ color: colorFor(t.type) }}>
                        {t.text}
                      </span>
                    ))}
                    {isTyping && lineIdx === renderedLines.length - 1 && config.showCursor && (
                      <span style={{
                        display: "inline-block",
                        width: 2,
                        height: config.fontSize * 1.1,
                        background: theme.cursor,
                        verticalAlign: "middle",
                        marginLeft: 1,
                        opacity: cursorVisible ? 1 : 0,
                      }} />
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
