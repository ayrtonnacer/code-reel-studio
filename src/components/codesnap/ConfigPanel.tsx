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
  Language,
  SnippetConfig,
  Theme,
} from "@/lib/codesnap-types";

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
];

const BACKGROUNDS: { value: BackgroundStyle; label: string }[] = [
  { value: "ember-gradient", label: "Ember Glow" },
  { value: "voltage-gradient", label: "Voltage" },
  { value: "ink-grid", label: "Ink Grid" },
  { value: "paper-noise", label: "Paper Noise" },
  { value: "duotone-pop", label: "Duotone Pop" },
];

export const ConfigPanel: React.FC<Props> = ({ config, onChange }) => {
  return (
    <Tabs defaultValue="style" className="w-full">
      <TabsList
        className="grid w-full grid-cols-3 brutal-border h-auto p-0 rounded-none bg-paper"
      >
        <TabsTrigger
          value="style"
          className="font-display uppercase tracking-wide text-sm rounded-none border-r-2 border-foreground py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Style
        </TabsTrigger>
        <TabsTrigger
          value="background"
          className="font-display uppercase tracking-wide text-sm rounded-none border-r-2 border-foreground py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Background
        </TabsTrigger>
        <TabsTrigger
          value="animation"
          className="font-display uppercase tracking-wide text-sm rounded-none py-3 data-[state=active]:bg-ink data-[state=active]:text-paper"
        >
          Animation
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

        <Field label={`Padding · ${config.padding}px`}>
          <Slider
            value={[config.padding]}
            min={24}
            max={120}
            step={4}
            onValueChange={([v]) => onChange({ padding: v })}
          />
        </Field>

        <Field label="Brand handle">
          <Input
            value={config.brandHandle}
            onChange={(e) => onChange({ brandHandle: e.target.value })}
            className="font-mono brutal-border rounded-none"
          />
        </Field>
        <Field label="Hashtag">
          <Input
            value={config.brandHashtag}
            onChange={(e) => onChange({ brandHashtag: e.target.value })}
            className="font-mono brutal-border rounded-none"
          />
        </Field>
      </TabsContent>

      {/* ANIMATION */}
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
            max={5}
            step={0.1}
            onValueChange={([v]) => onChange({ holdEnd: v })}
          />
        </Field>
        <ToggleRow
          label="Show cursor"
          checked={config.showCursor}
          onChange={(v) => onChange({ showCursor: v })}
        />
      </TabsContent>
    </Tabs>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="space-y-2">
    <Label className="font-mono text-xs uppercase tracking-wider">{label}</Label>
    {children}
  </div>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between brutal-border bg-paper px-4 py-3">
    <Label className="font-mono text-sm uppercase tracking-wide cursor-pointer">
      {label}
    </Label>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);
