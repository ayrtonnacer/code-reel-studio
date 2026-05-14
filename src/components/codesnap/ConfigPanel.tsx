import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  BackgroundStyle,
  GradientDirection,
  Language,
  SnippetConfig,
  SubtitleBlock,
  Theme,
} from "@/lib/codesnap-types";
import { MUSIC_PRESETS } from "@/lib/codesnap-sfx";
import { parseSrt } from "@/lib/codesnap-subtitles";
import { Captions, FileUp, Image, Mic, Music, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { fetchRandomLiquidMetalPhoto } from "@/lib/codesnap-unsplash";
import { toast } from "sonner";

interface Props {
  config: SnippetConfig;
  onChange: (next: Partial<SnippetConfig>) => void;
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "tsx", label: "TSX" },
  { value: "jsx", label: "JSX" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "ruby", label: "Ruby" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "scale-dark", label: "Scale Dark" },
  { value: "synthwave", label: "Synthwave" },
  { value: "github-dark", label: "GitHub Dark" },
  { value: "monokai", label: "Monokai" },
  { value: "dracula", label: "Dracula" },
  { value: "paper-light", label: "Paper Light" },
  { value: "vercel-dark", label: "Vercel Dark" },
  { value: "chrome-y2k", label: "Chrome Y2K" },
];

const BACKGROUNDS: { value: BackgroundStyle; label: string }[] = [
  { value: "ember-gradient", label: "Elow Glow" },
  { value: "voltage-gradient", label: "Voltage" },
  { value: "ink-grid", label: "Ink Grid" },
  { value: "paper-noise", label: "Paper Noise" },
  { value: "duotone-pop", label: "Duotone Pop" },
  { value: "custom-gradient", label: "Custom Gradient" },
  { value: "vercel-grain", label: "Vercel Grain" },
  { value: "chrome-flat", label: "Chrome Flat" },
  { value: "silk", label: "Silk (animated)" },
];

const DIRECTIONS: { value: GradientDirection; label: string }[] = [
  { value: "135deg", label: "Diagonal ↘" },
  { value: "45deg", label: "Diagonal ↗" },
  { value: "to right", label: "Horizontal →" },
  { value: "to bottom", label: "Vertical ↓" },
  { value: "to bottom right", label: "Down-Right" },
  { value: "to bottom left", label: "Down-Left" },
  { value: "radial", label: "Radial Glow" },
];

export const ConfigPanel: React.FC<Props> = ({ config, onChange }) => {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const [unsplashLoading, setUnsplashLoading] = useState(false);

  const handleUnsplashRandom = async () => {
    setUnsplashLoading(true);
    try {
      const { imageUrl, credit, creditUrl, unsplashUrl } = await fetchRandomLiquidMetalPhoto();
      onChange({
        backgroundImageDataUrl: imageUrl,
        backgroundImageName: `Photo by ${credit} on Unsplash|${creditUrl}|${unsplashUrl}`,
        backgroundImageOverlay: 0.25,
      });
      toast.success("Foto cargada", { description: `Foto de ${credit} · Unsplash | ${creditUrl}` });
    } catch (err) {
      toast.error("Error al obtener la foto", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUnsplashLoading(false);
    }
  };

  const loadAudioFile = (file: File, onLoad: (dataUrl: string) => void) => {
    if (file.size > 30 * 1024 * 1024) {
      toast.error("Audio file too large", { description: "Maximum 30MB per file." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAudioFile = (file: File) =>
    loadAudioFile(file, (dataUrl) => {
      onChange({ audioDataUrl: dataUrl, audioName: file.name });
      toast.success("Voiceover loaded", { description: file.name });
    });

  const handleMusicFile = (file: File) =>
    loadAudioFile(file, (dataUrl) => {
      onChange({ bgMusicDataUrl: dataUrl, bgMusicName: file.name, bgMusicPreset: null });
      toast.success("Music loaded", { description: file.name });
    });

  const handleBgImageFile = (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image too large", { description: "Maximum 15MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ backgroundImageDataUrl: reader.result as string, backgroundImageName: file.name });
      toast.success("Background image loaded", { description: file.name });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Tabs defaultValue="style" className="w-full">
      <TabsList
        className="grid w-full grid-cols-5 brutal-border h-auto p-0 rounded-none bg-paper"
      >
        <TabsTrigger
          value="style"
          className="font-display text-xs rounded-none border-r-2 border-foreground py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Style
        </TabsTrigger>
        <TabsTrigger
          value="background"
          className="font-display text-xs rounded-none border-r-2 border-foreground py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Background
        </TabsTrigger>
        <TabsTrigger
          value="text"
          className="font-display text-xs rounded-none border-r-2 border-foreground py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Text
        </TabsTrigger>
        <TabsTrigger
          value="animation"
          className="font-display text-xs rounded-none border-r-2 border-foreground py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Anim · Audio
        </TabsTrigger>
        <TabsTrigger
          value="subs"
          className="font-display text-xs rounded-none py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Subs
        </TabsTrigger>
      </TabsList>

      {/* STYLE */}
      <TabsContent value="style" className="space-y-5 pt-5">
        <Field label="Filename">
          <Input
            value={config.filename}
            onChange={(e) => onChange({ filename: e.target.value })}
            className="font-mono brutal-border rounded-none"
          />
        </Field>

        <Field label="Language">
          <Select
            value={config.language}
            onValueChange={(v) => onChange({ language: v as Language })}
          >
            <SelectTrigger className="brutal-border rounded-none font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="brutal-border rounded-none">
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value} className="font-mono">
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Theme">
          <Select
            value={config.theme}
            onValueChange={(v) => onChange({ theme: v as Theme })}
          >
            <SelectTrigger className="brutal-border rounded-none font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="brutal-border rounded-none">
              {THEMES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="font-mono">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={`Font size · ${config.fontSize}px`}>
          <Slider
            value={[config.fontSize]}
            min={18}
            max={56}
            step={2}
            onValueChange={([v]) => onChange({ fontSize: v })}
          />
        </Field>

        <ToggleRow
          label="Line numbers"
          checked={config.showLineNumbers}
          onChange={(v) => onChange({ showLineNumbers: v })}
        />

        <ToggleRow
          label="Window chrome"
          checked={config.windowChrome}
          onChange={(v) => onChange({ windowChrome: v })}
        />
      </TabsContent>

      {/* BACKGROUND */}
      <TabsContent value="background" className="space-y-5 pt-5">

        {/* Background image upload */}
        <div className="brutal-border bg-concrete p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-mono text-xs tracking-wide flex items-center gap-2">
              <Image className="h-3 w-3" /> Background image
            </Label>
            {config.backgroundImageName && (
              <button
                onClick={() => onChange({ backgroundImageDataUrl: null, backgroundImageName: null })}
                className="font-mono text-[10px] tracking-wide flex items-center gap-1 hover:text-ember"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            )}
          </div>
          <input
            ref={bgImageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleBgImageFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => bgImageInputRef.current?.click()}
            className="w-full brutal-border bg-ink text-paper py-3 px-4 font-mono text-xs tracking-wide flex items-center justify-center gap-2 hover:bg-ember transition-colors"
          >
            <Upload className="h-4 w-4" />
            {config.backgroundImageName ?? "Upload image (JPG/PNG/WEBP)"}
          </button>
          <button
            onClick={handleUnsplashRandom}
            disabled={unsplashLoading}
            className="w-full brutal-border bg-paper py-3 px-4 font-mono text-xs tracking-wide flex items-center justify-center gap-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 ${unsplashLoading ? "animate-spin" : ""}`} />
            {unsplashLoading ? "Buscando..." : "Photo by Unsplash"}
          </button>
          {config.backgroundImageDataUrl && (
            <>
              <div
                className="h-20 brutal-border"
                style={{
                  backgroundImage: `url(${config.backgroundImageDataUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <Field label={`Dark overlay · ${Math.round(config.backgroundImageOverlay * 100)}%`}>
                <Slider
                  value={[config.backgroundImageOverlay]}
                  min={0} max={0.85} step={0.05}
                  onValueChange={([v]) => onChange({ backgroundImageOverlay: v })}
                />
              </Field>
            </>
          )}
          {!config.backgroundImageDataUrl && (
            <p className="text-[10px] font-mono text-muted-foreground">
              Replaces the gradient/preset background. JPG, PNG or WEBP — max 15 MB.
            </p>
          )}
        </div>

        <Field label="Background style (when no image)">
          <Select
            value={config.background}
            onValueChange={(v) => onChange({ background: v as BackgroundStyle })}
          >
            <SelectTrigger className="brutal-border rounded-none font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="brutal-border rounded-none">
              {BACKGROUNDS.map((b) => (
                <SelectItem key={b.value} value={b.value} className="font-mono">
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {config.background === "custom-gradient" && (
          <div className="space-y-4 brutal-border bg-concrete p-4">
            <Label className="font-mono text-xs tracking-wide text-muted-foreground">
              Custom gradient
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label="From"
                value={config.customGradient.from}
                onChange={(from) =>
                  onChange({
                    customGradient: { ...config.customGradient, from },
                  })
                }
              />
              <ColorField
                label="To"
                value={config.customGradient.to}
                onChange={(to) =>
                  onChange({
                    customGradient: { ...config.customGradient, to },
                  })
                }
              />
            </div>

            <Field label="Direction">
              <Select
                value={config.customGradient.direction}
                onValueChange={(v) =>
                  onChange({
                    customGradient: {
                      ...config.customGradient,
                      direction: v as GradientDirection,
                    },
                  })
                }
              >
                <SelectTrigger className="brutal-border rounded-none font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="brutal-border rounded-none">
                  {DIRECTIONS.map((d) => (
                    <SelectItem
                      key={d.value}
                      value={d.value}
                      className="font-mono"
                    >
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div
              className="h-16 brutal-border"
              style={{
                background:
                  config.customGradient.direction === "radial"
                    ? `radial-gradient(circle at 30% 20%, ${config.customGradient.from}, ${config.customGradient.to})`
                    : `linear-gradient(${config.customGradient.direction}, ${config.customGradient.from}, ${config.customGradient.to})`,
              }}
            />
          </div>
        )}

        {config.background === "silk" && (
          <p className="font-mono text-[10px] text-muted-foreground px-1">
            Fondo animado en loop (10 s). Se exporta frame a frame sincronizado con el video.
          </p>
        )}

        <Field label={`Padding · ${config.padding}px`}>
          <Slider
            value={[config.padding]}
            min={24}
            max={120}
            step={4}
            onValueChange={([v]) => onChange({ padding: v })}
          />
        </Field>
      </TabsContent>

      {/* TEXT */}
      <TabsContent value="text" className="space-y-5 pt-5">
        <ToggleRow
          label="Show title above card"
          checked={config.showTitle}
          onChange={(v) => onChange({ showTitle: v })}
        />

        {config.showTitle && (
          <>
            <Field label="Title">
              <Input
                value={config.title}
                onChange={(e) => onChange({ title: e.target.value })}
                className="font-mono brutal-border rounded-none"
                placeholder="e.g. Quicksort in 7 lines"
              />
            </Field>

            <Field label={`Title size · ${config.titleFontSize ?? 58}px`}>
              <Slider
                value={[config.titleFontSize ?? 58]}
                min={32}
                max={96}
                step={2}
                onValueChange={([v]) => onChange({ titleFontSize: v })}
              />
            </Field>

            <div className="brutal-border bg-concrete p-4 space-y-3">
              <Label className="font-mono text-xs tracking-wide text-muted-foreground">Title text color</Label>
              <div className="flex gap-2 flex-wrap">
                {["#ffffff", "#000000", "#f9fafb", "#1a1a1a", "#fbbf24", "#3b82f6", "#ec4899", "#10b981"].map(color => (
                  <button
                    key={color}
                    onClick={() => onChange({ titleColor: color })}
                    style={{
                      background: color,
                      width: 28,
                      height: 28,
                      border: config.titleColor === color ? "3px solid #ff5722" : "2px solid #666",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
              <ColorField label="Custom hex" value={config.titleColor} onChange={(v) => onChange({ titleColor: v })} />
            </div>

            <div className="brutal-border bg-concrete p-4 space-y-3">
              <ToggleRow
                label="Title background"
                checked={config.titleBgEnabled}
                onChange={(v) => onChange({ titleBgEnabled: v })}
              />
              {config.titleBgEnabled && (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {["#000000", "#ffffff", "#1a1a1a", "#f9fafb", "#1e1b4b", "#052e16"].map(color => (
                      <button
                        key={color}
                        onClick={() => onChange({ titleBgColor: color })}
                        style={{
                          background: color,
                          width: 28,
                          height: 28,
                          border: config.titleBgColor === color ? "3px solid #ff5722" : "2px solid #666",
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                  <ColorField label="Background color" value={config.titleBgColor} onChange={(v) => onChange({ titleBgColor: v })} />
                  <Field label={`Opacity · ${Math.round(config.titleBgOpacity * 100)}%`}>
                    <Slider
                      value={[config.titleBgOpacity]}
                      min={0.1}
                      max={1}
                      step={0.05}
                      onValueChange={([v]) => onChange({ titleBgOpacity: v })}
                    />
                  </Field>
                </>
              )}
            </div>
          </>
        )}

        {/* Outro / CTA */}
        <div className="brutal-border bg-concrete p-4 space-y-4">
          <ToggleRow
            label="Outro / CTA after scan"
            checked={config.outroEnabled}
            onChange={(v) => onChange({ outroEnabled: v })}
          />
          {config.outroEnabled && (
            <Field label="CTA text (typed after zoom-out)">
              <Input
                value={config.outroText}
                onChange={(e) => onChange({ outroText: e.target.value })}
                className="font-mono brutal-border rounded-none"
                placeholder='Escribe "code" para el repo'
              />
              <p className="text-[10px] font-mono text-muted-foreground mt-1">
                Appears as a comment line at the end of the code
              </p>
            </Field>
          )}
        </div>

        <Field label="Brand handle">
          <Input
            value={config.brandHandle}
            readOnly
            className="font-mono brutal-border rounded-none bg-concrete cursor-not-allowed opacity-80"
          />
        </Field>
      </TabsContent>

      {/* ANIMATION + AUDIO */}
      <TabsContent value="animation" className="space-y-5 pt-5">
        <Field label={`Typing speed · ${config.typingSpeed} chars/s`}>
          <Slider
            value={[config.typingSpeed]}
            min={8}
            max={80}
            step={2}
            onValueChange={([v]) => onChange({ typingSpeed: v })}
          />
        </Field>

        <Field label={`Start delay · ${config.startDelay.toFixed(1)}s`}>
          <Slider
            value={[config.startDelay]}
            min={0}
            max={3}
            step={0.1}
            onValueChange={([v]) => onChange({ startDelay: v })}
          />
        </Field>

        <Field label={`Hold at end · ${config.holdEnd.toFixed(1)}s`}>
          <Slider
            value={[config.holdEnd]}
            min={0}
            max={90}
            step={1}
            onValueChange={([v]) => onChange({ holdEnd: v })}
          />
        </Field>

        <ToggleRow
          label="Zoom & pan effect"
          checked={config.scanEnabled}
          onChange={(v) => onChange({ scanEnabled: v })}
        />

        {config.scanEnabled && (
          <>
            <div className="brutal-border bg-paper px-4 py-3 space-y-2">
              <Label className="font-mono text-xs tracking-wide text-muted-foreground">Scan mode</Label>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => onChange({ scanMode: "highlight-static" })}
                  className={`flex-1 py-2 font-mono text-xs brutal-border transition-colors ${config.scanMode !== "zoom-pan" ? "bg-ink text-paper" : "bg-paper hover:bg-concrete"}`}
                >
                  Highlight
                </button>
                <button
                  onClick={() => onChange({ scanMode: "zoom-pan" })}
                  className={`flex-1 py-2 font-mono text-xs brutal-border transition-colors ${config.scanMode === "zoom-pan" ? "bg-ink text-paper" : "bg-paper hover:bg-concrete"}`}
                >
                  Zoom & pan
                </button>
              </div>
            </div>

            <Field label={`Scan speed · ${config.scanSpeed.toFixed(2)} lines/s`}>
              <Slider
                value={[config.scanSpeed]}
                min={0.05}
                max={3}
                step={0.05}
                onValueChange={([v]) => onChange({ scanSpeed: v })}
              />
            </Field>

            <Field label={`Scan zoom · ${config.scanZoom.toFixed(1)}×`}>
              <Slider
                value={[config.scanZoom]}
                min={1}
                max={15}
                step={0.5}
                onValueChange={([v]) => onChange({ scanZoom: v })}
              />
            </Field>
          </>
        )}

        <ToggleRow
          label="Show cursor"
          checked={config.showCursor}
          onChange={(v) => onChange({ showCursor: v })}
        />

        {/* Sound effects */}
        <ToggleRow
          label="Sound effects (typing + zoom)"
          checked={config.sfxEnabled}
          onChange={(v) => onChange({ sfxEnabled: v })}
        />

        {config.sfxEnabled && (
          <Field label={`SFX volume · ${Math.round(config.sfxVolume * 100)}%`}>
            <Slider
              value={[config.sfxVolume]}
              min={0} max={1} step={0.05}
              onValueChange={([v]) => onChange({ sfxVolume: v })}
            />
          </Field>
        )}

        {/* Background music */}
        <div className="brutal-border bg-concrete p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="font-mono text-xs tracking-wide flex items-center gap-2">
              <Music className="h-3 w-3" /> Background music
            </Label>
            {config.bgMusicName && (
              <button
                onClick={() => onChange({ bgMusicDataUrl: null, bgMusicName: null })}
                className="font-mono text-[10px] tracking-wide flex items-center gap-1 hover:text-ember"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            )}
          </div>

          <input
            ref={musicInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleMusicFile(f);
              e.target.value = "";
            }}
          />

          <button
            onClick={() => musicInputRef.current?.click()}
            className="w-full brutal-border bg-ink text-paper py-3 px-4 font-mono text-xs tracking-wide flex items-center justify-center gap-2 hover:bg-ember transition-colors"
          >
            <Upload className="h-4 w-4" />
            {config.bgMusicName ?? "Upload music file"}
          </button>

          {!config.bgMusicDataUrl && (
            <Field label="Preset">
              <Select
                value={config.bgMusicPreset ?? "none"}
                onValueChange={(v) => onChange({ bgMusicPreset: v === "none" ? null : v })}
              >
                <SelectTrigger className="brutal-border rounded-none font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="brutal-border rounded-none">
                  <SelectItem value="none" className="font-mono">None</SelectItem>
                  {MUSIC_PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key} className="font-mono">
                      {p.label} — {p.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {(config.bgMusicDataUrl || config.bgMusicPreset) && (
            <>
              <Field label={`Volume · ${Math.round(config.bgMusicVolume * 100)}%`}>
                <Slider
                  value={[config.bgMusicVolume]}
                  min={0} max={1} step={0.05}
                  onValueChange={([v]) => onChange({ bgMusicVolume: v })}
                />
              </Field>
              <Field label={`Fade out · ${config.bgMusicFadeOut.toFixed(1)}s`}>
                <Slider
                  value={[config.bgMusicFadeOut]}
                  min={0} max={5} step={0.1}
                  onValueChange={([v]) => onChange({ bgMusicFadeOut: v })}
                />
              </Field>
            </>
          )}
        </div>

        {/* Audio block */}
        <div className="brutal-border bg-concrete p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="font-mono text-xs tracking-wide flex items-center gap-2">
              <Mic className="h-3 w-3" /> Voiceover
            </Label>
            {config.audioName && (
              <button
                onClick={() =>
                  onChange({ audioDataUrl: null, audioName: null })
                }
                className="font-mono text-[10px] tracking-wide flex items-center gap-1 hover:text-ember"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            )}
          </div>

          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAudioFile(f);
              e.target.value = "";
            }}
          />

          <button
            onClick={() => audioInputRef.current?.click()}
            className="w-full brutal-border bg-ink text-paper py-3 px-4 font-mono text-xs tracking-wide flex items-center justify-center gap-2 hover:bg-ember transition-colors"
          >
            <Upload className="h-4 w-4" />
            {config.audioName ?? "Upload audio file"}
          </button>

          {config.audioDataUrl && (
            <>
              <Field label={`Volume · ${Math.round(config.audioVolume * 100)}%`}>
                <Slider
                  value={[config.audioVolume]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => onChange({ audioVolume: v })}
                />
              </Field>
              <Field label={`Fade out · ${config.audioFadeOut.toFixed(1)}s`}>
                <Slider
                  value={[config.audioFadeOut]}
                  min={0}
                  max={5}
                  step={0.1}
                  onValueChange={([v]) => onChange({ audioFadeOut: v })}
                />
              </Field>
            </>
          )}
        </div>
      </TabsContent>

      {/* SUBTITLES */}
      <TabsContent value="subs" className="space-y-5 pt-5">
        <SubtitlesEditor config={config} onChange={onChange} />
      </TabsContent>
    </Tabs>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// SUBTITLES EDITOR
// ──────────────────────────────────────────────────────────────────────────

const SubtitlesEditor: React.FC<{
  config: SnippetConfig;
  onChange: (next: Partial<SnippetConfig>) => void;
}> = ({ config, onChange }) => {
  const srtFileInputRef = useRef<HTMLInputElement>(null);

  const updateBlock = (idx: number, patch: Partial<SubtitleBlock>) => {
    const next = config.subtitleBlocks.map((b, i) => i === idx ? { ...b, ...patch } : b);
    onChange({ subtitleBlocks: next });
  };
  const removeBlock = (idx: number) => {
    onChange({ subtitleBlocks: config.subtitleBlocks.filter((_, i) => i !== idx) });
  };
  const addBlock = () => {
    const last = config.subtitleBlocks[config.subtitleBlocks.length - 1];
    const startSec = last ? last.endSec : 0;
    onChange({
      subtitleBlocks: [...config.subtitleBlocks, { startSec, endSec: startSec + 1.5, text: "" }],
    });
  };

  const importSrtText = (srt: string) => {
    try {
      const blocks = parseSrt(srt);
      onChange({ subtitleScript: srt, subtitleBlocks: blocks, subtitlesEnabled: true });
      toast.success(`Importados ${blocks.length} bloques`);
    } catch (err) {
      toast.error("No se pudo importar el SRT", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleImportPasted = () => {
    if (!config.subtitleScript.trim()) {
      toast.error("Pegá el contenido del .srt primero");
      return;
    }
    importSrtText(config.subtitleScript);
  };

  const handleSrtFile = async (file: File) => {
    try {
      const text = await file.text();
      importSrtText(text);
    } catch (err) {
      toast.error("No se pudo leer el archivo", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const s = config.subtitleStyle;
  const setStyle = (patch: Partial<typeof s>) => onChange({ subtitleStyle: { ...s, ...patch } });

  return (
    <>
      <ToggleRow
        label="Subtítulos del guión"
        checked={config.subtitlesEnabled}
        onChange={(v) => onChange({ subtitlesEnabled: v })}
      />

      <Field label="Pegá el .srt (o subilo abajo)">
        <textarea
          value={config.subtitleScript}
          onChange={(e) => onChange({ subtitleScript: e.target.value })}
          rows={8}
          placeholder={"1\n00:00:00,000 --> 00:00:03,000\nPrimer subtítulo\n\n2\n00:00:03,000 --> 00:00:05,000\nSegundo subtítulo"}
          className="w-full font-mono text-xs brutal-border rounded-none bg-paper p-3 outline-none resize-y"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleImportPasted}
          className="brutal-border bg-ember text-paper py-3 px-3 font-mono text-xs tracking-wide flex items-center justify-center gap-2 hover:opacity-90"
        >
          <Captions className="h-4 w-4" />
          Importar SRT pegado
        </button>
        <button
          onClick={() => srtFileInputRef.current?.click()}
          className="brutal-border bg-ink text-paper py-3 px-3 font-mono text-xs tracking-wide flex items-center justify-center gap-2 hover:bg-ember"
        >
          <FileUp className="h-4 w-4" />
          Subir .srt
        </button>
        <input
          ref={srtFileInputRef}
          type="file"
          accept=".srt,text/plain,text/srt,application/x-subrip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSrtFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <p className="text-[10px] font-mono text-muted-foreground">
        Generá el .srt por fuera (Whisper en Colab, etc.) y pegalo o subilo. Los
        bloques se ordenan abajo y podés editar texto y tiempos uno por uno.
      </p>

      {/* Block list */}
      {config.subtitleBlocks.length > 0 && (
        <div className="brutal-border bg-concrete p-3 space-y-2 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between">
            <Label className="font-mono text-xs tracking-wide">
              Bloques ({config.subtitleBlocks.length})
            </Label>
            <button
              onClick={() => onChange({ subtitleBlocks: [] })}
              className="font-mono text-[10px] tracking-wide flex items-center gap-1 hover:text-ember"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          </div>
          {config.subtitleBlocks.map((b, i) => (
            <div key={i} className="brutal-border bg-paper p-2 space-y-1">
              <div className="flex gap-1 items-center">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={b.startSec.toFixed(2)}
                  onChange={(e) => updateBlock(i, { startSec: parseFloat(e.target.value) || 0 })}
                  className="w-16 font-mono text-[11px] bg-transparent outline-none brutal-border px-1 py-0.5"
                />
                <span className="font-mono text-[10px] text-muted-foreground">→</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={b.endSec.toFixed(2)}
                  onChange={(e) => updateBlock(i, { endSec: parseFloat(e.target.value) || 0 })}
                  className="w-16 font-mono text-[11px] bg-transparent outline-none brutal-border px-1 py-0.5"
                />
                <button
                  onClick={() => removeBlock(i)}
                  className="ml-auto p-1 hover:text-ember"
                  aria-label="Borrar bloque"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <input
                value={b.text}
                onChange={(e) => updateBlock(i, { text: e.target.value })}
                className="w-full font-mono text-xs bg-transparent outline-none brutal-border px-2 py-1"
              />
            </div>
          ))}
          <button
            onClick={addBlock}
            className="w-full font-mono text-[11px] tracking-wide brutal-border bg-paper py-2 hover:bg-ember hover:text-paper"
          >
            + Bloque manual
          </button>
        </div>
      )}

      {/* Style */}
      <div className="brutal-border bg-concrete p-4 space-y-4">
        <Label className="font-mono text-xs tracking-wide flex items-center gap-2">
          <Captions className="h-3 w-3" /> Estilo del subtítulo
        </Label>

        <Field label={`Tamaño · ${s.fontSize}px`}>
          <Slider
            value={[s.fontSize]} min={32} max={110} step={2}
            onValueChange={([v]) => setStyle({ fontSize: v })}
          />
        </Field>

        <Field label={`Peso · ${s.fontWeight}`}>
          <Slider
            value={[s.fontWeight]} min={400} max={900} step={100}
            onValueChange={([v]) => setStyle({ fontWeight: v })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Texto" value={s.color} onChange={(v) => setStyle({ color: v })} />
          <ColorField label="Borde" value={s.strokeColor} onChange={(v) => setStyle({ strokeColor: v })} />
        </div>

        <Field label={`Grosor del borde · ${s.strokeWidth}px`}>
          <Slider
            value={[s.strokeWidth]} min={0} max={16} step={1}
            onValueChange={([v]) => setStyle({ strokeWidth: v })}
          />
        </Field>

        <div className="brutal-border bg-paper px-4 py-3 space-y-2">
          <Label className="font-mono text-xs tracking-wide text-muted-foreground">Posición</Label>
          <div className="flex gap-2">
            <button
              onClick={() => setStyle({ position: "bottom" })}
              className={`flex-1 py-2 font-mono text-xs brutal-border transition-colors ${s.position === "bottom" ? "bg-ink text-paper" : "bg-paper hover:bg-concrete"}`}
            >
              Abajo (TikTok)
            </button>
            <button
              onClick={() => setStyle({ position: "center" })}
              className={`flex-1 py-2 font-mono text-xs brutal-border transition-colors ${s.position === "center" ? "bg-ink text-paper" : "bg-paper hover:bg-concrete"}`}
            >
              Centro
            </button>
          </div>
        </div>

        <ToggleRow
          label="Caja de fondo"
          checked={s.bgEnabled}
          onChange={(v) => setStyle({ bgEnabled: v })}
        />
        {s.bgEnabled && (
          <>
            <ColorField label="Color de caja" value={s.bgColor} onChange={(v) => setStyle({ bgColor: v })} />
            <Field label={`Opacidad · ${Math.round(s.bgOpacity * 100)}%`}>
              <Slider
                value={[s.bgOpacity]} min={0.1} max={1} step={0.05}
                onValueChange={([v]) => setStyle({ bgOpacity: v })}
              />
            </Field>
          </>
        )}
      </div>
    </>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="space-y-2">
    <Label className="font-mono text-xs tracking-wide text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between brutal-border bg-paper px-4 py-3">
    <Label className="font-mono text-sm tracking-wide cursor-pointer">
      {label}
    </Label>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const ColorField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <div className="space-y-2">
    <Label className="font-mono text-[10px] tracking-wide text-muted-foreground">
      {label}
    </Label>
    <div className="flex gap-2 items-center brutal-border bg-paper p-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 cursor-pointer bg-transparent border-0 p-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 font-mono text-xs bg-transparent outline-none"
      />
    </div>
  </div>
);
