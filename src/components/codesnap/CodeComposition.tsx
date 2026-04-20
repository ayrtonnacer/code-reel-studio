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
  const isTyping = charsTyped < totalChars;

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

  // Auto-scroll during typing: keep last line in view
  const cardInnerHeight = height - config.padding * 2 - 200;
  const maxVisibleLines = Math.floor(cardInnerHeight / lineHeight);
  const scrollLines     = Math.max(0, visibleLineCount - maxVisibleLines + 2);
  const typingScrollY   = -scrollLines * lineHeight;

  // ── Zoom-scan effect ─────────────────────────────────────────────────
  // The code card is centered vertically; derive the Y of the first & last code line.
  const chromeH        = config.windowChrome ? 46 : 0;
  const cardH          = Math.min(
    totalLines * lineHeight + config.padding * 2 + chromeH,
    height - 420
  );
  const cardTop        = (height - cardH) / 2;
  const codeFirstLineY = cardTop + chromeH + config.padding;
  const codeLastLineY  = codeFirstLineY + (totalLines - 1) * lineHeight;

  // How much to translateY so that a given original-space y lands at screen centre.
  // With transformOrigin '10% center' and transform scale(Z) translateY(T):
  //   screen_y = (orig_y + T − H/2) × Z + H/2
  //   To place orig_y at screen centre → T = H/2 − orig_y
  const T_first = height / 2 - codeFirstLineY;
  const T_last  = height / 2 - codeLastLineY;

  const SCAN_ZOOM   = 2.5;
  const ZOOM_FRAMES = Math.round(fps * 0.5);   // 0.5 s for zoom-in / zoom-out

  const typingEndFrame    = Math.round(
    (config.startDelay + totalChars / Math.max(1, config.typingSpeed)) * fps
  );
  const scanStartFrame    = typingEndFrame + Math.round(fps * 0.4); // 0.4 s pause
  const zoomInEndFrame    = scanStartFrame + ZOOM_FRAMES;
  const panStartFrame     = zoomInEndFrame;
  // Reserve room for zoom-out at the end; pan fills the rest
  const zoomOutStartFrame = Math.max(
    panStartFrame + Math.round(fps * 0.5),
    durationInFrames - ZOOM_FRAMES - Math.round(fps * 0.3)
  );
  const panEndFrame       = zoomOutStartFrame;
  const zoomOutEndFrame   = zoomOutStartFrame + ZOOM_FRAMES;

  // Only run the effect if the video is long enough
  const canScan = zoomOutStartFrame > zoomInEndFrame + Math.round(fps * 0.3);

  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  const sceneZoom: number = canScan
    ? frame < scanStartFrame    ? 1
    : frame <= zoomInEndFrame   ? interpolate(frame, [scanStartFrame, zoomInEndFrame],      [1, SCAN_ZOOM], clamp)
    : frame < zoomOutStartFrame ? SCAN_ZOOM
    : frame <= zoomOutEndFrame  ? interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame],  [SCAN_ZOOM, 1], clamp)
    : 1
    : 1;

  // translateY that keeps the focus point (first → last line) centred on screen
  const sceneTranslateY: number = canScan
    ? frame < scanStartFrame    ? 0
    : frame <= zoomInEndFrame   ? interpolate(frame, [scanStartFrame, zoomInEndFrame],  [0,       T_first], clamp)
    : frame < panEndFrame && panEndFrame > panStartFrame
                                ? interpolate(frame, [panStartFrame, panEndFrame],      [T_first, T_last],  clamp)
    : frame <= zoomOutEndFrame  ? interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [T_last, 0],     clamp)
    : 0
    : 0;

  // During scan reset internal scroll to 0 (show from line 1)
  const effectiveScrollY = frame >= scanStartFrame ? 0 : typingScrollY;
  // ─────────────────────────────────────────────────────────────────────

  // Title fades out at 1.5 s so it never overlaps the code
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
            const fade =
              f >= fadeStart
                ? interpolate(f, [fadeStart, durationInFrames], [1, 0], clamp)
                : 1;
            return config.audioVolume * fade;
          }}
        />
      )}

      {/*
        Zoom wrapper — transformOrigin '10% center' anchors the zoom to the
        LEFT side of the frame (where code text starts), so the camera feels
        like it opens from the left rather than the centre.
      */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${sceneZoom}) translateY(${sceneTranslateY}px)`,
          transformOrigin: "10% center",
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
          <div
            style={{
              fontFamily: fontScale,
              color: "rgba(255, 255, 255, 0.4)",
              fontSize: 24,
              letterSpacing: "0.02em",
              fontWeight: 500,
            }}
          >
            {config.brandHandle}
          </div>
        </div>

        {/* Title — fades out at 1.5 s */}
        {config.showTitle && config.title.trim() && (
          <div
            style={{
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
            }}
          >
            {config.title.charAt(0).toUpperCase() + config.title.slice(1)}
          </div>
        )}

        {/* Code card */}
        <div
          style={{
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
          }}
        >
          {config.windowChrome && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                background: "rgba(0, 0, 0, 0.2)",
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#ff5f56" }} />
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#ffbd2e" }} />
              <div style={{ width: 12, height: 12, borderRadius: 999, background: "#27c93f" }} />
              <div
                style={{
                  marginLeft: 16,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "rgba(255, 255, 255, 0.4)",
                  fontSize: 18,
                  fontWeight: 400,
                }}
              >
                {config.filename}
              </div>
            </div>
          )}

          <div
            style={{
              flex: 1,
              padding: config.padding,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                transform: `translateY(${effectiveScrollY}px)`,
                transition: "none",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: config.fontSize,
                lineHeight: `${lineHeight}px`,
                color: theme.text,
                whiteSpace: "pre",
              }}
            >
              {renderedLines.map((lineTokens, lineIdx) => (
                <div key={lineIdx} style={{ display: "flex", minHeight: lineHeight }}>
                  {config.showLineNumbers && (
                    <span
                      style={{
                        color: "rgba(255, 255, 255, 0.2)",
                        width: `${String(totalLines).length + 1}ch`,
                        textAlign: "right",
                        paddingRight: 24,
                        userSelect: "none",
                        flexShrink: 0,
                      }}
                    >
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
                      <span
                        style={{
                          display: "inline-block",
                          width: 2,
                          height: config.fontSize * 1.1,
                          background: theme.cursor,
                          verticalAlign: "middle",
                          marginLeft: 1,
                          opacity: cursorVisible ? 1 : 0,
                        }}
                      />
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
