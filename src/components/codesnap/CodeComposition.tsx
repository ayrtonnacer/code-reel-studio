import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing, Audio, Sequence } from "remotion";
import type { SnippetConfig } from "@/lib/codesnap-types";
import { buildBackgroundCss } from "@/lib/codesnap-types";
import { THEMES, BACKGROUNDS } from "@/lib/codesnap-themes";
import { tokenize } from "@/lib/codesnap-tokenize";
import { getMusicPreset, SFX_TYPE_CLICK, SFX_ZOOM_IN, SFX_ZOOM_OUT, SFX_INTRO_WHOOSH, type MusicPresetKey } from "@/lib/codesnap-sfx";
import { MetallicPaint } from "./MetallicPaint";

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

  // When intro is enabled, all typing/scan logic is offset by introDuration
  const introFrames = config.introEnabled ? Math.round(config.introDuration * fps) : 0;
  const effectiveFrame = Math.max(0, frame - introFrames);

  const elapsedSec = effectiveFrame / fps - config.startDelay;
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

  const introOpacity = interpolate(effectiveFrame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const introScale   = interpolate(effectiveFrame, [0, 22], [0.96, 1], { extrapolateRight: "clamp" });

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

  const typingEndFrame = introFrames + Math.round(
    (config.startDelay + totalChars / Math.max(1, config.typingSpeed)) * fps
  );
  const scanStartFrame = config.scanEnabled
    ? typingEndFrame + Math.round(fps * 0.35)
    : Infinity;
  const zoomInEndFrame = scanStartFrame + ZOOM_FRAMES;
  const panStartFrame  = zoomInEndFrame;

  const clamp     = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const easeOut   = { ...clamp, easing: Easing.out(Easing.cubic) };
  const easeInOut = { ...clamp, easing: Easing.inOut(Easing.cubic) };

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
    sceneZoom        = interpolate(frame, [scanStartFrame, zoomInEndFrame], [1, SCAN_ZOOM], easeOut);
    sceneTranslateY  = interpolate(frame, [scanStartFrame, zoomInEndFrame], [0, m0.Ty], easeOut);
    sceneTranslateX  = interpolate(frame, [scanStartFrame, zoomInEndFrame], [0, Tx_left], easeOut);
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
    sceneZoom        = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [SCAN_ZOOM, 1], easeInOut);
    sceneTranslateY  = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [lastLine.Ty, 0], easeInOut);
    sceneTranslateX  = interpolate(frame, [zoomOutStartFrame, zoomOutEndFrame], [lastLine.targetTx, 0], easeInOut);
    effectiveScrollY = 0;

  } else {
    sceneZoom        = 1;
    sceneTranslateX  = 0;
    sceneTranslateY  = 0;
    effectiveScrollY = 0;
  }

  // ─── Scan highlight: current line being read ─────────────────────────
  let highlightLineIdx = -1;

  if (frame >= panStartFrame && frame < panEndFrame) {
    const scanF = frame - panStartFrame;
    const li = lineSchedules.findIndex(s => scanF < s.snapEnd);
    const ci = li === -1 ? lineSchedules.length - 1 : li;
    if (scanF < lineSchedules[ci].end) {
      highlightLineIdx = ci;
    }
  }

  // Title in code card fades out 1.5 s after typing starts
  const titleOpacity =
    config.showTitle && config.title.trim()
      ? interpolate(effectiveFrame, [Math.round(fps * 1.5), Math.round(fps * 2.5)], [1, 0], clamp)
      : 0;

  const fontScale = "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif";

  const startTypingFrame = introFrames + Math.round(config.startDelay * fps);

  // Intro overlay: fades out over last 0.4 s of intro duration
  const introFadeStart = Math.max(0, introFrames - Math.round(fps * 0.4));
  const introOverlayOpacity = config.introEnabled
    ? interpolate(frame, [introFadeStart, introFrames], [1, 0], clamp)
    : 0;
  // Entrance animations for intro text (relative to video start)
  const introTextIn   = interpolate(frame, [0, Math.round(fps * 0.5)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const introTitleY   = interpolate(frame, [Math.round(fps * 0.1), Math.round(fps * 0.65)], [48, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const introTitleIn  = interpolate(frame, [Math.round(fps * 0.1), Math.round(fps * 0.65)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const introMetalIn  = interpolate(frame, [Math.round(fps * 0.35), Math.round(fps * 1.0)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  // Background music: uploaded file takes priority over preset
  const bgMusicUrl = useMemo(
    () => config.bgMusicDataUrl
      ?? (config.bgMusicPreset ? getMusicPreset(config.bgMusicPreset as MusicPresetKey) : null),
    [config.bgMusicDataUrl, config.bgMusicPreset]
  );

  return (
    <AbsoluteFill style={bg.css}>
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

      {/* Background music preset — loops throughout the video */}
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
          {/* Intro pop — one-shot at frame 0 */}
          <Sequence from={0}>
            <Audio src={SFX_INTRO_WHOOSH} volume={config.sfxVolume * 0.75} />
          </Sequence>

          {/* Typing click — loops while characters are being typed */}
          {frame >= startTypingFrame && isTyping && (
            <Audio
              src={SFX_TYPE_CLICK}
              volume={config.sfxVolume * 0.55}
              // @ts-expect-error loop is valid but not yet in Remotion's types
              loop
            />
          )}

          {/* Zoom-in click — one-shot at scan start */}
          {config.scanEnabled && (
            <Sequence from={scanStartFrame}>
              <Audio src={SFX_ZOOM_IN} volume={config.sfxVolume * 0.75} />
            </Sequence>
          )}

          {/* Zoom-out click — one-shot when camera pulls back */}
          {config.scanEnabled && (
            <Sequence from={zoomOutStartFrame}>
              <Audio src={SFX_ZOOM_OUT} volume={config.sfxVolume * 0.75} />
            </Sequence>
          )}
        </>
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
                <div key={lineIdx} style={{
                  display: "flex",
                  minHeight: lineHeight,
                  background: lineIdx === highlightLineIdx ? "rgba(255,255,255,0.09)" : "transparent",
                  borderRadius: 2,
                }}>
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
                  <span style={{
                    flex: 1,
                    filter: lineIdx === highlightLineIdx ? "brightness(1.4)" : undefined,
                  }}>
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
      {/* ── Intro overlay ── shows for introDuration seconds before typing starts */}
      {config.introEnabled && (
        <AbsoluteFill
          style={{
            ...bg.css,
            zIndex: 50,
            opacity: introOverlayOpacity,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top half — subtitle + title */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 56,
            paddingLeft: 80,
            paddingRight: 80,
            gap: 20,
          }}>
            {config.introSubtitle.trim() && (
              <div style={{
                fontFamily: fontScale,
                fontSize: 36,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: '0.13em',
                textTransform: 'uppercase' as const,
                opacity: introTextIn,
              }}>
                {config.introSubtitle}
              </div>
            )}
            <div style={{
              fontFamily: fontScale,
              fontSize: 86,
              fontWeight: 800,
              color: '#ffffff',
              textAlign: 'center' as const,
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
              opacity: introTitleIn,
              transform: `translateY(${introTitleY}px)`,
            }}>
              {config.title || config.filename}
            </div>
          </div>

          {/* Bottom half — MetallicPaint */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: introMetalIn,
          }}>
            <div style={{ width: 860, height: 860 }}>
              <MetallicPaint
                imageSrc="/intro-shape.svg"
                speed={0.28}
                scale={4.5}
                refraction={0.012}
                blur={0.012}
                liquid={0.8}
                brightness={2.4}
                contrast={0.45}
                lightColor="#ffffff"
                darkColor="#0d0d1a"
                tintColor="#7c3aed"
                waveAmplitude={1.1}
                noiseScale={0.45}
              />
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
