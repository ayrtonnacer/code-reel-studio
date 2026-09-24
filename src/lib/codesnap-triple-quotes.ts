/**
 * Bloques de triple comilla de Python ("""...""" o '''...''') que funcionan como
 * comentarios / docstrings.
 *
 * El video se comporta como un editor de código: estos bloques se muestran TAL
 * CUAL (con sus `"""` visibles) y se pintan con el color de comentario. Aquí solo
 * los detectamos y, si hace falta, ajustamos el ancho de sus líneas.
 *
 * Solo cuenta como bloque "standalone" el que empieza la línea con la triple
 * comilla (sin nada antes) y no deja código después del cierre. NO cuenta:
 *
 *     x = """hola"""          -> string asignado
 *     print("""hola""")       -> string como argumento
 *     texto = (               -> la línea anterior termina en "(": continuación
 *         """hola"""
 *     )
 */

export interface DocBlock {
  /** Primera y última línea del bloque (inclusive, base 0). */
  startLine: number;
  endLine: number;
  /** Offsets de caracteres en `code`: primer carácter del bloque (sin la
   *  indentación) y justo después del delimitador de cierre. */
  startOffset: number;
  endOffset: number;
}

const OPEN_RE = /^[rRuU]?("""|''')/;
// Si la línea anterior termina así, la triple comilla es continuación de una
// expresión (argumento, asignación, concatenación...), no un comentario/docstring.
const CONTINUATION_END_RE = /(=|\(|\[|\{|,|\\|\+|\band|\bor|\bnot|\breturn|\byield|\blambda)\s*$/;

function scanTripleQuoteState(line: string, state: string | null): string | null {
  let pos = 0;
  let inStr = state;
  while (pos < line.length) {
    if (inStr) {
      const end = line.indexOf(inStr, pos);
      if (end === -1) return inStr;
      inStr = null;
      pos = end + 3;
    } else {
      const a = line.indexOf('"""', pos);
      const b = line.indexOf("'''", pos);
      if (a === -1 && b === -1) return null;
      const useA = b === -1 || (a !== -1 && a < b);
      inStr = useA ? '"""' : "'''";
      pos = (useA ? a : b) + 3;
    }
  }
  return inStr;
}

/** Devuelve los bloques standalone de triple comilla (solo para Python). */
export function findDocBlocks(code: string, language: string): DocBlock[] {
  if (language !== "python" || !code || (!code.includes('"""') && !code.includes("'''"))) {
    return [];
  }

  const lines = code.split("\n");
  const lineStart: number[] = [];
  let offset = 0;
  for (const l of lines) {
    lineStart.push(offset);
    offset += l.length + 1;
  }

  const blocks: DocBlock[] = [];
  let inString: string | null = null; // dentro de un string triple que NO es un bloque standalone
  let prevCode = ""; // última línea no vacía (ya procesada)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inString) {
      const m = OPEN_RE.exec(trimmed);
      if (m && !CONTINUATION_END_RE.test(prevCode.trim())) {
        const delim = m[1];
        const indentLen = line.length - line.trimStart().length;
        const afterOpen = trimmed.slice(m[0].length);

        // Caso 1: abre y cierra en la misma línea
        const sameLineEnd = afterOpen.indexOf(delim);
        if (sameLineEnd !== -1) {
          if (afterOpen.slice(sameLineEnd + 3).trim() === "") {
            blocks.push({
              startLine: i,
              endLine: i,
              startOffset: lineStart[i] + indentLen,
              endOffset: lineStart[i] + indentLen + m[0].length + sameLineEnd + 3,
            });
            prevCode = line;
            continue;
          }
        } else {
          // Caso 2: bloque multilínea. Buscar la línea de cierre.
          let end = -1;
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].indexOf(delim) !== -1) {
              end = j;
              break;
            }
          }
          if (end !== -1) {
            const closeIdx = lines[end].indexOf(delim);
            if (lines[end].slice(closeIdx + 3).trim() === "") {
              blocks.push({
                startLine: i,
                endLine: end,
                startOffset: lineStart[i] + indentLen,
                endOffset: lineStart[end] + closeIdx + 3,
              });
              prevCode = lines[end];
              i = end;
              continue;
            }
          }
        }
      }
    }

    // Línea normal: actualizar el estado de "dentro de un string triple"
    inString = scanTripleQuoteState(line, inString);
    if (trimmed) prevCode = line;
  }

  return blocks;
}

/** Conjunto de índices de línea (base 0) que pertenecen a algún bloque. */
export function docBlockLineSet(code: string, language: string): Set<number> {
  const set = new Set<number>();
  for (const b of findDocBlocks(code, language)) {
    for (let i = b.startLine; i <= b.endLine; i++) set.add(i);
  }
  return set;
}

function wrapLine(line: string, maxChars: number): string[] {
  let rem = line.trimEnd();
  if (rem.length <= maxChars) return [rem];

  const indent = /^\s*/.exec(rem)![0];
  const parts: string[] = [];
  while (rem.length > maxChars) {
    let cut = rem.lastIndexOf(" ", maxChars);
    if (cut <= indent.length) {
      // sin punto de corte dentro del ancho: dejar la palabra entera
      cut = rem.indexOf(" ", maxChars);
      if (cut === -1) break;
    }
    parts.push(rem.slice(0, cut).trimEnd());
    rem = indent + rem.slice(cut).trimStart();
  }
  parts.push(rem);
  return parts;
}

/**
 * Ajusta al ancho de la tarjeta las líneas que están dentro de bloques de triple
 * comilla, cortando en espacios y conservando la indentación. No agrega ni quita
 * texto, así que los `"""` siguen exactamente donde el usuario los puso.
 */
export function wrapDocBlocks(code: string, language: string, maxChars: number): string {
  if (maxChars < 10) return code;
  const blocks = findDocBlocks(code, language);
  if (blocks.length === 0) return code;

  const inBlock = new Set<number>();
  for (const b of blocks) for (let i = b.startLine; i <= b.endLine; i++) inBlock.add(i);

  return code
    .split("\n")
    .flatMap((line, i) => (inBlock.has(i) ? wrapLine(line, maxChars) : [line]))
    .join("\n");
}

export interface RenderCodeOpts {
  code: string;
  language: string;
  fontSize: number;
  padding: number;
  showLineNumbers: boolean;
}

/**
 * Código listo para preview/export: los bloques de triple comilla quedan
 * ajustados al mismo ancho de línea que usa la composición (mismo cálculo que
 * `maxCharsPerLine` en CodeComposition).
 */
export function prepareRenderCode(opts: RenderCodeOpts, videoWidth: number): string {
  const { code, language, fontSize, padding, showLineNumbers } = opts;
  if (findDocBlocks(code, language).length === 0) return code;

  const charWidth = fontSize * 0.6;
  const maxFor = (lineCount: number) => {
    const lineNumWidth = showLineNumbers ? (String(lineCount).length + 1) * charWidth + 24 : 0;
    const codeAreaWidth = videoWidth - padding * 4;
    return Math.max(20, Math.floor((codeAreaWidth - lineNumWidth) / charWidth));
  };

  // El ancho depende de cuántos dígitos tiene el número de línea, que a su vez
  // depende de cuántas líneas quedan tras ajustar: iterar hasta estabilizar.
  let out = code;
  let lineCount = code.split("\n").length;
  for (let n = 0; n < 3; n++) {
    out = wrapDocBlocks(code, language, maxFor(lineCount));
    const next = out.split("\n").length;
    if (String(next).length === String(lineCount).length) break;
    lineCount = next;
  }
  return out;
}
