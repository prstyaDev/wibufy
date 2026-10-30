import type { Expr, Stmt, TypeName, TypeRef } from "./ast.js";
import { formatDiagnostic } from "./diagnostics.js";
type ValueType = TypeName | string;
interface VariableSymbol { type: ValueType; mutable: boolean }
interface FunctionSymbol { params: ValueType[]; returns: ValueType }

function typeOf(ref: TypeRef): ValueType {
  if (typeof ref === "string") return ref;
  return [...ref.types].sort().join("|");
}
function members(type: ValueType): string[] { return type.split("|"); }
function accepts(expected: ValueType, actual: ValueType): boolean {
  const allowed = members(expected);
  return members(actual).every(t => allowed.includes(t));
}
function withoutNull(type: ValueType): ValueType {
  const remaining = members(type).filter(t => t !== "null");
  return remaining.length === 0 ? "null" : remaining.join("|");
}

export class TypeChecker {
  constructor(private readonly sourceName = "<source>", private readonly sourceText = "") {}

  private diagnostic(message: string, statement?: Stmt): Error {
    const loc = statement?.loc;
    if (!loc) return new Error(`[Wibufy Type Error] ${message}`);
    return new Error(formatDiagnostic("Type", this.sourceName, this.sourceText, loc.line, loc.column, message));
  }
  private scopes: Map<string, VariableSymbol>[] = [new Map()];
  private functions = new Map<string, FunctionSymbol>();
  private currentReturn: ValueType | null = null;

  check(program: Stmt[]): void {
    // Each check starts with an independent program context.
    this.scopes = [new Map()];
    this.functions = new Map();
    this.currentReturn = null;

    for (const statement of program) {
      if (statement.kind === "function") {
        if (this.functions.has(statement.name)) throw this.diagnostic(`function '${statement.name}' already declared.`, statement);
        this.functions.set(statement.name, { params: statement.params.map(p => typeOf(p.type)), returns: typeOf(statement.returnType) });
      }
    }
    for (const statement of program) this.statement(statement);
  }

  private declare(name: string, type: ValueType, mutable: boolean): void {
    const scope = this.scopes[this.scopes.length - 1]!;
    if (scope.has(name)) throw new Error(`Type error: '${name}' already declared in this scope.`);
    scope.set(name, { type, mutable });
  }
  private lookup(name: string): VariableSymbol {
    for (let i = this.scopes.length - 1; i >= 0; i--) { const value = this.scopes[i]!.get(name); if (value) return value; }
    throw new Error(`Type error: undefined variable '${name}'.`);
  }
  private withScope(callback: () => void): void { this.scopes.push(new Map()); try { callback(); } finally { this.scopes.pop(); } }

  private statement(statement: Stmt): void {
    try { this.statementCore(statement); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith("[Wibufy Type Error]")) throw error;
      const message = error instanceof Error ? error.message.replace(/^Type error:\s*/, "") : String(error);
      throw this.diagnostic(message, statement);
    }
  }

  private statementCore(statement: Stmt): void {
    switch (statement.kind) {
      case "var": {
        if (this.scopes.length === 1 && this.functions.has(statement.name)) throw new Error(`Type error: '${statement.name}' conflicts with a function declaration.`);
        const actual = this.expression(statement.initializer);
        const expected = statement.annotation ? typeOf(statement.annotation) : actual;
        if (!accepts(expected, actual)) throw new Error(`Type error: variable '${statement.name}' expects ${expected}, got ${actual}.`);
        if (expected === "void") throw new Error("Type error: variable cannot have type void.");
        this.declare(statement.name, expected, statement.mutable);
        return;
      }
      case "function": {
        if (this.scopes.length !== 1) throw new Error("Type error: function declarations must be at top level in v0.2.");
        if (this.scopes.length === 1 && this.scopes[0]!.has(statement.name)) throw new Error(`Type error: function '${statement.name}' conflicts with a variable declaration.`);
        const previousReturn = this.currentReturn;
        try {
          this.withScope(() => {
            for (const parameter of statement.params) this.declare(parameter.name, typeOf(parameter.type), false);
            this.currentReturn = typeOf(statement.returnType);
            for (const child of statement.body) this.statement(child);
            if (this.currentReturn !== "void" && !this.alwaysReturns(statement.body)) {
              throw new Error(`Type error: function '${statement.name}' must return ${this.currentReturn} on every path.`);
            }
          });
        } finally {
          this.currentReturn = previousReturn;
        }
        return;
      }
      case "return": {
        if (this.currentReturn === null) throw new Error("Type error: return outside function.");
        const actual = statement.value ? this.expression(statement.value) : "void";
        if (!accepts(this.currentReturn, actual)) throw new Error(`Type error: function returns ${this.currentReturn}, got ${actual}.`);
        return;
      }
      case "print": { const t = this.expression(statement.expression); if (t === "void") throw new Error("Type error: cannot print a void expression."); return; }
      case "expression": this.expression(statement.expression); return;
      case "block": this.withScope(() => { for (const child of statement.statements) this.statement(child); }); return;
      case "if": {
        if (this.expression(statement.condition) !== "boolean") throw new Error("Type error: if condition must be boolean.");
        const narrowed = this.nullNarrowing(statement.condition);
        if (narrowed) {
          const symbol = this.lookup(narrowed.name);
          const original = symbol.type;
          symbol.type = narrowed.type;
          try { this.statement(statement.thenBranch); } finally { symbol.type = original; }
        } else this.statement(statement.thenBranch);
        if (statement.elseBranch) this.statement(statement.elseBranch);
        return;
      }
      case "while":
        if (this.expression(statement.condition) !== "boolean") throw new Error("Type error: while condition must be boolean.");
        this.statement(statement.body);
        return;
    }
  }

  private alwaysReturns(statements: Stmt[]): boolean {
    for (const statement of statements) {
      if (statement.kind === "return") return true;
      if (statement.kind === "block" && this.alwaysReturns(statement.statements)) return true;
      if (statement.kind === "if" && statement.elseBranch && this.statementAlwaysReturns(statement.thenBranch) && this.statementAlwaysReturns(statement.elseBranch)) return true;
    }
    return false;
  }

  private statementAlwaysReturns(statement: Stmt): boolean {
    if (statement.kind === "return") return true;
    if (statement.kind === "block") return this.alwaysReturns(statement.statements);
    if (statement.kind === "if") return !!statement.elseBranch && this.statementAlwaysReturns(statement.thenBranch) && this.statementAlwaysReturns(statement.elseBranch);
    return false;
  }

  private nullNarrowing(condition: Expr): { name: string; type: ValueType } | null {
    if (condition.kind !== "binary" || condition.operator !== "!=") return null;
    const variable = condition.left.kind === "variable" && condition.right.kind === "literal" && condition.right.value === null
      ? condition.left
      : condition.right.kind === "variable" && condition.left.kind === "literal" && condition.left.value === null ? condition.right : null;
    if (!variable) return null;
    const symbol = this.lookup(variable.name);
    if (!members(symbol.type).includes("null")) return null;
    return { name: variable.name, type: withoutNull(symbol.type) };
  }

  private expression(expression: Expr): ValueType {
    switch (expression.kind) {
      case "literal":
        if (expression.value === null) return "null";
        if (typeof expression.value === "number") return "number";
        if (typeof expression.value === "string") return "string";
        return "boolean";
      case "grouping": return this.expression(expression.expression);
      case "variable": return this.lookup(expression.name).type;
      case "assign": {
        const symbol = this.lookup(expression.name);
        if (!symbol.mutable) throw new Error(`Type error: cannot assign to constant '${expression.name}'.`);
        const actual = this.expression(expression.value);
        if (!accepts(symbol.type, actual)) throw new Error(`Type error: '${expression.name}' is ${symbol.type}, cannot assign ${actual}.`);
        return actual;
      }
      case "call": {
        if (expression.callee.kind !== "variable") throw new Error("Type error: only named function calls are supported in v0.2.");
        const name = expression.callee.name;
        const fn = this.functions.get(name);
        if (!fn) throw new Error(`Type error: unknown function '${name}'.`);
        if (expression.args.length !== fn.params.length) throw new Error(`Type error: '${name}' expects ${fn.params.length} arguments, got ${expression.args.length}.`);
        expression.args.forEach((argument, index) => {
          const actual = this.expression(argument), expected = fn.params[index]!;
          if (!accepts(expected, actual)) throw new Error(`Type error: argument ${index + 1} of '${name}' expects ${expected}, got ${actual}.`);
        });
        return fn.returns;
      }
      case "unary": {
        const type = this.expression(expression.right);
        if (expression.operator === "!" && type === "boolean") return "boolean";
        if (expression.operator === "-" && type === "number") return "number";
        throw new Error(`Type error: invalid operand '${expression.operator}' for ${type}.`);
      }
      case "binary": {
        const left = this.expression(expression.left), right = this.expression(expression.right);
        if (["+", "-", "*", "/", "%"].includes(expression.operator)) {
          if (expression.operator === "+" && left === "string" && right === "string") return "string";
          if (left !== "number" || right !== "number") throw new Error(`Type error: operator '${expression.operator}' requires numbers${expression.operator === "+" ? " or two strings" : ""}.`);
          return "number";
        }
        if ([">", ">=", "<", "<="].includes(expression.operator)) {
          if (left !== "number" || right !== "number") throw new Error("Type error: comparisons require numbers.");
          return "boolean";
        }
        if (["==", "!="].includes(expression.operator)) {
          if (!accepts(left, right) && !accepts(right, left)) throw new Error("Type error: equality operands must have compatible types.");
          return "boolean";
        }
        if (["and", "or"].includes(expression.operator)) {
          if (left !== "boolean" || right !== "boolean") throw new Error(`Type error: '${expression.operator}' requires booleans.`);
          return "boolean";
        }
        throw new Error(`Type error: unsupported operator '${expression.operator}'.`);
      }
    }
  }
}
