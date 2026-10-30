import type { Token, TokenType } from "./token.js";
import type { Expr, Stmt } from "./ast.js";

export class Parser {
  private current = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Stmt[] {
    const statements: Stmt[] = [];
    while (!this.check("eof")) statements.push(this.declaration());
    return statements;
  }

  private declaration(): Stmt {
    if (this.match("let")) return this.variableDeclaration(true);
    if (this.match("const")) return this.variableDeclaration(false);
    return this.statement();
  }

  private variableDeclaration(mutable: boolean): Stmt {
    const name = this.consume("identifier", "Expected a variable name.").lexeme;
    this.consume("equal", "Expected '=' after variable name.");
    const initializer = this.expression();
    this.match("semicolon");
    return { kind: "var", name, initializer, mutable };
  }

  private statement(): Stmt {
    if (this.match("print")) {
      const expression = this.expression();
      this.match("semicolon");
      return { kind: "print", expression };
    }
    if (this.match("if")) return this.ifStatement();
    if (this.match("while")) return this.whileStatement();
    if (this.match("leftBrace")) return { kind: "block", statements: this.block() };
    const expression = this.expression();
    this.match("semicolon");
    return { kind: "expression", expression };
  }

  private ifStatement(): Stmt {
    const condition = this.expression();
    const thenBranch = this.statement();
    let elseBranch: Stmt | undefined;
    if (this.match("else")) elseBranch = this.statement();
    return elseBranch
      ? { kind: "if", condition, thenBranch, elseBranch }
      : { kind: "if", condition, thenBranch };
  }

  private whileStatement(): Stmt {
    const condition = this.expression();
    const body = this.statement();
    return { kind: "while", condition, body };
  }

  private block(): Stmt[] {
    const statements: Stmt[] = [];
    while (!this.check("rightBrace") && !this.check("eof")) statements.push(this.declaration());
    this.consume("rightBrace", "Expected '}' after block.");
    return statements;
  }

  private expression(): Expr { return this.or(); }
  private or(): Expr {
    let expr = this.and();
    while (this.match("or")) { const op = this.previous().lexeme; expr = { kind: "binary", left: expr, operator: op, right: this.and() }; }
    return expr;
  }
  private and(): Expr {
    let expr = this.equality();
    while (this.match("and")) { const op = this.previous().lexeme; expr = { kind: "binary", left: expr, operator: op, right: this.equality() }; }
    return expr;
  }
  private equality(): Expr {
    let expr = this.comparison();
    while (this.match("bangEqual", "equalEqual")) { const op = this.previous().lexeme; expr = { kind: "binary", left: expr, operator: op, right: this.comparison() }; }
    return expr;
  }
  private comparison(): Expr {
    let expr = this.term();
    while (this.match("greater", "greaterEqual", "less", "lessEqual")) { const op = this.previous().lexeme; expr = { kind: "binary", left: expr, operator: op, right: this.term() }; }
    return expr;
  }
  private term(): Expr {
    let expr = this.factor();
    while (this.match("plus", "minus")) { const op = this.previous().lexeme; expr = { kind: "binary", left: expr, operator: op, right: this.factor() }; }
    return expr;
  }
  private factor(): Expr {
    let expr = this.unary();
    while (this.match("star", "slash", "percent")) { const op = this.previous().lexeme; expr = { kind: "binary", left: expr, operator: op, right: this.unary() }; }
    return expr;
  }
  private unary(): Expr {
    if (this.match("bang", "minus")) return { kind: "unary", operator: this.previous().lexeme, right: this.unary() };
    return this.primary();
  }
  private primary(): Expr {
    if (this.match("false")) return { kind: "literal", value: false };
    if (this.match("true")) return { kind: "literal", value: true };
    if (this.match("null")) return { kind: "literal", value: null };
    if (this.match("number", "string")) return { kind: "literal", value: this.previous().literal };
    if (this.match("identifier")) return { kind: "variable", name: this.previous().lexeme };
    if (this.match("leftParen")) {
      const expr = this.expression();
      this.consume("rightParen", "Expected ')' after expression.");
      return { kind: "grouping", expression: expr };
    }
    throw this.error(this.peek(), "Expected an expression.");
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) if (this.check(type)) { this.advance(); return true; }
    return false;
  }
  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(this.peek(), message);
  }
  private check(type: TokenType): boolean { return this.peek().type === type; }
  private advance(): Token { if (!this.check("eof")) this.current++; return this.previous(); }
  private isAtEnd(): boolean { return this.check("eof"); }
  private peek(): Token { return this.tokens[this.current]!; }
  private previous(): Token { return this.tokens[this.current - 1]!; }
  private error(token: Token, message: string): Error {
    return new Error(`[Wibufy parser ${token.line}:${token.column}] ${message}`);
  }
}
