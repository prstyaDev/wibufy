import type { Expr, Stmt } from "./ast.js";
type Value = string | number | boolean | null | WFunction;
interface Binding { value: Value; mutable: boolean }
class ReturnSignal { constructor(readonly value: Value) {} }

class Environment {
  private values = new Map<string, Binding>();
  constructor(private readonly parent?: Environment) {}
  define(name: string, value: Value, mutable: boolean): void {
    if (this.values.has(name)) throw new Error(`Variable '${name}' is already declared in this scope.`);
    this.values.set(name, { value, mutable });
  }
  hasLocal(name: string): boolean { return this.values.has(name); }
  get(name: string): Value {
    const binding = this.values.get(name);
    if (binding) return binding.value;
    if (this.parent) return this.parent.get(name);
    throw new Error(`Undefined variable '${name}'.`);
  }
  assign(name: string, value: Value): void {
    const binding = this.values.get(name);
    if (binding) {
      if (!binding.mutable) throw new Error(`Cannot assign to constant '${name}'.`);
      binding.value = value;
      return;
    }
    if (this.parent) { this.parent.assign(name, value); return; }
    throw new Error(`Undefined variable '${name}'.`);
  }
}
class WFunction {
  constructor(readonly declaration: Extract<Stmt, { kind: "function" }>, readonly closure: Environment) {}
}

export class Interpreter {
  private environment = new Environment();
  constructor(private readonly output: (value: string) => void = console.log) {}
  interpret(statements: Stmt[]): void {
    for (const statement of statements) {
      if (statement.kind === "function") this.environment.define(statement.name, new WFunction(statement, this.environment), false);
    }
    for (const statement of statements) this.execute(statement);
  }

  private execute(statement: Stmt): void {
    switch (statement.kind) {
      case "var": this.environment.define(statement.name, this.evaluate(statement.initializer), statement.mutable); return;
      case "function": if (!this.environment.hasLocal(statement.name)) this.environment.define(statement.name, new WFunction(statement, this.environment), false); return;
      case "return": throw new ReturnSignal(statement.value ? this.evaluate(statement.value) : null);
      case "print": this.output(this.stringify(this.evaluate(statement.expression))); return;
      case "expression": this.evaluate(statement.expression); return;
      case "block": {
        const previous = this.environment; this.environment = new Environment(previous);
        try { for (const child of statement.statements) this.execute(child); }
        finally { this.environment = previous; }
        return;
      }
      case "if":
        if (this.isTruthy(this.evaluate(statement.condition))) this.execute(statement.thenBranch);
        else if (statement.elseBranch) this.execute(statement.elseBranch);
        return;
      case "while": {
        let iterations = 0;
        while (this.isTruthy(this.evaluate(statement.condition))) {
          if (++iterations > 100_000) throw new Error("Loop safety limit exceeded (100000 iterations).");
          this.execute(statement.body);
        }
        return;
      }
    }
  }

  private evaluate(expression: Expr): Value {
    switch (expression.kind) {
      case "literal": return expression.value as Value;
      case "grouping": return this.evaluate(expression.expression);
      case "variable": return this.environment.get(expression.name);
      case "assign": { const value = this.evaluate(expression.value); this.environment.assign(expression.name, value); return value; }
      case "call": {
        if (expression.callee.kind !== "variable") throw new Error("Only named function calls are supported in v0.2.");
        const value = this.environment.get(expression.callee.name);
        if (!(value instanceof WFunction)) throw new Error(`'${expression.callee.name}' is not callable.`);
        const declaration = value.declaration;
        if (expression.args.length !== declaration.params.length) throw new Error(`Function '${expression.callee.name}' expects ${declaration.params.length} arguments, got ${expression.args.length}.`);
        const args = expression.args.map(argument => this.evaluate(argument));
        const previous = this.environment;
        this.environment = new Environment(value.closure);
        declaration.params.forEach((parameter, index) => this.environment.define(parameter.name, args[index]!, false));
        try {
          for (const child of declaration.body) this.execute(child);
        } catch (error) {
          if (error instanceof ReturnSignal) return error.value;
          throw error;
        } finally { this.environment = previous; }
        return null;
      }
      case "unary": {
        const right = this.evaluate(expression.right);
        if (expression.operator === "!") return !this.isTruthy(right);
        if (expression.operator === "-" && typeof right === "number") return -right;
        throw new Error(`Invalid operand for unary '${expression.operator}'.`);
      }
      case "binary": {
        const left = this.evaluate(expression.left);
        if (expression.operator === "and") return this.isTruthy(left) && this.isTruthy(this.evaluate(expression.right));
        if (expression.operator === "or") return this.isTruthy(left) || this.isTruthy(this.evaluate(expression.right));
        const right = this.evaluate(expression.right);
        switch (expression.operator) {
          case "+":
            if (typeof left === "number" && typeof right === "number") return left + right;
            if (typeof left === "string" && typeof right === "string") return left + right;
            throw new Error("Operator '+' expects two numbers or two strings.");
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

  private numeric(a: Value, b: Value, operation: (x: number, y: number) => number): number {
    if (typeof a !== "number" || typeof b !== "number") throw new Error("Arithmetic operators require numbers.");
    return operation(a, b);
  }
  private compare(a: Value, b: Value, operation: (x: number, y: number) => boolean): boolean {
    if (typeof a !== "number" || typeof b !== "number") throw new Error("Comparison operators require numbers.");
    return operation(a, b);
  }
  private isTruthy(value: Value): boolean { return value !== false && value !== null; }
  private stringify(value: Value): string { return value instanceof WFunction ? "<function>" : value === null ? "null" : String(value); }
}
