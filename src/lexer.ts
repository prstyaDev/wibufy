import type { Token, TokenType } from "./token.js";

const keywords: Record<string, TokenType> = {
  let: "let", const: "const", print: "print", if: "if",
  else: "else", while: "while", true: "true", false: "false", null: "null",
  and: "and", or: "or"
};

export class Lexer {
  private tokens: Token[] = [];
  private start = 0;
  private current = 0;
  private line = 1;
  private column = 1;
  private startColumn = 1;

  constructor(private readonly source: string) {}

  scan(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.startColumn = this.column;
      this.scanToken();
    }
    this.tokens.push({ type: "eof", lexeme: "", literal: null, line: this.line, column: this.column });
    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();
    switch (c) {
      case "(": return this.add("leftParen");
      case ")": return this.add("rightParen");
      case "{": return this.add("leftBrace");
      case "}": return this.add("rightBrace");
      case ";": return this.add("semicolon");
      case ",": return this.add("comma");
      case "+": return this.add("plus");
      case "-": return this.add("minus");
      case "*": return this.add("star");
      case "/":
        if (this.match("/")) { while (this.peek() !== "\n" && !this.isAtEnd()) this.advance(); }
        else this.add("slash");
        return;
      case "%": return this.add("percent");
      case "!": return this.add(this.match("=") ? "bangEqual" : "bang");
      case "=": return this.add(this.match("=") ? "equalEqual" : "equal");
      case ">": return this.add(this.match("=") ? "greaterEqual" : "greater");
      case "<": return this.add(this.match("=") ? "lessEqual" : "less");
      case "&":
        if (this.match("&")) return this.add("and");
        throw this.error("Expected '&' after '&'.");
      case "|":
        if (this.match("|")) return this.add("or");
        throw this.error("Expected '|' after '|'.");
      case " ": case "\r": case "\t": return;
      case "\n": this.line++; this.column = 1; return;
      case '"': return this.string();
      default:
        if (this.isDigit(c)) return this.number();
        if (this.isAlpha(c)) return this.identifier();
        throw this.error(`Unexpected character '${c}'.`);
    }
  }

  private string(): void {
    while (this.peek() !== '"' && !this.isAtEnd()) {
      if (this.peek() === "\n") { this.line++; this.column = 0; }
      this.advance();
    }
    if (this.isAtEnd()) throw this.error("Unterminated string.");
    this.advance();
    const value = this.source.slice(this.start + 1, this.current - 1);
    this.tokens.push({ type: "string", lexeme: this.source.slice(this.start, this.current), literal: value, line: this.line, column: this.startColumn });
  }

  private number(): void {
    while (this.isDigit(this.peek())) this.advance();
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance();
      while (this.isDigit(this.peek())) this.advance();
    }
    const text = this.source.slice(this.start, this.current);
    this.tokens.push({ type: "number", lexeme: text, literal: Number(text), line: this.line, column: this.startColumn });
  }

  private identifier(): void {
    while (this.isAlphaNumeric(this.peek())) this.advance();
    const text = this.source.slice(this.start, this.current);
    this.add(keywords[text] ?? "identifier");
  }

  private add(type: TokenType): void {
    this.tokens.push({ type, lexeme: this.source.slice(this.start, this.current), literal: null, line: this.line, column: this.startColumn });
  }
  private advance(): string { const c = this.source[this.current++] ?? ""; this.column++; return c; }
  private match(expected: string): boolean {
    if (this.isAtEnd() || this.source[this.current] !== expected) return false;
    this.current++; this.column++; return true;
  }
  private peek(): string { return this.source[this.current] ?? "\0"; }
  private peekNext(): string { return this.source[this.current + 1] ?? "\0"; }
  private isAtEnd(): boolean { return this.current >= this.source.length; }
  private isDigit(c: string): boolean { return c >= "0" && c <= "9"; }
  private isAlpha(c: string): boolean { return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_"; }
  private isAlphaNumeric(c: string): boolean { return this.isAlpha(c) || this.isDigit(c); }
  private error(message: string): Error { return new Error(`[Wibufy lexer ${this.line}:${this.startColumn}] ${message}`); }
}
