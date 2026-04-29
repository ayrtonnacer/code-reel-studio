import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing, spring, Audio, Sequence } from "remotion";
import type { SnippetConfig } from "@/lib/codesnap-types";
import {
  buildBackgroundCss,
  computeLinePanTimings,
  computeVideoTimings,
  SCAN_ZOOM_FRAMES,
  SCAN_SNAP_FRAMES,
  SCAN_BASE_READ_FRAMES,
  SCAN_PRE_PAUSE_FRAMES,
} from "@/lib/codesnap-types";
import { THEMES, BACKGROUNDS } from "@/lib/codesnap-themes";
import { tokenize } from "@/lib/codesnap-tokenize";
import { getMusicPreset, SFX_TYPE_CLICK, SFX_ZOOM_IN, SFX_ZOOM_OUT, SFX_START_CLICK, type MusicPresetKey } from "@/lib/codesnap-sfx";

interface Props {
  config: SnippetConfig;
}

// Returns the comment prefix string for the given language
function getCommentPrefix(lang: SnippetConfig["language"]): string {
  switch (lang) {
    case "python": case "ruby": case "bash":
      return "# ";
    case "html":
      return "<!-- ";
    case "css":
      return "/* ";
    case "sql":
      return "-- ";
    default:
      return "// ";
  }
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

  const tokens = useMemo(
    () => tokenize(config.code, config.language),
    [config.code, config.language]
  );

  // Outro text — prefixed with language comment marker
  const outroPrefix = config.outroEnabled && config.outroText
    ? getCommentPrefix(config.language)
    : "";
  const outroFull = config.outroEnabled && config.outroText
    ? outroPrefix + config.outroText
    : "";

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
  const isTypingCode = charsTyped < totalChars;

  // Outro typing
  const timings = useMemo(() => computeVideoTimings(config), [config]);
  const outroStartFrame = config.outroEnabled && outroFull.length > 0
    ? Math.round(timings.outroStartSec * fps)
    : Infinity;
  const outroElapsed = frame >= outroStartFrame
    ? (frame - outroStartFrame) / fps * config.typingSpeed
    : 0;
  const outroCharsTyped = Math.min(Math.floor(outroElapsed), outroFull.length);
  const outroVisible = outroFull.slice(0, outroCharsTyped);
  const isTypingOutro = outroFull.length > 0 && outroCharsTyped < outroFull.length && frame >= outroStartFrame;

  const cursorVisible = Math.floor(frame / (fps * 0.5)) % 2 === 0;

  const introOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const introScale   = interpolate(frame, [0, 22], [0.96, 1], { extrapolateRight: "clamp" });

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

  // Account for outro line when scrolling
  const extraOutroLine = outroVisible.length > 0 ? 1 : 0;
  const scrollLines = Math.max(0, visibleLineCount + extraOutroLine - maxVisibleLines + 2);
  const typingScrollY = -scrollLines * lineHeight;

  // ── Scan-read effect ─────────────────────────────────────────────────
  const chromeH        = config.windowChrome ? 46 : 0;
  const cardH          = Math.min(
    totalLines * lineHeight + config.padding * 2 + chromeH,
    height - 420
  );
  const cardTop        = (height - cardH) / 2;
  const codeAreaTop    = cardTop + chromeH + config.padding;

  const xCodeLeft = config.padding * 2;
  const SCAN_ZOOM = config.scanZoom;

  const typingEndFrame = Math.round(
    (config.startDelay + totalChars / Math.max(1, config.typingSpeed)) * fps
  );
  const scanStartFrame = config.scanEnabled
    ? typingEndFrame + SCAN_PRE_PAUSE_FRAMES
    : Infinity;
  const zoomInEndFrame = scanStartFrame + SCAN_ZOOM_FRAMES;
  const panStartFrame  = zoomInEndFrame;

  const clamp     = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const easeOut   = { ...clamp, easing: Easing.out(Easing.cubic) };
  const easeInOut = { ...clamp, easing: Easing.inOut(Easing.cubic) };

  const Tx_left = -xCodeLeft;

  const charWidth    = config.fontSize * 0.6;
  const lineNumWidth = config.showLineNumbers
    ? (String(totalLines).length + 1) * charWidth + 24
    : 0;

  const codeLines = useMemo(
    () => config.code.split("\n").map(l => l.replace(/\r$/, "").trimEnd()),
    [config.code]
  );

  const lineMetrics = useMemo(() => {
    const visibleWidth = width / SCAN_ZOOM;

    return codeLines.map((lineText, idx) => {
      const lineContentEnd = xCodeLeft + lineNumWidth + lineText.length * charWidth;
      const idealTx  = visibleWidth - lineContentEnd;
      const targetTx = Math.min(idealTx, Tx_left);
      const scrollDist = Math.abs(Tx_left - targetTx);

      const scroll = Math.max(0, idx - maxVisibleLines + 3) * lineHeight;
      const absY   = codeAreaTop + idx * lineHeight - scroll;
      const Ty     = height / 2 - absY;

      return { targetTx, scrollDist, Ty, scroll: -scroll };
    });
  }, [codeLines, SCAN_ZOOM, width, charWidth, lineNumWidth, xCodeLeft, Tx_left, maxVisibleLines, lineHeight, codeAreaTop, height]);

  const panTimings = useMemo(() => computeLinePanTimings(config), [config]);

  const { lineSchedules, dynamicScanFrames } = useMemo(() => {
    let cursor = 0;
    const schedules = lineMetrics.map((m, idx) => {
      const readDuration = panTimings[idx]?.readFrames ?? SCAN_BASE_READ_FRAMES;
      const start   = cursor;
      const end     = start + readDuration;
      const snapEnd = idx === lineMetrics.length - 1 ? end : end + SCAN_SNAP_FRAMES;
      cursor = snapEnd;
      return { start, end, snapEnd };
    });
    return { lineSchedules: schedules, dynamicScanFrames: cursor };
  }, [lineMetrics, panTimings]);

  const panEndFrame       = panStartFrame + dynamicScanFrames;
  const zoomOutStartFrame = panEndFrame;
  const zoomOutEndFrame   = zoomOutStartFrame + SCAN_ZOOM_FRAMES;

  let sceneZoom        = 1;
  let sceneTranslateX  = 0;
  let sceneTranslateY  = 0;
  let effectiveScrollY = typingScrollY;

  if (frame < scanStartFrame) {
    effectiveScrollY = typingScrollY;

  } else if (frame <= zoomInEndFrame) {
    const m0 = lineMetrics[0];
    sceneZoom        = interpolate(frame, [scanStartFrame, zoomInEndFrame], [1, SCAN_ZOOM], easeOut);
    sceneTranslateY  = interpolate(frame, [scanStartFrame, zoomInEndFrame], [0, m0.Ty], easeOut);
    sceneTranslateX  = interpolate(frame, [scanStartFrame, zoomInEndFrame], [0, Tx_left], easeOut);
    effectiveScrollY = 0;

  } else if (frame < panEndFrame) {
    sceneZoom = SCAN_ZOOM;
    const scanFrame = frame - panStartFrame;

    const lineIdx = lineSchedules.findIndex(s => scanFrame < s.snapEnd);
    const currentIdx = lineIdx === -1 ? lineSchedules.length - 1 : lineIdx;

    const sched = lineSchedules[currentIdx];
    const curr  = lineMetrics[currentIdx];
    const inLineFrame = scanFrame - sched.start;

    if (scanFrame < sched.end) {
      effectiveScrollY = curr.scroll;
      sceneTranslateY  = curr.Ty;
      sceneTranslateX  = interpolate(inLineFrame, [0, sched.end - sched.start], [Tx_left, curr.targetTx], easeOut);
    } else {
      const next = lineMetrics[currentIdx + 1] || curr;
      const snapFrame = scanFrame - sched.end;
      const snapProgress = spring({
        fps,
        frame: snapFrame,
        config: { damping: 40, stiffness: 200 },
        durationInFrames: SCAN_SNAP_FRAMES,
      });
      effectiveScrollY = curr.scroll  + (next.scroll  - curr.scroll)  * snapProgress;
      sceneTranslateY  = curr.Ty      + (next.Ty      - curr.Ty)      * snapProgress;
      sceneTranslateX  = curr.targetTx + (Tx_left     - curr.targetTx) * snapProgress;
    }

  } else if (frame <= zoomOutEndFrame) {
    const lastLine = lineMetrics[lineMetrics.length - 1];
    sceneZoom        = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [SCAN_ZOOM, 1], easeInOut);
    sceneTranslateY  = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [lastLine.Ty, 0], easeInOut);
    sceneTranslateX  = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [lastLine.targetTx, 0], easeInOut);
    effectiveScrollY = 0;

  } else {
    sceneZoom        = 1;
    sceneTranslateX  = 0;
    sceneTranslateY  = 0;
    effectiveScrollY = typingScrollY;
  }

  // Scan highlight
  let highlightLineIdx = -1;
  if (frame >= panStartFrame && frame < panEndFrame) {
    const scanF = frame - panStartFrame;
    const li = lineSchedules.findIndex(s => scanF < s.snapEnd);
    const ci = li === -1 ? lineSchedules.length - 1 : li;
    if (scanF < lineSchedules[ci].end) {
      highlightLineIdx = ci;
    }
  }

  // Title fades out 1.5s after typing starts
  const titleOpacity =
    config.showTitle && config.title.trim()
      ? interpolate(frame, [Math.round(fps * 1.5), Math.round(fps * 2.5)], [1, 0], clamp)
      : 0;

  const fontScale = "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif";

  const startTypingFrame = Math.round(config.startDelay * fps);

  // Background music
  const bgMusicUrl = useMemo(
    () => config.bgMusicDataUrl
      ?? (config.bgMusicPreset ? getMusicPreset(config.bgMusicPreset as MusicPresetKey) : null),
    [config.bgMusicDataUrl, config.bgMusicPreset]
  );

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
          // @ts-expect-error loop is valid but not yet in Remotion's types
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
          {/* Mouse click at video start */}
          <Sequence from={0}>
            <Audio src={SFX_START_CLICK} volume={config.sfxVolume * 0.75} />
          </Sequence>

          {/* Typing click — code */}
          {frame >= startTypingFrame && isTypingCode && (
            <Audio
              src={SFX_TYPE_CLICK}
              volume={config.sfxVolume * 0.55}
              // @ts-expect-error loop is valid but not yet in Remotion's types
              loop
            />
          )}

          {/* Zoom-in */}
          {config.scanEnabled && (
            <Sequence from={scanStartFrame}>
              <Audio src={SFX_ZOOM_IN} volume={config.sfxVolume * 0.75} />
            </Sequence>
          )}

          {/* Zoom-out */}
          {config.scanEnabled && (
            <Sequence from={zoomOutStartFrame}>
              <Audio src={SFX_ZOOM_OUT} volume={config.sfxVolume * 0.75} />
            </Sequence>
          )}

          {/* Typing click — outro */}
          {isTypingOutro && (
            <Audio
              src={SFX_TYPE_CLICK}
              volume={config.sfxVolume * 0.55}
              // @ts-expect-error loop is valid but not yet in Remotion's types
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
            fontSize: 58,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: isLightBg ? "#0a0a0a" : "#fff",
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
          border: isY2K ? `2px solid #000` : `1px solid ${theme.border}`,
          boxShadow: isY2K ? "8px 8px 0 rgba(0,0,0,0.18)" : "0 24px 64px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRadius: isY2K ? 0 : 4,
        }}>
          {config.windowChrome && (isY2K ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              borderBottom: `2px solid #000`,
              background: "linear-gradient(180deg, #4488ff 0%, #1155dd 50%, #0044bb 100%)",
              height: 46,
              gap: 0,
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
                {[
                  { label: '—', bold: false },
                  { label: '□', bold: false },
                  { label: '✕', bold: true },
                ].map((btn, i) => (
                  <div key={i} style={{
                    width: 26,
                    height: 22,
                    backgroundColor: '#c0c0c0',
                    border: '2px solid',
                    borderColor: '#ffffff #606060 #606060 #ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontWeight: btn.bold ? 'bold' : 'normal',
                    color: '#000000',
                    lineHeight: 1,
                    userSelect: 'none' as const,
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
                <div key={lineIdx} style={{
                  display: "flex",
                  minHeight: lineHeight,
                  background: lineIdx === highlightLineIdx ? (isY2K ? "rgba(0,68,200,0.07)" : "rgba(255,255,255,0.09)") : "transparent",
                  borderRadius: 2,
                }}>
                  {config.showLineNumbers && (
                    <span style={{
                      color: theme.lineNumber,
                      width: `${String(totalLines).length + 1}ch`,
                      textAlign: "right",
                      paddingRight: 24,
                      userSelect: "none",
                      flexShrink: 0,
                    }}>
                      {lineIdx + 1}
                    </span>
                  )}
                  <span style={{
                    flex: 1,
                    filter: lineIdx === highlightLineIdx ? "brightness(1.4)" : undefined,
                  }}>
                    {lineTokens.map((t, ti) => (
                      <span key={ti} style={{ color: colorFor(t.type) }}>
                        {t.text}
                      </span>
                    ))}
                    {isTypingCode && lineIdx === renderedLines.length - 1 && config.showCursor && (
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

              {/* Outro / CTA line */}
              {outroVisible.length > 0 && (
                <div style={{
                  display: "flex",
                  minHeight: lineHeight,
                }}>
                  {config.showLineNumbers && (
                    <span style={{
                      color: theme.lineNumber,
                      width: `${String(totalLines).length + 1}ch`,
                      textAlign: "right",
                      paddingRight: 24,
                      userSelect: "none",
                      flexShrink: 0,
                    }}>
                      {totalLines + 1}
                    </span>
                  )}
                  <span style={{ flex: 1, color: theme.comment }}>
                    {outroVisible}
                    {isTypingOutro && config.showCursor && (
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
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subtle CRT scanline texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 3px)',
          backgroundSize: '100% 3px',
        }}
      />
    </AbsoluteFill>
  );
};
