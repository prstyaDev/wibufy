import type { Token, TokenType } from "./token.js";
import { formatDiagnostic } from "./diagnostics.js";

const keywords: Record<string, TokenType> = {
  fn: "fn", koto: "fn",
  let: "let", const: "const", senpai: "const",
  return: "return", print: "print", if: "if", else: "else", while: "while", for: "for", in: "in",
  Array: "typeArray", Object: "typeObject",
  true: "true", sugoi: "true", false: "false", muri: "false", null: "null",
  number: "typeNumber", string: "typeString", boolean: "typeBoolean", void: "typeVoid",
  and: "and", or: "or",
};

export class Lexer {
  private tokens: Token[] = [];
  private start = 0;
  private current = 0;
  private line = 1;
  private column = 1;
  private startColumn = 1;
  private startLine = 1;
  constructor(private readonly source: string, private readonly sourceName = "<source>") {}

  scan(): Token[] {
    while (!this.end()) {
      this.start = this.current;
      this.startColumn = this.column;
      this.startLine = this.line;
      this.scanToken();
    }
    this.tokens.push({ type: "eof", lexeme: "", literal: null, line: this.line, column: this.column });
    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();
    switch (c) {
      case "(": return this.add("leftParen"); case ")": return this.add("rightParen");
      case "{": return this.add("leftBrace"); case "}": return this.add("rightBrace");
      case "[": return this.add("leftBracket"); case "]": return this.add("rightBracket");
      case ".": return this.add("dot");
      case ":": return this.add("colon"); case ",": return this.add("comma");
      case ";": return this.add("semicolon"); case "|": return this.add(this.match("|") ? "or" : "pipe");
      case "+": return this.add("plus"); case "-": return this.add(this.match(">") ? "arrow" : "minus");
      case "*": return this.add("star"); case "%": return this.add("percent");
      case "/": if (this.match("/")) { while (this.peek() !== "\n" && !this.end()) this.advance(); } else this.add("slash"); return;
      case "!": return this.add(this.match("=") ? "bangEqual" : "bang");
      case "=": return this.add(this.match("=") ? "equalEqual" : "equal");
      case ">": return this.add(this.match("=") ? "greaterEqual" : "greater");
      case "<": return this.add(this.match("=") ? "lessEqual" : "less");
      case "&": if (this.match("&")) return this.add("and"); throw this.error("Expected '&' after '&'.");
      case " ": case "\r": case "\t": return;
      case "\n": this.tokens.push({ type: "newline", lexeme: "\n", literal: null, line: this.startLine, column: this.startColumn }); return;
      case '"': return this.string();
      default:
        if (this.digit(c)) return this.number();
        if (this.alpha(c)) return this.identifier();
        throw this.error(`Unexpected character '${c}'.`);
    }
  }

  private string(): void {
    while (this.peek() !== '"' && !this.end()) {
      this.advance();
    }
    if (this.end()) throw this.error("Unterminated string.");
    this.advance();
    this.tokens.push({ type: "string", lexeme: this.source.slice(this.start, this.current), literal: this.source.slice(this.start + 1, this.current - 1), line: this.startLine, column: this.startColumn });
  }

  private number(): void {
    while (this.digit(this.peek())) this.advance();
    if (this.peek() === "." && this.digit(this.peekNext())) { this.advance(); while (this.digit(this.peek())) this.advance(); }
    const text = this.source.slice(this.start, this.current);
    this.tokens.push({ type: "number", lexeme: text, literal: Number(text), line: this.startLine, column: this.startColumn });
  }

  private identifier(): void {
    while (this.alphaNum(this.peek())) this.advance();
    const text = this.source.slice(this.start, this.current);
    this.add(keywords[text] ?? "identifier");
  }

  private add(type: TokenType): void {
    this.tokens.push({ type, lexeme: this.source.slice(this.start, this.current), literal: null, line: this.startLine, column: this.startColumn });
  }
  private advance(): string { const c = this.source[this.current++] ?? ""; if (c === "\n") { this.line++; this.column = 1; } else this.column++; return c; }
  private match(c: string): boolean { if (this.end() || this.source[this.current] !== c) return false; this.current++; this.column++; return true; }
  private peek(): string { return this.source[this.current] ?? "\0"; }
  private peekNext(): string { return this.source[this.current + 1] ?? "\0"; }
  private end(): boolean { return this.current >= this.source.length; }
  private digit(c: string): boolean { return c >= "0" && c <= "9"; }
  private alpha(c: string): boolean { return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_"; }
  private alphaNum(c: string): boolean { return this.alpha(c) || this.digit(c); }
  private error(message: string): Error { return new Error(formatDiagnostic("Lexer", this.sourceName, this.source, this.startLine, this.startColumn, message)); }
}
