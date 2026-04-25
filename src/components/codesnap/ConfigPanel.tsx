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
  Theme,
} from "@/lib/codesnap-types";
import { Mic, Upload, X } from "lucide-react";
import { useRef } from "react";
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
];

const BACKGROUNDS: { value: BackgroundStyle; label: string }[] = [
  { value: "ember-gradient", label: "Elow Glow" },
  { value: "voltage-gradient", label: "Voltage" },
  { value: "ink-grid", label: "Ink Grid" },
  { value: "paper-noise", label: "Paper Noise" },
  { value: "duotone-pop", label: "Duotone Pop" },
  { value: "custom-gradient", label: "Custom Gradient" },
  { value: "vercel-grain", label: "Vercel Grain" },
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

  const handleAudioFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Audio file too large", {
        description: "Maximum 10MB per file.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        audioDataUrl: reader.result as string,
        audioName: file.name,
      });
      toast.success("Music loaded", { description: file.name });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Tabs defaultValue="style" className="w-full">
      <TabsList
        className="grid w-full grid-cols-4 brutal-border h-auto p-0 rounded-none bg-paper"
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
          className="font-display text-xs rounded-none py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Anim · Audio
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
        <Field label="Background style">
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
          <Field label="Title">
            <Input
              value={config.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="font-mono brutal-border rounded-none"
              placeholder="e.g. Quicksort in 7 lines"
            />
          </Field>
        )}

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
                min={2}
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
    </Tabs>
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
