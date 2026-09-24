import { describe, it, expect } from "vitest";
import {
  findDocBlocks,
  wrapDocBlocks,
  prepareRenderCode,
} from "@/lib/codesnap-triple-quotes";
import { tokenize } from "@/lib/codesnap-tokenize";
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

nombre = "Ana"  # Python deduce que es un String
edad = 25`;

describe("findDocBlocks", () => {
  it("finds a top-of-file multiline block", () => {
    const blocks = findDocBlocks(USER_EXAMPLE, "python");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[0].endLine).toBe(9);
    expect(USER_EXAMPLE.slice(blocks[0].startOffset, blocks[0].endOffset).startsWith('"""\nA diferencia')).toBe(true);
    expect(USER_EXAMPLE.slice(blocks[0].startOffset, blocks[0].endOffset).endsWith('programa.\n"""')).toBe(true);
  });

  it("handles one-liners, docstrings, ''' and indentation", () => {
    expect(findDocBlocks(`x = 1\n"""nota"""\ny = 2`, "python")).toMatchObject([{ startLine: 1, endLine: 1 }]);
    expect(findDocBlocks(`def f():\n    """Doc de f"""\n    return 1`, "python")).toMatchObject([{ startLine: 1, endLine: 1 }]);
    expect(findDocBlocks(`'''\nlinea 1\n'''\nx=1`, "python")).toMatchObject([{ startLine: 0, endLine: 2 }]);
    const code = `def f():\n    """\n    doc\n    """\n    return 1`;
    const [b] = findDocBlocks(code, "python");
    expect(code.slice(b.startOffset, b.endOffset)).toBe('"""\n    doc\n    """');
  });

  it("leaves real strings alone", () => {
    const strings = [
      `x = """hola"""\nprint(x)`,
      `print("""hola""")`,
      `texto = (\n    """hola"""\n)`,
      `x = """\nhello\n"""\nprint(x)`,
      `a = 1\n"""abc""" + b`,
      `# solo comentario\nx = 1`,
      `"""\nsin cierre\nx=1`,
    ];
    for (const s of strings) expect(findDocBlocks(s, "python")).toEqual([]);
  });

  it("only applies to python", () => {
    expect(findDocBlocks(`"""\nA\n"""`, "javascript")).toEqual([]);
  });
});

describe("tokenize", () => {
  it("paints the whole block, delimiters included, as a comment", () => {
    const tokens = tokenize(USER_EXAMPLE, "python");
    const comment = tokens.find((t) => t.type === "comment")!;
    expect(comment.text.startsWith('"""\nA diferencia')).toBe(true);
    expect(comment.text.endsWith('programa.\n"""')).toBe(true);
    // the code after the block is tokenized normally, and the `#` comment still works
    expect(tokens.some((t) => t.type === "comment" && t.text === "# Python deduce que es un String")).toBe(true);
    expect(tokens.some((t) => t.type === "string" && t.text === '"Ana"')).toBe(true);
    // token stream still reproduces the original text exactly
    expect(tokens.map((t) => t.text).join("")).toBe(USER_EXAMPLE);
  });

  it("does not treat a real assigned string as a comment", () => {
    const tokens = tokenize(`x = """hola"""`, "python");
    expect(tokens.some((t) => t.type === "comment")).toBe(false);
  });

  it("paints an indented docstring block", () => {
    const code = `def f():\n    """\n    doc\n    """\n    return 1`;
    const tokens = tokenize(code, "python");
    expect(tokens.find((t) => t.type === "comment")!.text).toBe('"""\n    doc\n    """');
    expect(tokens.map((t) => t.text).join("")).toBe(code);
  });
});

describe("parseNarrative with triple-quote blocks", () => {
  it("does not mistake '#' lines inside a block for comments", () => {
    const code = `x = 1\n"""\n# no soy un comentario\n"""\ny = 2`;
    const info = parseNarrative(code, "python");
    expect(info.narrativeLineIndices.size).toBe(0);
    expect(info.act1Code).toBe(code);
  });

  it("keeps a top block from ending the intro comments", () => {
    const code = `"""\nintro\n"""\n# otra intro\nx = 1\n# narrativa\ny = 2`;
    const info = parseNarrative(code, "python");
    expect([...info.introLineIndices]).toEqual([3]); // block lines are not '#'-intro lines
    expect(info.narrativeMap.get(6)).toBe("narrativa");
  });
});

describe("wrapDocBlocks", () => {
  it("wraps only lines inside blocks and keeps the delimiters", () => {
    const long = "palabra ".repeat(20).trim(); // 159 chars
    const code = `x = "${long}"\n"""\n${long}\n"""\ny = 2`;
    const out = wrapDocBlocks(code, "python", 40).split("\n");
    expect(out[0]).toBe(`x = "${long}"`); // code line untouched
    expect(out[1]).toBe('"""');
    expect(out.at(-2)).toBe('"""');
    expect(out.at(-1)).toBe("y = 2");
    const body = out.slice(2, -2);
    expect(body.length).toBeGreaterThan(1);
    expect(body.every((l) => l.length <= 40)).toBe(true);
    expect(body.join(" ")).toBe(long);
  });

  it("keeps the indentation of wrapped lines", () => {
    const code = `def f():\n    """\n    ${"hola ".repeat(20).trim()}\n    """`;
    const out = wrapDocBlocks(code, "python", 30).split("\n");
    for (const l of out.slice(2, -1)) expect(l.startsWith("    ")).toBe(true);
  });

  it("is idempotent and leaves short blocks untouched", () => {
    const once = wrapDocBlocks(USER_EXAMPLE, "python", 40);
    expect(wrapDocBlocks(once, "python", 40)).toBe(once);
    const short = `"""\nhola\n"""\nx = 1`;
    expect(wrapDocBlocks(short, "python", 40)).toBe(short);
  });

  it("still detects the block after wrapping", () => {
    const wrapped = wrapDocBlocks(USER_EXAMPLE, "python", 40);
    const blocks = findDocBlocks(wrapped, "python");
    expect(blocks).toHaveLength(1);
    expect(wrapped.slice(blocks[0].startOffset, blocks[0].endOffset).endsWith('\n"""')).toBe(true);
  });
});

describe("prepareRenderCode", () => {
  const base = { fontSize: 32, padding: 40, showLineNumbers: true, language: "python" };

  it("returns the code unchanged when there are no blocks", () => {
    const code = "x = 1\nprint(x)";
    expect(prepareRenderCode({ ...base, code }, 1080)).toBe(code);
  });

  it("keeps the user's triple quotes and never converts them to '#'", () => {
    const out = prepareRenderCode({ ...base, code: USER_EXAMPLE }, 1080);
    expect(out.startsWith('"""\nA diferencia')).toBe(true);
    expect(out).toContain('programa.\n"""\n\nnombre = "Ana"');
    expect(out.split("\n").filter((l) => l.startsWith("#"))).toEqual([]);
  });
});
