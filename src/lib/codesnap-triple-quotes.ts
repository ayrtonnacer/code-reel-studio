/**
 * Convierte bloques de triple comilla de Python ("""...""" o '''...''') en
 * comentarios `#`, para que el resto del pipeline (detección de comentarios,
 * narrativa, ajuste de ancho/wrap, resaltado) los trate igual que los `#`.
 *
 * Solo convierte bloques "standalone": la línea empieza con la triple comilla
 * (sin nada antes) y después del cierre no queda código en la misma línea.
 * NO toca strings asignados o usados como argumento:
 *
 *     x = """hola"""          -> se deja igual
 *     print("""hola""")       -> se deja igual
 *     texto = (               -> se deja igual (la línea anterior termina en "(")
 *         """hola"""
 *     )
 *
 * Los delimitadores que quedan solos en su línea (`"""`) se eliminan; las líneas
 * en blanco dentro del bloque quedan como `#` vacío, para que todo el bloque
 * siga siendo UN solo comentario consecutivo.
 */

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

function commentLine(indent: string, text: string): string {
  const t = text.trim();
  return t ? `${indent}# ${t}` : `${indent}#`;
}

export function normalizeTripleQuoteComments(code: string, language: string): string {
  if (language !== "python" || !code || (!code.includes('"""') && !code.includes("'''"))) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  const out: string[] = [];
  let inString: string | null = null; // dentro de un string triple que NO es un bloque standalone
  let prevCode = ""; // última línea no vacía (ya procesada)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inString) {
      const m = OPEN_RE.exec(trimmed);
      if (m && !CONTINUATION_END_RE.test(prevCode.trim())) {
        const delim = m[1];
        const indent = /^\s*/.exec(line)![0];
        const afterOpen = trimmed.slice(m[0].length);

        // Caso 1: abre y cierra en la misma línea -> comentario de una línea
        const sameLineEnd = afterOpen.indexOf(delim);
        if (sameLineEnd !== -1) {
          const tail = afterOpen.slice(sameLineEnd + 3).trim();
          if (tail === "") {
            const body = afterOpen.slice(0, sameLineEnd);
            out.push(commentLine(indent, body));
            prevCode = out[out.length - 1];
            continue;
          }
        } else {
          // Caso 2: bloque multilínea. Buscar la línea de cierre.
          let end = -1;
          for (let j = i + 1; j < lines.length; j++) {
            const idx = lines[j].indexOf(delim);
            if (idx !== -1) {
              end = j;
              break;
            }
          }
          if (end !== -1) {
            const closeIdx = lines[end].indexOf(delim);
            const tail = lines[end].slice(closeIdx + 3).trim();
            if (tail === "") {
              const block: string[] = [];
              const first = afterOpen.trim();
              if (first) block.push(commentLine(indent, first));
              for (let j = i + 1; j < end; j++) block.push(commentLine(indent, lines[j]));
              const last = lines[end].slice(0, closeIdx).trim();
              if (last) block.push(commentLine(indent, last));
              // quitar `#` vacíos al principio/final del bloque (los saltos de
              // línea pegados a las comillas), pero no los del medio
              while (block.length && block[0].trim() === "#") block.shift();
              while (block.length && block[block.length - 1].trim() === "#") block.pop();
              out.push(...block);
              if (block.length) prevCode = block[block.length - 1];
              i = end;
              continue;
            }
          }
        }
      }
    }

    // Línea normal: actualizar el estado de "dentro de un string triple"
    inString = scanTripleQuoteState(line, inString);
    out.push(line);
    if (trimmed) prevCode = line;
  }

  return out.join("\n");
}
