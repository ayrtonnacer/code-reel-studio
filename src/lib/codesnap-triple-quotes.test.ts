import { describe, it, expect } from "vitest";
import { normalizeTripleQuoteComments as N } from "@/lib/codesnap-triple-quotes";
import { parseNarrative } from "@/lib/codesnap-narrative";

const USER_EXAMPLE = `"""
A diferencia de lenguajes como C, C++ o Java (que tienen "tipado estático" y 
requieren especificar el tipo, ej: int edad = 25;), Python utiliza "tipado dinámico".

¿Qué significa tipado dinámico?
1. No necesitas declarar el tipo de variable de forma explícita.
2. El intérprete de Python deduce el tipo de dato automáticamente en tiempo de 
   ejecución según el valor que le asignas.
3. Una variable puede cambiar de tipo durante la ejecución del programa.
"""
edad = 25
print(type(edad))`;

describe("normalizeTripleQuoteComments", () => {
  it("converts a top-of-file multiline block into # comments", () => {
    const out = N(USER_EXAMPLE, "python").split("\n");
    expect(out).toHaveLength(10);
    expect(out.slice(0, 8).every((l) => l.startsWith("#"))).toBe(true);
    expect(out[2]).toBe("#"); // blank paragraph separator
    expect(out.slice(8)).toEqual(["edad = 25", "print(type(edad))"]);
    expect(out.join("\n")).not.toContain('"""');
  });

  it("makes the block visible to parseNarrative as intro comment lines", () => {
    const info = parseNarrative(N(USER_EXAMPLE, "python"), "python");
    expect(info.introLineIndices.size).toBe(8);
  });

  it("turns a mid-file block into a narrative comment for the next code line", () => {
    const info = parseNarrative(N(`x = 1\n"""\nAhora sumamos\n\ny otra cosa\n"""\ny = x + 1`, "python"), "python");
    expect(info.narrativeMap.get(4)).toBe("Ahora sumamos y otra cosa");
    expect(info.act1Code).toBe("x = 1\ny = x + 1");
  });

  it("handles one-liners, docstrings, ''' and CRLF", () => {
    expect(N(`x = 1\n"""nota"""\ny = 2`, "python")).toBe("x = 1\n# nota\ny = 2");
    expect(N(`def f():\n    """Doc de f"""\n    return 1`, "python")).toBe("def f():\n    # Doc de f\n    return 1");
    expect(N(`'''\nlinea 1\nlinea 2\n'''\nx=1`, "python")).toBe("# linea 1\n# linea 2\nx=1");
    expect(N(`"""texto\nmás texto"""\nx=1`, "python")).toBe("# texto\n# más texto\nx=1");
    expect(N('"""\r\nA\r\n"""\r\nx=1', "python")).toBe("# A\nx=1");
  });

  it("trims blank edges but keeps inner paragraph separators", () => {
    expect(N(`"""\n\nA\n\nB\n\n"""\nx=1`, "python")).toBe("# A\n#\n# B\nx=1");
  });

  it("leaves real strings untouched", () => {
    const untouched = [
      `x = """hola"""\nprint(x)`,
      `print("""hola""")`,
      `texto = (\n    """hola"""\n)`,
      `x = """\nhello\n"""\nprint(x)`,
      `a = 1\n"""abc""" + b`,
      `# solo comentario\nx = 1`,
      `"""\nsin cierre\nx=1`,
    ];
    for (const u of untouched) expect(N(u, "python")).toBe(u);
  });

  it("only applies to python", () => {
    const js = `"""\nA\n"""`;
    expect(N(js, "javascript")).toBe(js);
  });
});
