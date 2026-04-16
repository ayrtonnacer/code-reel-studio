// Lightweight, dependency-free tokenizer for the most common languages we care about.
// Returns an array of { text, type } per logical token, preserving whitespace.

import type { Language } from "./codesnap-types";

export type TokenType =
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "function"
  | "variable"
  | "punctuation"
  | "plain";

export interface Token {
  text: string;
  type: TokenType;
}

const KEYWORDS: Record<Language, string[]> = {
  javascript: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","new","class","extends","this","import","export","from","default","async","await","try","catch","finally","throw","typeof","in","of","null","undefined","true","false"],
  typescript: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","new","class","extends","implements","this","import","export","from","default","async","await","try","catch","finally","throw","typeof","in","of","null","undefined","true","false","interface","type","enum","public","private","protected","readonly","as"],
  tsx: ["const","let","var","function","return","if","else","for","while","new","class","import","export","from","default","async","await","interface","type","as","null","undefined","true","false"],
  jsx: ["const","let","var","function","return","if","else","for","while","new","class","import","export","from","default","async","await","null","undefined","true","false"],
  python: ["def","return","if","elif","else","for","while","in","not","and","or","class","import","from","as","with","try","except","finally","raise","lambda","yield","pass","break","continue","None","True","False","self","async","await","is","global","nonlocal"],
  go: ["package","import","func","return","if","else","for","range","switch","case","default","break","continue","var","const","type","struct","interface","map","chan","go","defer","select","nil","true","false"],
  rust: ["fn","let","mut","const","return","if","else","for","while","loop","match","struct","enum","impl","trait","pub","use","mod","crate","self","Self","as","ref","move","async","await","true","false","Some","None","Ok","Err"],
  ruby: ["def","end","if","elsif","else","unless","while","until","for","do","return","class","module","require","include","attr_accessor","attr_reader","attr_writer","nil","true","false","self","yield","begin","rescue","ensure","raise"],
  java: ["public","private","protected","class","interface","extends","implements","return","if","else","for","while","do","switch","case","break","continue","new","this","static","final","void","int","long","double","float","boolean","char","String","null","true","false","try","catch","finally","throw","throws","import","package"],
  csharp: ["public","private","protected","internal","class","interface","struct","return","if","else","for","while","do","switch","case","break","continue","new","this","static","readonly","void","int","long","double","float","bool","string","null","true","false","try","catch","finally","throw","using","namespace","var","async","await"],
  cpp: ["int","long","double","float","char","void","bool","auto","const","static","class","struct","public","private","protected","return","if","else","for","while","do","switch","case","break","continue","new","delete","this","namespace","using","template","typename","true","false","nullptr","include"],
  bash: ["if","then","else","elif","fi","for","in","do","done","while","case","esac","function","return","echo","exit","export","local","read","true","false"],
  sql: ["SELECT","FROM","WHERE","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","DROP","ALTER","JOIN","LEFT","RIGHT","INNER","OUTER","ON","GROUP","BY","ORDER","HAVING","LIMIT","OFFSET","AS","AND","OR","NOT","NULL","TRUE","FALSE","PRIMARY","KEY","FOREIGN","REFERENCES","INDEX","UNIQUE","DEFAULT"],
  html: [],
  css: [],
  json: ["true","false","null"],
};

const COMMENT_LINE: Partial<Record<Language, RegExp>> = {
  javascript: /^\/\/[^\n]*/,
  typescript: /^\/\/[^\n]*/,
  tsx: /^\/\/[^\n]*/,
  jsx: /^\/\/[^\n]*/,
  go: /^\/\/[^\n]*/,
  rust: /^\/\/[^\n]*/,
  java: /^\/\/[^\n]*/,
  csharp: /^\/\/[^\n]*/,
  cpp: /^\/\/[^\n]*/,
  python: /^#[^\n]*/,
  ruby: /^#[^\n]*/,
  bash: /^#[^\n]*/,
  sql: /^--[^\n]*/,
};

const COMMENT_BLOCK: Partial<Record<Language, RegExp>> = {
  javascript: /^\/\*[\s\S]*?\*\//,
  typescript: /^\/\*[\s\S]*?\*\//,
  tsx: /^\/\*[\s\S]*?\*\//,
  jsx: /^\/\*[\s\S]*?\*\//,
  go: /^\/\*[\s\S]*?\*\//,
  rust: /^\/\*[\s\S]*?\*\//,
  java: /^\/\*[\s\S]*?\*\//,
  csharp: /^\/\*[\s\S]*?\*\//,
  cpp: /^\/\*[\s\S]*?\*\//,
  css: /^\/\*[\s\S]*?\*\//,
};

export function tokenize(code: string, language: Language): Token[] {
  const tokens: Token[] = [];
  const keywords = new Set(KEYWORDS[language] ?? []);
  const lineComment = COMMENT_LINE[language];
  const blockComment = COMMENT_BLOCK[language];

  let i = 0;
  const push = (text: string, type: TokenType) => {
    if (!text) return;
    tokens.push({ text, type });
  };

  while (i < code.length) {
    const rest = code.slice(i);

    // whitespace / newline preserved as plain
    const wsMatch = rest.match(/^[ \t\n]+/);
    if (wsMatch) {
      push(wsMatch[0], "plain");
      i += wsMatch[0].length;
      continue;
    }

    if (blockComment) {
      const m = rest.match(blockComment);
      if (m) {
        push(m[0], "comment");
        i += m[0].length;
        continue;
      }
    }
    if (lineComment) {
      const m = rest.match(lineComment);
      if (m) {
        push(m[0], "comment");
        i += m[0].length;
        continue;
      }
    }

    // strings: ", ', `
    const strMatch = rest.match(/^("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    if (strMatch) {
      push(strMatch[0], "string");
      i += strMatch[0].length;
      continue;
    }

    // numbers
    const numMatch = rest.match(/^-?\d+(\.\d+)?/);
    if (numMatch) {
      push(numMatch[0], "number");
      i += numMatch[0].length;
      continue;
    }

    // identifier / keyword / function call
    const idMatch = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (idMatch) {
      const word = idMatch[0];
      const after = code[i + word.length];
      if (keywords.has(word) || keywords.has(word.toUpperCase())) {
        push(word, "keyword");
      } else if (after === "(") {
        push(word, "function");
      } else if (/^[A-Z]/.test(word)) {
        push(word, "variable");
      } else {
        push(word, "plain");
      }
      i += word.length;
      continue;
    }

    // punctuation / symbols
    const symMatch = rest.match(/^[{}()[\]<>,.;:!?+\-*/%=&|^~@#]/);
    if (symMatch) {
      push(symMatch[0], "punctuation");
      i += symMatch[0].length;
      continue;
    }

    // fallback: 1 char
    push(rest[0], "plain");
    i += 1;
  }

  return tokens;
}
