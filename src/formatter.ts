import { Lexer } from "./lexer.js";
import type { Token } from "./token.js";

export interface FormatOptions { indentSize?: number }

const word = (token: Token | undefined): boolean => !!token && (token.type === "identifier" || token.type.startsWith("type") || ["let", "const", "fn", "type", "extends", "is", "return", "print", "if", "else", "while", "for", "in", "import", "export", "as", "from", "true", "false", "null", "number", "string"].includes(token.type) || token.type === "number" || token.type === "string");
const binary = new Set(["equal", "equalEqual", "bangEqual", "greater", "greaterEqual", "less", "lessEqual", "plus", "minus", "star", "slash", "percent", "and", "or", "pipe", "arrow"]);

/** Formats Wibufy source without changing token spelling or language aliases. */
export function formatWibufy(source: string, options: FormatOptions = {}): string {
  const indentSize = Math.max(1, Math.min(8, Math.trunc(options.indentSize ?? 4)));
  const tokens = new Lexer(source).scan().filter(t => t.type !== "eof");
  if (!tokens.length) return "";

  // The lexer intentionally ignores line comments. Reattach them by their original line.
  const comments = new Map<number, string[]>();
  source.split(/\r?\n/).forEach((text, index) => {
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < text.length - 1; i++) {
      const char = text[i]!;
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "/" && text[i + 1] === "/") {
        comments.set(index + 1, [...(comments.get(index + 1) ?? []), text.slice(i).trimEnd()]);
        break;
      }
    }
  });

  let out = "";
  let indent = 0;
  let parens = 0;
  let brackets = 0;
  let braces = 0;
  let line = tokens[0]!.line;
  let previous: Token | undefined;
  const pad = () => " ".repeat(indent * indentSize);
  const trim = () => { out = out.replace(/[ \t]+$/g, ""); };
  const newline = () => { trim(); if (out && !out.endsWith("\n")) out += "\n"; };
  const append = (value: string) => { if (!out || out.endsWith("\n")) out += pad(); out += value; };
  const space = () => { if (out && !/[\s]$/.test(out)) out += " "; };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const next = tokens[i + 1];
    const gap = token.line > line;
    if (gap && parens === 0 && brackets === 0 && braces > 0 && previous && ["newline", "semicolon"].includes(previous.type)) newline();

    if (token.type === "newline") {
      const continuation = !previous || binary.has(previous.type) || ["comma", "colon", "equal", "dot", "leftParen", "leftBracket"].includes(previous.type) || next?.type === "else";
      if (!continuation && parens === 0 && brackets === 0) newline();
      line = token.line;
      continue;
    }
    if (token.type === "leftBrace") {
      space(); append("{"); braces++; indent++;
      if (next?.type !== "rightBrace") newline();
    } else if (token.type === "rightBrace") {
      braces = Math.max(0, braces - 1); indent = Math.max(0, indent - 1);
      if (previous?.type !== "leftBrace") newline();
      append("}");
      if (next && !["else", "rightParen", "rightBracket", "comma", "semicolon", "dot"].includes(next.type)) newline();
    } else if (token.type === "leftParen" || token.type === "leftBracket") {
      if (token.type === "leftParen" && previous && ["if", "while"].includes(previous.lexeme)) space();
      append(token.lexeme); if (token.type === "leftParen") parens++; else brackets++;
    } else if (token.type === "rightParen" || token.type === "rightBracket") {
      trim(); append(token.lexeme); if (token.type === "rightParen") parens = Math.max(0, parens - 1); else brackets = Math.max(0, brackets - 1);
    } else if (token.type === "comma") { trim(); append(","); space(); }
    else if (token.type === "colon") { trim(); append(": "); }
    else if (token.type === "semicolon") { trim(); append(";"); newline(); }
    else if (binary.has(token.type)) { space(); append(token.lexeme); space(); }
    else if (token.type === "dot") { trim(); append("."); }
    else {
      if (previous && (word(previous) || previous.type === "rightParen" || previous.type === "rightBracket" || previous.type === "rightBrace" || previous.type === "comma")) space();
      append(token.lexeme);
    }
    previous = token;
    line = token.line;

    const lineComments = comments.get(token.line);
    if (lineComments && (i === tokens.length - 1 || !next || next.type === "newline" || next.line > token.line)) {
      space(); append(lineComments.join(" ")); newline();
    }
  }
  trim();
  const result = out.replace(/\n+$/g, "");
  return result ? `${result}\n` : "";
}
