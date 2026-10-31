import type { Expr, Stmt, TypeName, TypeRef } from "./ast.js";
import { formatDiagnostic } from "./diagnostics.js";
type ValueType = string;
interface VariableSymbol { type: ValueType; mutable: boolean }
interface FunctionSymbol { params: ValueType[]; returns: ValueType }
const primitive = new Set(["number", "string", "boolean", "void", "null"]);
function typeOf(ref: TypeRef): ValueType {
  if (typeof ref === "string") return ref;
  if (ref.kind === "arrayType") return `Array<${typeOf(ref.element)}>`;
  if (ref.kind === "objectType") return `Object{${ref.properties.map(p => `${p.name}:${typeOf(p.type)}`).join(",")}}`;
  return [...ref.types].map(typeOf).sort().join("|");
}
function splitTopLevel(type: string, delimiter: string): string[] {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < type.length; i++) { const c = type[i]!; if (c === "<" || c === "{") depth++; else if (c === ">" || c === "}") depth--; else if (c === delimiter && depth === 0) { parts.push(type.slice(start, i)); start = i + 1; } }
  parts.push(type.slice(start)); return parts;
}
function members(type: ValueType): string[] { return splitTopLevel(type, "|"); }
function accepts(expected: ValueType, actual: ValueType): boolean {
  if (expected === actual) return true;
  const expectedArray = arrayElement(expected), actualArray = arrayElement(actual);
  if (expectedArray !== null && actualArray !== null) return accepts(expectedArray, actualArray);
  const expectedObject = objectProperties(expected), actualObject = objectProperties(actual);
  if (expectedObject && actualObject) { for (const [key, valueType] of expectedObject) { const actualType = actualObject.get(key); if (!actualType || !accepts(valueType, actualType)) return false; } return true; }
  const allowed = members(expected); return members(actual).every(t => allowed.includes(t));
}
function arrayElement(type: ValueType): string | null { const m = /^Array<(.*)>$/.exec(type); return m?.[1] ?? null; }
function objectProperties(type: ValueType): Map<string, string> | null {
  if (!type.startsWith("Object{") || !type.endsWith("}")) return null;
  const body = type.slice(7, -1); const result = new Map<string, string>(); if (!body) return result;
  for (const item of splitTopLevel(body, ",")) { const at = item.indexOf(":"); if (at < 0) continue; result.set(item.slice(0, at), item.slice(at + 1)); }
  return result;
}
function withoutNull(type: ValueType): ValueType { const remaining = members(type).filter(t => t !== "null"); return remaining.length === 0 ? "null" : remaining.join("|"); }

export class TypeChecker {
  constructor(private readonly sourceName = "<source>", private readonly sourceText = "") {}
  private diagnostic(message: string, statement?: Stmt): Error { const loc = statement?.loc; if (!loc) return new Error(`[Wibufy Type Error] ${message}`); return new Error(formatDiagnostic("Type", this.sourceName, this.sourceText, loc.line, loc.column, message)); }
  private scopes: Map<string, VariableSymbol>[] = [new Map()];
  private functions = new Map<string, FunctionSymbol>();
  private currentReturn: ValueType | null = null;
  check(program: Stmt[]): void {
    this.scopes = [new Map()]; this.functions = new Map(); this.currentReturn = null;
    for (const statement of program) if (statement.kind === "function") { if (this.functions.has(statement.name)) throw this.diagnostic(`function '${statement.name}' already declared.`, statement); this.functions.set(statement.name, { params: statement.params.map(p => typeOf(p.type)), returns: typeOf(statement.returnType) }); }
    for (const statement of program) this.statement(statement);
  }
  private declare(name: string, type: ValueType, mutable: boolean): void { const scope = this.scopes[this.scopes.length - 1]!; if (scope.has(name)) throw new Error(`Type error: '${name}' already declared in this scope.`); scope.set(name, { type, mutable }); }
  private lookup(name: string): VariableSymbol { for (let i = this.scopes.length - 1; i >= 0; i--) { const value = this.scopes[i]!.get(name); if (value) return value; } throw new Error(`Type error: undefined variable '${name}'.`); }
  private withScope(callback: () => void): void { this.scopes.push(new Map()); try { callback(); } finally { this.scopes.pop(); } }
  private statement(statement: Stmt): void {
    try { this.statementCore(statement); } catch (error) { if (error instanceof Error && error.message.startsWith("[Wibufy Type Error]")) throw error; const message = error instanceof Error ? error.message.replace(/^Type error:\s*/, "") : String(error); throw this.diagnostic(message, statement); }
  }
  private statementCore(statement: Stmt): void {
    switch (statement.kind) {
      case "var": {
        if (this.scopes.length === 1 && this.functions.has(statement.name)) throw new Error(`Type error: '${statement.name}' conflicts with a function declaration.`);
        const expected = statement.annotation ? typeOf(statement.annotation) : null; const actual = statement.initializer.kind === "array" && statement.initializer.elements.length === 0 && expected && arrayElement(expected) !== null ? expected : this.expression(statement.initializer); const targetType = expected ?? actual;
        if (!accepts(targetType, actual)) throw new Error(`Type error: variable '${statement.name}' expects ${targetType}, got ${actual}.`);
        if (targetType === "void") throw new Error("Type error: variable cannot have type void."); this.declare(statement.name, targetType, statement.mutable); return;
      }
      case "function": {
        if (this.scopes.length !== 1) throw new Error("Type error: function declarations must be at top level in v0.2.");
        if (this.scopes[0]!.has(statement.name)) throw new Error(`Type error: function '${statement.name}' conflicts with a variable declaration.`);
        const previousReturn = this.currentReturn;
        try { this.withScope(() => { for (const p of statement.params) this.declare(p.name, typeOf(p.type), false); this.currentReturn = typeOf(statement.returnType); for (const child of statement.body) this.statement(child); if (this.currentReturn !== "void" && !this.alwaysReturns(statement.body)) throw new Error(`Type error: function '${statement.name}' must return ${this.currentReturn} on every path.`); }); } finally { this.currentReturn = previousReturn; } return;
      }
      case "return": { if (this.currentReturn === null) throw new Error("Type error: return outside function."); const actual = statement.value ? this.expression(statement.value) : "void"; if (!accepts(this.currentReturn, actual)) throw new Error(`Type error: function returns ${this.currentReturn}, got ${actual}.`); return; }
      case "print": { const t = this.expression(statement.expression); if (t === "void") throw new Error("Type error: cannot print a void expression."); return; }
      case "expression": this.expression(statement.expression); return;
      case "block": this.withScope(() => { for (const child of statement.statements) this.statement(child); }); return;
      case "if": { if (this.expression(statement.condition) !== "boolean") throw new Error("Type error: if condition must be boolean."); const narrowed = this.nullNarrowing(statement.condition); if (narrowed) { const symbol = this.lookup(narrowed.name); const original = symbol.type; symbol.type = narrowed.type; try { this.statement(statement.thenBranch); } finally { symbol.type = original; } } else this.statement(statement.thenBranch); if (statement.elseBranch) this.statement(statement.elseBranch); return; }
      case "while": if (this.expression(statement.condition) !== "boolean") throw new Error("Type error: while condition must be boolean."); this.statement(statement.body); return;
      case "forIn": { const iterable = this.expression(statement.iterable); const element = arrayElement(iterable); if (element === null) throw new Error(`Type error: for-in requires an array, got ${iterable}.`); this.withScope(() => { this.declare(statement.name, element, false); this.statement(statement.body); }); return; }
    }
  }
  private alwaysReturns(statements: Stmt[]): boolean { for (const s of statements) { if (s.kind === "return") return true; if (s.kind === "block" && this.alwaysReturns(s.statements)) return true; if (s.kind === "if" && s.elseBranch && this.statementAlwaysReturns(s.thenBranch) && this.statementAlwaysReturns(s.elseBranch)) return true; } return false; }
  private statementAlwaysReturns(s: Stmt): boolean { if (s.kind === "return") return true; if (s.kind === "block") return this.alwaysReturns(s.statements); if (s.kind === "if") return !!s.elseBranch && this.statementAlwaysReturns(s.thenBranch) && this.statementAlwaysReturns(s.elseBranch); return false; }
  private nullNarrowing(condition: Expr): { name: string; type: ValueType } | null { if (condition.kind !== "binary" || condition.operator !== "!=") return null; const v = condition.left.kind === "variable" && condition.right.kind === "literal" && condition.right.value === null ? condition.left : condition.right.kind === "variable" && condition.left.kind === "literal" && condition.left.value === null ? condition.right : null; if (!v) return null; const symbol = this.lookup(v.name); if (!members(symbol.type).includes("null")) return null; return { name: v.name, type: withoutNull(symbol.type) }; }
  private expression(e: Expr): ValueType {
    switch (e.kind) {
      case "literal": return e.value === null ? "null" : typeof e.value === "number" ? "number" : typeof e.value === "string" ? "string" : "boolean";
      case "grouping": return this.expression(e.expression);
      case "variable": return this.lookup(e.name).type;
      case "assign": { const symbol = this.lookup(e.name); if (!symbol.mutable) throw new Error(`Type error: cannot assign to constant '${e.name}'.`); const actual = this.expression(e.value); if (!accepts(symbol.type, actual)) throw new Error(`Type error: '${e.name}' is ${symbol.type}, cannot assign ${actual}.`); return actual; }
      case "array": { if (!e.elements.length) throw new Error("Type error: cannot infer the element type of an empty array; add an Array<T> annotation."); const types = e.elements.map(x => this.expression(x)); const first = types[0]!; if (types.some(t => t !== first)) throw new Error(`Type error: array elements must have a consistent type; expected ${first}, got ${types.find(t => t !== first)}.`); return `Array<${first}>`; }
      case "object": { const names = new Set<string>(); const fields: string[] = []; for (const p of e.properties) { if (names.has(p.name)) throw new Error(`Type error: duplicate object property '${p.name}'.`); names.add(p.name); fields.push(`${p.name}:${this.expression(p.value)}`); } return `Object{${fields.join(",")}}`; }
      case "index": { const object = this.expression(e.object); const index = this.expression(e.index); if (index !== "number") throw new Error("Type error: array index must be a number."); const element = arrayElement(object); if (element === null) throw new Error(`Type error: cannot index value of type ${object}; expected an array.`); return element; }
      case "indexAssign": { const object = this.expression(e.object); const index = this.expression(e.index); const value = this.expression(e.value); if (index !== "number") throw new Error("Type error: array index must be a number."); const element = arrayElement(object); if (element === null) throw new Error(`Type error: cannot assign an index on ${object}.`); if (!accepts(element, value)) throw new Error(`Type error: array element expects ${element}, got ${value}.`); return value; }
      case "property": { const object = this.expression(e.object); if (arrayElement(object) !== null && e.name === "length") return "number"; const props = objectProperties(object); if (!props) throw new Error(`Type error: property '${e.name}' is not available on ${object}.`); const type = props.get(e.name); if (!type) throw new Error(`Type error: object has no property '${e.name}'.`); return type; }
      case "propertyAssign": { const object = this.expression(e.object); const value = this.expression(e.value); const props = objectProperties(object); if (!props) throw new Error(`Type error: cannot assign property '${e.name}' on ${object}.`); const expected = props.get(e.name); if (!expected) throw new Error(`Type error: object has no property '${e.name}'.`); if (!accepts(expected, value)) throw new Error(`Type error: property '${e.name}' expects ${expected}, got ${value}.`); return value; }
      case "call": { if (e.callee.kind !== "variable") throw new Error("Type error: only named function calls are supported in v0.2."); const name = e.callee.name; const fn = this.functions.get(name); if (!fn) throw new Error(`Type error: unknown function '${name}'.`); if (e.args.length !== fn.params.length) throw new Error(`Type error: '${name}' expects ${fn.params.length} arguments, got ${e.args.length}.`); e.args.forEach((arg, i) => { const actual = this.expression(arg), expected = fn.params[i]!; if (!accepts(expected, actual)) throw new Error(`Type error: argument ${i + 1} of '${name}' expects ${expected}, got ${actual}.`); }); return fn.returns; }
      case "unary": { const t = this.expression(e.right); if (e.operator === "!" && t === "boolean") return "boolean"; if (e.operator === "-" && t === "number") return "number"; throw new Error(`Type error: invalid operand '${e.operator}' for ${t}.`); }
      case "binary": { const l = this.expression(e.left), r = this.expression(e.right); if (["+", "-", "*", "/", "%"].includes(e.operator)) { if (e.operator === "+" && l === "string" && r === "string") return "string"; if (l !== "number" || r !== "number") throw new Error(`Type error: operator '${e.operator}' requires numbers${e.operator === "+" ? " or two strings" : ""}.`); return "number"; } if ([">", ">=", "<", "<="] .includes(e.operator)) { if (l !== "number" || r !== "number") throw new Error("Type error: comparisons require numbers."); return "boolean"; } if (["==", "!="].includes(e.operator)) { if (!accepts(l, r) && !accepts(r, l)) throw new Error("Type error: equality operands must have compatible types."); return "boolean"; } if (["and", "or"].includes(e.operator)) { if (l !== "boolean" || r !== "boolean") throw new Error(`Type error: '${e.operator}' requires booleans.`); return "boolean"; } throw new Error(`Type error: unsupported operator '${e.operator}'.`); }
    }
  }
}
