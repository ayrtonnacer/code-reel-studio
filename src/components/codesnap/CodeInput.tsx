import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export const CodeInput: React.FC<Props> = ({ value, onChange }) => {
  const lineCount = value.split("\n").length;
  const charCount = value.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-mono text-xs uppercase tracking-wider">
          Snippet
        </Label>
        <span className="font-mono text-[10px] text-muted-foreground">
          {lineCount} lines · {charCount} chars
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="font-mono text-sm min-h-[260px] brutal-border rounded-none bg-ink text-paper resize-y leading-relaxed"
        placeholder="Paste your code here..."
      />
    </div>
  );
};
