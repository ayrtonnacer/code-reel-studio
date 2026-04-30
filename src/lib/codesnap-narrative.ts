export interface NarrativeInfo {
  introLineIndices: Set<number>;
  narrativeLineIndices: Set<number>;
  /** codeLineIdx → stripped comment text */
  narrativeMap: Map<number, string>;
  /** narrativeLineIdx → codeLineIdx it describes */
  narrativeByCommentLine: Map<number, number>;
  /** config.code with narrative comment lines removed — used for Act 1 typing */
  act1Code: string;
  hasNarrativeComments: boolean;
}

function isCommentLine(line: string, lang: string): boolean {
  const t = line.trim();
  if (!t) return false;
  switch (lang) {
    case "python": case "ruby": case "bash": return t.startsWith("#");
    case "sql": return t.startsWith("--");
    case "html": return t.startsWith("<!--");
    case "css": return t.startsWith("/*");
    default: return t.startsWith("//") || t.startsWith("/*");
  }
}

function stripCommentPrefix(line: string, lang: string): string {
  const t = line.trim();
  switch (lang) {
    case "python": case "ruby": case "bash":
      return t.replace(/^#+\s?/, "");
    case "sql":
      return t.replace(/^--\s?/, "");
    case "html":
      return t.replace(/^<!--\s?/, "").replace(/\s?-->$/, "");
    case "css":
      return t.replace(/^\/\*+\s?/, "").replace(/\s?\*+\/$/, "");
    default:
      return t.replace(/^\/\/+\s?/, "");
  }
}

/**
 * Wraps long lines at word boundaries.
 * Used on act1Code so lines never overflow the code card.
 */
export function autoWrapCode(code: string, maxChars: number): string {
  if (maxChars < 10) return code;
  return code
    .split("\n")
    .map((line) => {
      if (line.length <= maxChars) return line;
      const indent = /^(\s*)/.exec(line)?.[1] ?? "";
      const cont = indent + "  ";
      const parts: string[] = [];
      let rem = line;
      while (rem.length > maxChars) {
        let cut = maxChars;
        const sp = rem.lastIndexOf(" ", maxChars - 1);
        if (sp > indent.length) cut = sp;
        parts.push(rem.slice(0, cut));
        rem = cont + rem.slice(cut).trimStart();
      }
      if (rem) parts.push(rem);
      return parts.join("\n");
    })
    .join("\n");
}

/** Returns the comment prefix string for a given language. */
export function getCommentLinePrefix(lang: string): string {
  switch (lang) {
    case "python": case "ruby": case "bash": return "# ";
    case "sql": return "-- ";
    case "html": return "<!-- ";
    case "css": return "/* ";
    default: return "// ";
  }
}

/**
 * Splits code into:
 * - intro comments (leading block before first code line)
 * - narrative comments (comment-only lines inside code that describe the next code line)
 * - act1Code (code without narrative comment lines — used for typing Act 1)
 */
export function parseNarrative(code: string, lang: string): NarrativeInfo {
  const lines = code.split("\n");

  // Step 1 — find intro block: consecutive comment/blank lines at the very top
  const introLineIndices = new Set<number>();
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "") { i++; continue; }
    if (isCommentLine(lines[i], lang)) { introLineIndices.add(i); i++; continue; }
    break; // first real code line
  }

  // Step 2 — find narrative comments: comment-only lines after the intro block
  const narrativeLineIndices = new Set<number>();
  const narrativeMap = new Map<number, string>();
  const narrativeByCommentLine = new Map<number, number>();

  let j = i;
  while (j < lines.length) {
    if (!isCommentLine(lines[j], lang)) { j++; continue; }

    // Collect consecutive comment lines as one block
    const texts: string[] = [];
    const idxs: number[] = [];
    while (j < lines.length && isCommentLine(lines[j], lang)) {
      texts.push(stripCommentPrefix(lines[j], lang));
      idxs.push(j);
      j++;
    }

    // Skip trailing blank lines between comment block and the next code line
    let nextCode = j;
    while (nextCode < lines.length && lines[nextCode].trim() === "") nextCode++;

    // Associate with the next code line (not another comment)
    if (nextCode < lines.length && !isCommentLine(lines[nextCode], lang)) {
      const commentText = texts.join(" ");
      idxs.forEach((idx) => {
        narrativeLineIndices.add(idx);
        narrativeByCommentLine.set(idx, nextCode);
      });
      narrativeMap.set(nextCode, commentText);
    }
    // else: trailing comment at end of file — keep as-is (part of code)
  }

  const act1Code = lines
    .filter((_, idx) => !narrativeLineIndices.has(idx))
    .join("\n");

  return {
    introLineIndices,
    narrativeLineIndices,
    narrativeMap,
    narrativeByCommentLine,
    act1Code,
    hasNarrativeComments: narrativeLineIndices.size > 0,
  };
}
