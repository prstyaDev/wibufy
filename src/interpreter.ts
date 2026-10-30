import type { Expr, Stmt } from "./ast.js";

type Value = string | number | boolean | null;
interface Binding { value: Value; mutable: boolean }

class Environment {
  private values = new Map<string, Binding>();
  constructor(private readonly parent?: Environment) {}
  define(name: string, value: Value, mutable: boolean): void {
    if (this.values.has(name)) throw new Error(`Variable '${name}' is already declared in this scope.`);
    this.values.set(name, { value, mutable });
  }
  get(name: string): Value {
    const binding = this.values.get(name);
    if (binding) return binding.value;
    if (this.parent) return this.parent.get(name);
    throw new Error(`Undefined variable '${name}'.`);
  }
}

export class Interpreter {
  private environment = new Environment();
  constructor(private readonly output: (value: string) => void = console.log) {}

  interpret(statements: Stmt[]): void {
    for (const statement of statements) this.execute(statement);
  }

  private execute(stmt: Stmt): void {
    switch (stmt.kind) {
      case "var":
        this.environment.define(stmt.name, this.evaluate(stmt.initializer), stmt.mutable);
        return;
      case "print":
        this.output(this.stringify(this.evaluate(stmt.expression)));
        return;
      case "expression":
        this.evaluate(stmt.expression);
        return;
      case "block": {
        const previous = this.environment;
        this.environment = new Environment(previous);
        try { for (const child of stmt.statements) this.execute(child); }
        finally { this.environment = previous; }
        return;
      }
      case "if":
        if (this.isTruthy(this.evaluate(stmt.condition))) this.execute(stmt.thenBranch);
        else if (stmt.elseBranch) this.execute(stmt.elseBranch);
        return;
      case "while": {
        let iterations = 0;
        while (this.isTruthy(this.evaluate(stmt.condition))) {
          if (++iterations > 100_000) throw new Error("Loop safety limit exceeded (100000 iterations).");
          this.execute(stmt.body);
        }
        return;
      }
    }
  }

  private evaluate(expr: Expr): Value {
    switch (expr.kind) {
      case "literal": return expr.value as Value;
      case "grouping": return this.evaluate(expr.expression);
      case "variable": return this.environment.get(expr.name);
      case "unary": {
        const right = this.evaluate(expr.right);
        if (expr.operator === "!") return !this.isTruthy(right);
        if (expr.operator === "-" && typeof right === "number") return -right;
        throw new Error(`Invalid operand for unary '${expr.operator}'.`);
      }
      case "binary": {
        const left = this.evaluate(expr.left);
        if (expr.operator === "and") return this.isTruthy(left) && this.isTruthy(this.evaluate(expr.right));
        if (expr.operator === "or") return this.isTruthy(left) || this.isTruthy(this.evaluate(expr.right));
        const right = this.evaluate(expr.right);
        switch (expr.operator) {
          case "+": if (typeof left === "number" && typeof right === "number") return left + right;
                    if (typeof left === "string" || typeof right === "string") return this.stringify(left) + this.stringify(right);
                    throw new Error("Operator '+' expects two numbers or at least one string.");
          case "-": return this.numeric(left, right, (a, b) => a - b);
          case "*": return this.numeric(left, right, (a, b) => a * b);
          case "/": return this.numeric(left, right, (a, b) => { if (b === 0) throw new Error("Division by zero."); return a / b; });
          case "%": return this.numeric(left, right, (a, b) => { if (b === 0) throw new Error("Division by zero."); return a % b; });
          case "==": return left === right;
          case "!=": return left !== right;
          case ">": return this.compare(left, right, (a, b) => a > b);
          case ">=": return this.compare(left, right, (a, b) => a >= b);
          case "<": return this.compare(left, right, (a, b) => a < b);
          case "<=": return this.compare(left, right, (a, b) => a <= b);
        }
      }
    }
    throw new Error("Unsupported expression.");
  }

  private numeric(a: Value, b: Value, fn: (x: number, y: number) => number): number {
    if (typeof a !== "number" || typeof b !== "number") throw new Error("Arithmetic operators require numbers.");
    return fn(a, b);
  }
  private compare(a: Value, b: Value, fn: (x: number, y: number) => boolean): boolean {
    if (typeof a !== "number" || typeof b !== "number") throw new Error("Comparison operators require numbers.");
    return fn(a, b);
  }
  private isTruthy(value: Value): boolean { return value !== false && value !== null; }
  private stringify(value: Value): string { return value === null ? "null" : String(value); }
}
