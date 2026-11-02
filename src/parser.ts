import type { Token, TokenType } from "./token.js";
import type { Expr, Stmt, TypeName, TypeRef } from "./ast.js";
import { formatDiagnostic } from "./diagnostics.js";

export class Parser {
  private current = 0;
  constructor(private readonly tokens: Token[], private readonly sourceText = "", private readonly sourceName = "<source>") {}
  parse(): Stmt[] { const out: Stmt[] = []; this.skipNewlines(); while (!this.check("eof")) { out.push(this.declaration()); this.skipNewlines(); } return out; }
  private declaration(): Stmt {
    const start = this.peek(); let result: Stmt;
    if (this.match("fn")) result = this.functionDeclaration();
    else if (this.match("type")) result = this.typeAliasDeclaration();
    else if (this.match("let")) result = this.variableDeclaration(true);
    else if (this.match("const")) result = this.variableDeclaration(false);
    else result = this.statement();
    result.loc = { line: start.line, column: start.column }; return result;
  }
  private typeParameters(): import("./ast.js").TypeParameter[] {
    const params: import("./ast.js").TypeParameter[] = [];
    if (!this.match("less")) return params;
    do {
      const name = this.consume("identifier", "Expected type parameter name.").lexeme;
      let constraint: TypeRef | undefined;
      if (this.match("extends")) constraint = this.typeRef();
      params.push(constraint ? { name, constraint } : { name });
      this.skipNewlines();
    } while (this.match("comma") && (this.skipNewlines(), true));
    this.consume("greater", "Expected '>' after type parameters.");
    if (new Set(params.map(p => p.name)).size !== params.length) throw this.error(this.previous(), "Duplicate type parameter.");
    return params;
  }
  private functionDeclaration(): Stmt {
    const name = this.consume("identifier", "Expected function name.").lexeme;
    const typeParameters = this.typeParameters();
    this.skipNewlines(); this.consume("leftParen", "Expected '(' after function name."); this.skipNewlines();
    const params: { name: string; type: TypeRef }[] = [];
    if (!this.check("rightParen")) do { const paramName = this.consume("identifier", "Expected parameter name.").lexeme; this.consume("colon", "Expected ':' after parameter name."); params.push({ name: paramName, type: this.typeRef() }); this.skipNewlines(); } while (this.match("comma") && (this.skipNewlines(), true));
    this.skipNewlines(); this.consume("rightParen", "Expected ')' after parameters."); this.skipNewlines(); this.consume("arrow", "Expected '->' and a return type."); this.skipNewlines(); const returnType = this.typeRef(); this.skipNewlines(); this.consume("leftBrace", "Expected '{' before function body.");
    return { kind: "function", name, typeParameters, params, returnType, body: this.block() };
  }
  private typeAliasDeclaration(): Stmt {
    const name = this.consume("identifier", "Expected type alias name.").lexeme;
    const typeParameters = this.typeParameters();
    this.consume("equal", "Expected '=' in type alias declaration.");
    const target = this.typeRef();
    this.consumeTerminator();
    return { kind: "typeAlias", name, typeParameters, target };
  }
  private typeRef(): TypeRef {
    let base: TypeRef;
    if (this.match("typeArray")) {
      this.consume("less", "Expected '<' after Array."); this.skipNewlines();
      const element = this.typeRef(); this.skipNewlines();
      this.consume("greater", "Expected '>' after array element type.");
      base = { kind: "arrayType", element };
    } else if (this.match("typeObject")) {
      this.consume("leftBrace", "Expected '{' after Object."); base = { kind: "objectType", properties: this.objectTypeProperties() };
    } else if (this.match("leftBrace")) base = { kind: "objectType", properties: this.objectTypeProperties() };
    else if (this.match("typeNumber")) base = "number";
    else if (this.match("typeString")) base = "string";
    else if (this.match("typeBoolean")) base = "boolean";
    else if (this.match("typeVoid")) base = "void";
    else if (this.match("null")) base = "null";
    else if (this.match("identifier")) {
      const name = this.previous().lexeme;
      const args: TypeRef[] = [];
      if (this.match("less")) {
        do { args.push(this.typeRef()); this.skipNewlines(); } while (this.match("comma") && (this.skipNewlines(), true));
        this.consume("greater", "Expected '>' after generic type arguments.");
      }
      base = { kind: "namedType", name, arguments: args };
    } else throw this.error(this.peek(), "Expected a type name, Array<T>, or an object shape.");
    const types: TypeRef[] = [base];
    while (this.match("pipe")) { this.skipNewlines(); types.push(this.typeRef()); }
    if (types.length === 1) return base;
    if (types.some(t => t === "void")) throw this.error(this.previous(), "void cannot be a member of a union.");
    return { kind: "union", types };
  }
  private objectTypeProperties(): { name: string; type: TypeRef }[] {
    const properties: { name: string; type: TypeRef }[] = []; this.skipNewlines();
    while (!this.check("rightBrace") && !this.check("eof")) { const name = this.consume("identifier", "Expected property name in object type.").lexeme; this.consume("colon", "Expected ':' after property name."); properties.push({ name, type: this.typeRef() }); this.skipNewlines(); if (!this.match("comma")) break; this.skipNewlines(); }
    this.consume("rightBrace", "Expected '}' after object type."); return properties;
  }
  private typeName(): TypeName {
    if (this.match("typeNumber")) return "number"; if (this.match("typeString")) return "string"; if (this.match("typeBoolean")) return "boolean"; if (this.match("typeVoid")) return "void"; if (this.match("null")) return "null";
    throw this.error(this.peek(), "Expected type: number, string, boolean, null, Array<T>, or an object shape.");
  }
  private variableDeclaration(mutable: boolean): Stmt {
    const name = this.consume("identifier", "Expected variable name.").lexeme; let annotation: TypeRef | undefined;
    if (this.match("colon")) annotation = this.typeRef(); this.consume("equal", "Expected '=' in variable declaration."); this.skipNewlines(); const initializer = this.expression(); this.consumeTerminator();
    return annotation ? { kind: "var", name, annotation, initializer, mutable } : { kind: "var", name, initializer, mutable };
  }
  private statement(): Stmt {
    if (this.match("print")) { this.consume("leftParen", "Expected '(' after print."); this.skipNewlines(); const expression = this.expression(); this.skipNewlines(); this.consume("rightParen", "Expected ')' after print expression."); this.consumeTerminator(); return { kind: "print", expression }; }
    if (this.match("return")) { const value = this.check("semicolon") || this.check("newline") || this.check("rightBrace") || this.check("eof") ? undefined : this.expression(); this.consumeTerminator(); return value ? { kind: "return", value } : { kind: "return" }; }
    if (this.match("if")) return this.ifStatement(); if (this.match("while")) return this.whileStatement(); if (this.match("for")) return this.forInStatement();
    if (this.match("leftBrace")) return { kind: "block", statements: this.block() };
    const expression = this.expression(); this.consumeTerminator(); return { kind: "expression", expression };
  }
  private ifStatement(): Stmt { const condition = this.expression(); this.skipNewlines(); const thenBranch = this.statement(); this.skipNewlines(); let elseBranch: Stmt | undefined; if (this.match("else")) elseBranch = this.statement(); return elseBranch ? { kind: "if", condition, thenBranch, elseBranch } : { kind: "if", condition, thenBranch }; }
  private whileStatement(): Stmt { const condition = this.expression(); this.skipNewlines(); return { kind: "while", condition, body: this.statement() }; }
  private forInStatement(): Stmt {
    const parenthesized = this.match("leftParen"); const name = this.consume("identifier", "Expected iteration variable after 'for'.").lexeme;
    this.consume("in", "Expected 'in' after iteration variable."); this.skipNewlines(); const iterable = this.expression();
    if (parenthesized) this.consume("rightParen", "Expected ')' after for-in iterable."); this.skipNewlines(); const body = this.statement(); return { kind: "forIn", name, iterable, body };
  }
  private block(): Stmt[] { const out: Stmt[] = []; this.skipNewlines(); while (!this.check("rightBrace") && !this.check("eof")) { out.push(this.declaration()); this.skipNewlines(); } this.consume("rightBrace", "Expected '}' after block."); return out; }
  private expression(): Expr { return this.assignment(); }
  private assignment(): Expr {
    const expr = this.or(); if (this.match("equal")) { const value = this.assignment();
      if (expr.kind === "variable") return { kind: "assign", name: expr.name, value };
      if (expr.kind === "index") return { kind: "indexAssign", object: expr.object, index: expr.index, value };
      if (expr.kind === "property") return { kind: "propertyAssign", object: expr.object, name: expr.name, value };
      throw this.error(this.previous(), "Invalid assignment target.");
    } return expr;
  }
  private or(): Expr { let e = this.and(); while (this.match("or")) { this.skipNewlines(); e = { kind: "binary", left: e, operator: "or", right: this.and() }; } return e; }
  private and(): Expr { let e = this.equality(); while (this.match("and")) { this.skipNewlines(); e = { kind: "binary", left: e, operator: "and", right: this.equality() }; } return e; }
  private equality(): Expr { let e = this.comparison(); while (this.match("bangEqual", "equalEqual")) { const op = this.previous().lexeme; this.skipNewlines(); e = { kind: "binary", left: e, operator: op, right: this.comparison() }; } return e; }
  private comparison(): Expr {
    let e = this.term();
    while (true) {
      if (this.match("is")) { const type = this.typeRef(); e = { kind: "typeTest", value: e, type }; continue; }
      if (this.match("greater", "greaterEqual", "less", "lessEqual")) { const op = this.previous().lexeme; this.skipNewlines(); e = { kind: "binary", left: e, operator: op, right: this.term() }; continue; }
      break;
    }
    return e;
  }
  private term(): Expr { let e = this.factor(); while (this.match("plus", "minus")) { const op = this.previous().lexeme; this.skipNewlines(); e = { kind: "binary", left: e, operator: op, right: this.factor() }; } return e; }
  private factor(): Expr { let e = this.unary(); while (this.match("star", "slash", "percent")) { const op = this.previous().lexeme; this.skipNewlines(); e = { kind: "binary", left: e, operator: op, right: this.unary() }; } return e; }
  private unary(): Expr { if (this.match("bang", "minus")) { const operator = this.previous().lexeme; this.skipNewlines(); return { kind: "unary", operator, right: this.unary() }; } return this.postfix(); }
  private postfix(): Expr {
    let e = this.primary();
    while (true) {
      if (e.kind === "variable" && this.check("less") && this.looksLikeTypeArgumentsCall()) {
        this.advance();
        const typeArguments: TypeRef[] = [];
        do { typeArguments.push(this.typeRef()); this.skipNewlines(); } while (this.match("comma") && (this.skipNewlines(), true));
        this.consume("greater", "Expected '>' after explicit type arguments.");
        this.consume("leftParen", "Expected '(' after explicit type arguments.");
        const args: Expr[] = []; this.skipNewlines();
        if (!this.check("rightParen")) do { args.push(this.expression()); this.skipNewlines(); } while (this.match("comma") && (this.skipNewlines(), true));
        this.consume("rightParen", "Expected ')' after arguments.");
        e = { kind: "call", callee: e, args, typeArguments };
      }
      else if (this.match("leftParen")) { const args: Expr[] = []; this.skipNewlines(); if (!this.check("rightParen")) do { args.push(this.expression()); this.skipNewlines(); } while (this.match("comma") && (this.skipNewlines(), true)); this.consume("rightParen", "Expected ')' after arguments."); e = { kind: "call", callee: e, args }; }
      else if (this.match("leftBracket")) { this.skipNewlines(); const index = this.expression(); this.skipNewlines(); this.consume("rightBracket", "Expected ']' after index."); e = { kind: "index", object: e, index }; }
      else if (this.match("dot")) { const name = this.consume("identifier", "Expected property name after '.'.").lexeme; e = { kind: "property", object: e, name }; }
      else break;
    } return e;
  }
  private looksLikeTypeArgumentsCall(): boolean {
    let depth = 0;
    for (let i = this.current; i < this.tokens.length; i++) {
      const t = this.tokens[i]!.type;
      if (t === "less") depth++;
      else if (t === "greater") { depth--; if (depth === 0) return this.tokens[i + 1]?.type === "leftParen"; }
      else if (t === "eof" || t === "newline" || t === "semicolon") return false;
    }
    return false;
  }
  private primary(): Expr {
    if (this.match("false")) return { kind: "literal", value: false }; if (this.match("true")) return { kind: "literal", value: true }; if (this.match("null")) return { kind: "literal", value: null };
    if (this.match("number", "string")) return { kind: "literal", value: this.previous().literal };
    if (this.match("identifier")) return { kind: "variable", name: this.previous().lexeme };
    if (this.match("leftParen")) { this.skipNewlines(); const e = this.expression(); this.skipNewlines(); this.consume("rightParen", "Expected ')' after expression."); return { kind: "grouping", expression: e }; }
    if (this.match("leftBracket")) { const elements: Expr[] = []; this.skipNewlines(); if (!this.check("rightBracket")) do { elements.push(this.expression()); this.skipNewlines(); } while (this.match("comma") && (this.skipNewlines(), true)); this.consume("rightBracket", "Expected ']' after array elements."); return { kind: "array", elements }; }
    if (this.match("leftBrace")) { const properties: { name: string; value: Expr }[] = []; this.skipNewlines(); if (!this.check("rightBrace")) do { const name = this.consume("identifier", "Expected object property name.").lexeme; this.consume("colon", "Expected ':' after object property name."); this.skipNewlines(); properties.push({ name, value: this.expression() }); this.skipNewlines(); } while (this.match("comma") && (this.skipNewlines(), true)); this.consume("rightBrace", "Expected '}' after object properties."); return { kind: "object", properties }; }
    throw this.error(this.peek(), "Expected expression.");
  }
  private consumeTerminator(): void { if (this.match("semicolon")) { this.skipNewlines(); return; } if (this.match("newline")) { this.skipNewlines(); return; } if (this.check("rightBrace") || this.check("eof")) return; throw this.error(this.peek(), "Expected a newline, ';', or end of block after statement."); }
  private skipNewlines(): void { while (this.match("newline")) {} }
  private match(...types: TokenType[]): boolean { for (const t of types) if (this.check(t)) { this.advance(); return true; } return false; }
  private consume(type: TokenType, message: string): Token { if (this.check(type)) return this.advance(); throw this.error(this.peek(), message); }
  private check(type: TokenType): boolean { return this.peek().type === type; }
  private advance(): Token { if (!this.check("eof")) this.current++; return this.previous(); }
  private peek(): Token { return this.tokens[this.current]!; }
  private previous(): Token { return this.tokens[this.current - 1]!; }
  private error(token: Token, message: string): Error { return new Error(formatDiagnostic("Parser", this.sourceName, this.sourceText, token.line, token.column, message, Math.max(1, token.lexeme.length))); }
}
