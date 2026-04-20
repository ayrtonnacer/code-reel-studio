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

  // Total characters typed so far (frame-driven)
  const elapsedSec = frame / fps - config.startDelay;
  const charsTyped = Math.max(
    0,
    Math.floor(elapsedSec * config.typingSpeed)
  );

  // Build visible substring across tokens
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

  // Cursor blink
  const cursorVisible = Math.floor(frame / (fps * 0.5)) % 2 === 0;

  // Subtle entrance
  const introOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const introScale = interpolate(frame, [0, 18], [0.96, 1], { extrapolateRight: "clamp" });

  const colorFor = (type: string): string => {
    switch (type) {
      case "comment": return theme.comment;
      case "keyword": return theme.keyword;
      case "string": return theme.string;
      case "number": return theme.number;
      case "function": return theme.function;
      case "variable": return theme.variable;
      case "punctuation": return theme.punctuation;
      default: return theme.text;
    }
  };

  // Render tokens broken across lines so line numbers align
  type LineToken = { text: string; type: string };
  const renderedLines: LineToken[][] = [];
  let buffer: LineToken[] = [];

  for (const t of visibleTokens) {
    const parts = t.text.split("\n");
    parts.forEach((part, idx) => {
      if (part) buffer.push({ text: part, type: t.type });
      if (idx < parts.length - 1) {
        renderedLines.push(buffer);
        buffer = [];
      }
    });
  }
  renderedLines.push(buffer);

  const lineHeight = config.fontSize * 1.45;
  const totalLines = config.code.split("\n").length;
  const visibleLineCount = renderedLines.length;

  // Auto scroll during typing: keep latest line in lower-third of card
  const cardInnerHeight = height - config.padding * 2 - 200;
  const maxVisibleLines = Math.floor(cardInnerHeight / lineHeight);
  const scrollLines = Math.max(0, visibleLineCount - maxVisibleLines + 2);
  const typingScrollY = -scrollLines * lineHeight;

  // ── Zoom + scan phase ────────────────────────────────────────────────
  const typingEndFrame = Math.round(
    (config.startDelay + totalChars / Math.max(1, config.typingSpeed)) * fps
  );
  const SCAN_ZOOM = 2.4;
  const scanStartFrame = typingEndFrame + Math.round(fps * 0.4); // 0.4s pause
  const zoomInEndFrame = scanStartFrame + Math.round(fps * 0.5); // 0.5s zoom-in
  const panStartFrame = zoomInEndFrame;
  const panEndFrame = Math.max(panStartFrame + fps, durationInFrames - Math.round(fps * 0.3));

  const isInScanPhase = frame >= scanStartFrame;

  // Scene-level zoom applied to everything visual
  const sceneZoom = isInScanPhase
    ? interpolate(frame, [scanStartFrame, zoomInEndFrame], [1, SCAN_ZOOM], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  // During scan pan from line 0 down through all lines
  const maxScanScroll = Math.max(0, (totalLines - maxVisibleLines) * lineHeight);
  const scanScrollY =
    frame >= panStartFrame && panEndFrame > panStartFrame && maxScanScroll > 0
      ? interpolate(frame, [panStartFrame, panEndFrame], [0, -maxScanScroll], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  // Effective scroll: reset to 0 when scan starts, then pan
  const effectiveScrollY = isInScanPhase ? scanScrollY : typingScrollY;
  // ─────────────────────────────────────────────────────────────────────

  // Title fades out after 1.5s so it doesn't collide with the code
  const titleOpacity =
    config.showTitle && config.title.trim()
      ? interpolate(frame, [Math.round(fps * 1.5), Math.round(fps * 2.5)], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
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
            const fadeStart = durationInFrames - fadeFrames;
            const fade =
              f >= fadeStart
                ? interpolate(f, [fadeStart, durationInFrames], [1, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 1;
            return config.audioVolume * fade;
          }}
        />
      )}

      {/* Zoom wrapper — applies scene-level zoom for the scan effect */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${sceneZoom})`,
          transformOrigin: "center center",
        }}
      >
        {/* Brand Watermark */}
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

        {/* Title — fades out after 1.5s */}
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
            border: `1px solid rgba(255, 255, 255, 0.08)`,
            boxShadow: "0 24px 64px rgba(0, 0, 0, 0.5)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderRadius: 4,
          }}
        >
          {/* Window chrome */}
          {config.windowChrome && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "16px 20px",
                borderBottom: `1px solid rgba(255, 255, 255, 0.05)`,
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

          {/* Code area */}
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
                    {/* Cursor on the last visible line while typing */}
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
