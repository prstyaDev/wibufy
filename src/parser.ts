import type { Token, TokenType } from "./token.js";
import type { Expr, Stmt, TypeName, TypeRef } from "./ast.js";

export class Parser {
  private current = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): Stmt[] { const out: Stmt[] = []; this.skipNewlines(); while (!this.check("eof")) { out.push(this.declaration()); this.skipNewlines(); } return out; }
  private declaration(): Stmt {
    if (this.match("fn")) return this.functionDeclaration();
    if (this.match("let")) return this.variableDeclaration(true);
    if (this.match("const")) return this.variableDeclaration(false);
    return this.statement();
  }
  private functionDeclaration(): Stmt {
    const name = this.consume("identifier", "Expected function name.").lexeme;
    this.skipNewlines(); this.consume("leftParen", "Expected '(' after function name."); this.skipNewlines();
    const params: { name: string; type: TypeRef }[] = [];
    if (!this.check("rightParen")) do {
      const paramName = this.consume("identifier", "Expected parameter name.").lexeme;
      this.consume("colon", "Expected ':' after parameter name.");
      params.push({ name: paramName, type: this.typeRef() });
      this.skipNewlines();
    } while (this.match("comma") && (this.skipNewlines(), true));
    this.skipNewlines(); this.consume("rightParen", "Expected ')' after parameters.");
    this.skipNewlines(); this.consume("arrow", "Expected '->' and a return type.");
    this.skipNewlines(); const returnType = this.typeRef();
    this.skipNewlines(); this.consume("leftBrace", "Expected '{' before function body.");
    return { kind: "function", name, params, returnType, body: this.block() };
  }
  private typeRef(): TypeRef {
    const types = [this.typeName()];
    while (this.match("pipe")) { this.skipNewlines(); types.push(this.typeName()); }
    if (types.length === 1) return types[0]!;
    if (types.length !== 2 || !types.includes("null") || types.includes("void") || new Set(types).size !== types.length) {
      throw this.error(this.previous(), "In v0.2, nullable types must use the form 'T | null'.");
    }
    return { kind: "union", types };
  }
  private typeName(): TypeName {
    if (this.match("typeNumber")) return "number";
    if (this.match("typeString")) return "string";
    if (this.match("typeBoolean")) return "boolean";
    if (this.match("typeVoid")) return "void";
    if (this.match("null")) return "null";
    throw this.error(this.peek(), "Expected type: number, string, boolean, null, or void.");
  }
  private variableDeclaration(mutable: boolean): Stmt {
    const name = this.consume("identifier", "Expected variable name.").lexeme;
    let annotation: TypeRef | undefined;
    if (this.match("colon")) annotation = this.typeRef();
    this.consume("equal", "Expected '=' in variable declaration.");
    this.skipNewlines();
    const initializer = this.expression(); this.consumeTerminator();
    return annotation ? { kind: "var", name, annotation, initializer, mutable } : { kind: "var", name, initializer, mutable };
  }
  private statement(): Stmt {
    if (this.match("print")) { this.consume("leftParen", "Expected '(' after print."); this.skipNewlines(); const expression = this.expression(); this.skipNewlines(); this.consume("rightParen", "Expected ')' after print expression."); this.consumeTerminator(); return { kind: "print", expression }; }
    if (this.match("return")) { const value = this.check("semicolon") || this.check("newline") || this.check("rightBrace") || this.check("eof") ? undefined : this.expression(); this.consumeTerminator(); return value ? { kind: "return", value } : { kind: "return" }; }
    if (this.match("if")) return this.ifStatement();
    if (this.match("while")) return this.whileStatement();
    if (this.match("leftBrace")) return { kind: "block", statements: this.block() };
    const expression = this.expression(); this.consumeTerminator(); return { kind: "expression", expression };
  }
  private ifStatement(): Stmt { const condition = this.expression(); this.skipNewlines(); const thenBranch = this.statement(); this.skipNewlines(); let elseBranch: Stmt | undefined; if (this.match("else")) elseBranch = this.statement(); return elseBranch ? { kind: "if", condition, thenBranch, elseBranch } : { kind: "if", condition, thenBranch }; }
  private whileStatement(): Stmt { const condition = this.expression(); this.skipNewlines(); return { kind: "while", condition, body: this.statement() }; }
  private block(): Stmt[] { const out: Stmt[] = []; this.skipNewlines(); while (!this.check("rightBrace") && !this.check("eof")) { out.push(this.declaration()); this.skipNewlines(); } this.consume("rightBrace", "Expected '}' after block."); return out; }
  private expression(): Expr { return this.assignment(); }
  private assignment(): Expr { const expr = this.or(); if (this.match("equal")) { const value = this.assignment(); if (expr.kind === "variable") return { kind: "assign", name: expr.name, value }; throw this.error(this.previous(), "Invalid assignment target."); } return expr; }
  private or(): Expr { let e = this.and(); while (this.match("or")) { this.skipNewlines(); e = { kind: "binary", left: e, operator: "or", right: this.and() }; } return e; }
  private and(): Expr { let e = this.equality(); while (this.match("and")) { this.skipNewlines(); e = { kind: "binary", left: e, operator: "and", right: this.equality() }; } return e; }
  private equality(): Expr { let e = this.comparison(); while (this.match("bangEqual", "equalEqual")) { const op = this.previous().lexeme; this.skipNewlines(); e = { kind: "binary", left: e, operator: op, right: this.comparison() }; } return e; }
  private comparison(): Expr { let e = this.term(); while (this.match("greater", "greaterEqual", "less", "lessEqual")) { const op = this.previous().lexeme; this.skipNewlines(); e = { kind: "binary", left: e, operator: op, right: this.term() }; } return e; }
  private term(): Expr { let e = this.factor(); while (this.match("plus", "minus")) { const op = this.previous().lexeme; this.skipNewlines(); e = { kind: "binary", left: e, operator: op, right: this.factor() }; } return e; }
  private factor(): Expr { let e = this.unary(); while (this.match("star", "slash", "percent")) { const op = this.previous().lexeme; this.skipNewlines(); e = { kind: "binary", left: e, operator: op, right: this.unary() }; } return e; }
  private unary(): Expr { if (this.match("bang", "minus")) { const operator = this.previous().lexeme; this.skipNewlines(); return { kind: "unary", operator, right: this.unary() }; } return this.call(); }
  private call(): Expr { let e = this.primary(); while (this.match("leftParen")) { const args: Expr[] = []; this.skipNewlines(); if (!this.check("rightParen")) { do { args.push(this.expression()); this.skipNewlines(); } while (this.match("comma") && (this.skipNewlines(), true)); } this.consume("rightParen", "Expected ')' after arguments."); e = { kind: "call", callee: e, args }; } return e; }
  private primary(): Expr {
    if (this.match("false")) return { kind: "literal", value: false };
    if (this.match("true")) return { kind: "literal", value: true };
    if (this.match("null")) return { kind: "literal", value: null };
    if (this.match("number", "string")) return { kind: "literal", value: this.previous().literal };
    if (this.match("identifier")) return { kind: "variable", name: this.previous().lexeme };
    if (this.match("leftParen")) { this.skipNewlines(); const e = this.expression(); this.skipNewlines(); this.consume("rightParen", "Expected ')' after expression."); return { kind: "grouping", expression: e }; }
    throw this.error(this.peek(), "Expected expression.");
  }
  private consumeTerminator(): void {
    if (this.match("semicolon")) { this.skipNewlines(); return; }
    if (this.match("newline")) { this.skipNewlines(); return; }
    if (this.check("rightBrace") || this.check("eof")) return;
    throw this.error(this.peek(), "Expected a newline, ';', or end of block after statement.");
  }
  private skipNewlines(): void { while (this.match("newline")) { /* consume line breaks */ } }
  private match(...types: TokenType[]): boolean { for (const t of types) if (this.check(t)) { this.advance(); return true; } return false; }
  private consume(type: TokenType, message: string): Token { if (this.check(type)) return this.advance(); throw this.error(this.peek(), message); }
  private check(type: TokenType): boolean { return this.peek().type === type; }
  private advance(): Token { if (!this.check("eof")) this.current++; return this.previous(); }
  private peek(): Token { return this.tokens[this.current]!; }
  private previous(): Token { return this.tokens[this.current - 1]!; }
  private error(token: Token, message: string): Error { return new Error(`[Wibufy parser ${token.line}:${token.column}] ${message}`); }
}
