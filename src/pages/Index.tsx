import { useState } from "react";
import { CodeInput } from "@/components/codesnap/CodeInput";
import { ConfigPanel } from "@/components/codesnap/ConfigPanel";
import { PreviewPlayer } from "@/components/codesnap/PreviewPlayer";
import { ExportDialog } from "@/components/codesnap/ExportDialog";
import { DEFAULT_CONFIG, type SnippetConfig } from "@/lib/codesnap-types";
import { Film, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [config, setConfig] = useState<SnippetConfig>(DEFAULT_CONFIG);
  const [exportOpen, setExportOpen] = useState(false);

  const update = (next: Partial<SnippetConfig>) =>
    setConfig((prev) => ({ ...prev, ...next }));

  return (
    <div className="min-h-screen bg-paper text-ink">
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        config={config}
      />

      {/* Header */}
      <header className="brutal-border border-t-0 border-l-0 border-r-0 bg-paper sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="brutal-border bg-ink text-paper p-2">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl leading-none tracking-tight">
                CodeSnap Video
              </h1>
              <p className="font-mono text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">
                Code → Vertical Video · TikTok / Reels / Shorts
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider bg-voltage text-ink px-3 py-1 brutal-border">
              v0.2 · Internal
            </span>
            <Button
              size="sm"
              className="brutal-border brutal-shadow-sm bg-ember text-white hover:bg-ember/90 font-mono uppercase rounded-none"
              onClick={() => setExportOpen(true)}
            >
              <Download className="mr-2 h-4 w-4" /> Export MP4
            </Button>
          </div>
        </div>
        {/* Voltage strip */}
        <div className="h-2 bg-ember" />
      </header>

      {/* Main grid */}
      <main className="max-w-[1600px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,420px)] gap-8">
        {/* Left column: editor + config */}
        <section className="space-y-6">
          <div className="brutal-border brutal-shadow bg-paper p-5">
            <CodeInput
              value={config.code}
              onChange={(code) => update({ code })}
            />
          </div>

          <div className="brutal-border brutal-shadow bg-paper p-5">
            <ConfigPanel config={config} onChange={update} />
          </div>
        </section>

        {/* Right column: preview */}
        <aside className="lg:sticky lg:top-28 lg:self-start space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl uppercase">Preview</h2>
            <span className="font-mono text-[11px] uppercase tracking-wider bg-ink text-paper px-2 py-1">
              9:16
            </span>
          </div>
          <PreviewPlayer config={config} />
          <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
            Live preview renders the same Remotion composition the export pipeline
            will use. Tweak settings on the left — preview updates instantly.
          </p>
        </aside>
      </main>

      {/* Footer */}
      <footer className="brutal-border border-b-0 border-l-0 border-r-0 mt-16 py-6">
        <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Built with Remotion + React
          </span>
          <span className="font-display text-sm uppercase tracking-widest">
            Code · In · Motion
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
