import type { Expr, Stmt } from "./ast.js";
import { formatDiagnostic } from "./diagnostics.js";
type ObjectValue = { [key: string]: Value };
type Value = string | number | boolean | null | WFunction | Value[] | ObjectValue;
interface Binding { value: Value; mutable: boolean }
class ReturnSignal { constructor(readonly value: Value) {} }
class RuntimeDiagnosticError extends Error {}
class Environment {
  private values = new Map<string, Binding>();
  constructor(private readonly parent?: Environment) {}
  define(name: string, value: Value, mutable: boolean): void { if (this.values.has(name)) throw new Error(`Variable '${name}' is already declared in this scope.`); this.values.set(name, { value, mutable }); }
  hasLocal(name: string): boolean { return this.values.has(name); }
  get(name: string): Value { const b = this.values.get(name); if (b) return b.value; if (this.parent) return this.parent.get(name); throw new Error(`Undefined variable '${name}'.`); }
  assign(name: string, value: Value): void { const b = this.values.get(name); if (b) { if (!b.mutable) throw new Error(`Cannot assign to constant '${name}'.`); b.value = value; return; } if (this.parent) { this.parent.assign(name, value); return; } throw new Error(`Undefined variable '${name}'.`); }
}
class WFunction { constructor(readonly declaration: Extract<Stmt, { kind: "function" }>, readonly closure: Environment) {} }
export class Interpreter {
  private environment = new Environment();
  constructor(private readonly output: (value: string) => void = console.log, private readonly sourceName = "<source>", private readonly sourceText = "") {}
  interpret(statements: Stmt[]): void { for (const s of statements) if (s.kind === "function") this.environment.define(s.name, new WFunction(s, this.environment), false); for (const s of statements) this.execute(s); }
  private execute(statement: Stmt): void {
    try { this.executeStatement(statement); } catch (error) { if (error instanceof ReturnSignal || error instanceof RuntimeDiagnosticError) throw error; const message = error instanceof Error ? error.message : String(error); const loc = statement.loc; if (!loc || !this.sourceText) throw new RuntimeDiagnosticError(message); throw new RuntimeDiagnosticError(formatDiagnostic("Runtime", this.sourceName, this.sourceText, loc.line, loc.column, message)); }
  }
  private executeStatement(s: Stmt): void {
    switch (s.kind) {
      case "typeAlias": return;
      case "var": this.environment.define(s.name, this.evaluate(s.initializer), s.mutable); return;
      case "function": if (!this.environment.hasLocal(s.name)) this.environment.define(s.name, new WFunction(s, this.environment), false); return;
      case "return": throw new ReturnSignal(s.value ? this.evaluate(s.value) : null);
      case "print": this.output(this.stringify(this.evaluate(s.expression))); return;
      case "expression": this.evaluate(s.expression); return;
      case "block": { const previous = this.environment; this.environment = new Environment(previous); try { for (const child of s.statements) this.execute(child); } finally { this.environment = previous; } return; }
      case "if": if (this.isTruthy(this.evaluate(s.condition))) this.execute(s.thenBranch); else if (s.elseBranch) this.execute(s.elseBranch); return;
      case "while": { let iterations = 0; while (this.isTruthy(this.evaluate(s.condition))) { if (++iterations > 100_000) throw new Error("Loop safety limit exceeded (100000 iterations)."); this.execute(s.body); } return; }
      case "forIn": { const iterable = this.evaluate(s.iterable); if (!Array.isArray(iterable)) throw new Error("for-in requires an array."); if (iterable.length > 100_000) throw new Error("Loop safety limit exceeded (100000 iterations)."); for (const item of iterable) { const previous = this.environment; this.environment = new Environment(previous); this.environment.define(s.name, item, false); try { this.execute(s.body); } finally { this.environment = previous; } } return; }
    }
  }
  private evaluate(e: Expr): Value {
    switch (e.kind) {
      case "literal": return e.value as Value;
      case "typeTest": {
        const value = this.evaluate(e.value);
        const target = typeof e.type === "string" ? e.type : e.type.kind === "namedType" ? e.type.name : "";
        if (target === "number") return typeof value === "number" && !Number.isNaN(value);
        if (target === "string") return typeof value === "string";
        if (target === "boolean") return typeof value === "boolean";
        if (target === "null") return value === null;
        throw new Error("Runtime type guards support only primitive types.");
      }
      case "grouping": return this.evaluate(e.expression);
      case "variable": return this.environment.get(e.name);
      case "assign": { const value = this.evaluate(e.value); this.environment.assign(e.name, value); return value; }
      case "array": return e.elements.map(x => this.evaluate(x));
      case "object": { const value: ObjectValue = Object.create(null) as ObjectValue; for (const p of e.properties) value[p.name] = this.evaluate(p.value); return value; }
      case "index": { const target = this.evaluate(e.object), index = this.evaluate(e.index); if (!Array.isArray(target)) throw new Error("Index access requires an array."); if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= target.length) throw new Error(`Array index ${String(index)} is out of bounds.`); return target[index]!; }
      case "indexAssign": { const target = this.evaluate(e.object), index = this.evaluate(e.index), value = this.evaluate(e.value); if (!Array.isArray(target)) throw new Error("Index assignment requires an array."); if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= target.length) throw new Error(`Array index ${String(index)} is out of bounds.`); target[index] = value; return value; }
      case "property": { const target = this.evaluate(e.object); if (Array.isArray(target) && e.name === "length") return target.length; if (target === null || typeof target !== "object" || Array.isArray(target) || target instanceof WFunction) throw new Error(`Cannot read property '${e.name}' from this value.`); if (!(e.name in target)) throw new Error(`Object has no property '${e.name}'.`); return target[e.name]!; }
      case "propertyAssign": { const target = this.evaluate(e.object), value = this.evaluate(e.value); if (target === null || typeof target !== "object" || Array.isArray(target) || target instanceof WFunction) throw new Error(`Cannot assign property '${e.name}' on this value.`); if (!(e.name in target)) throw new Error(`Object has no property '${e.name}'.`); target[e.name] = value; return value; }
      case "call": { if (e.callee.kind !== "variable") throw new Error("Only named function calls are supported in v0.2."); const value = this.environment.get(e.callee.name); if (!(value instanceof WFunction)) throw new Error(`'${e.callee.name}' is not callable.`); const declaration = value.declaration; if (e.args.length !== declaration.params.length) throw new Error(`Function '${e.callee.name}' expects ${declaration.params.length} arguments, got ${e.args.length}.`); const args = e.args.map(x => this.evaluate(x)); const previous = this.environment; this.environment = new Environment(value.closure); declaration.params.forEach((p, i) => this.environment.define(p.name, args[i]!, false)); try { for (const child of declaration.body) this.execute(child); } catch (error) { if (error instanceof ReturnSignal) return error.value; throw error; } finally { this.environment = previous; } return null; }
      case "unary": { const right = this.evaluate(e.right); if (e.operator === "!") return !this.isTruthy(right); if (e.operator === "-" && typeof right === "number") return -right; throw new Error(`Invalid operand for unary '${e.operator}'.`); }
      case "binary": { const left = this.evaluate(e.left); if (e.operator === "and") return this.isTruthy(left) && this.isTruthy(this.evaluate(e.right)); if (e.operator === "or") return this.isTruthy(left) || this.isTruthy(this.evaluate(e.right)); const right = this.evaluate(e.right); switch (e.operator) {
        case "+": if (typeof left === "number" && typeof right === "number") return left + right; if (typeof left === "string" && typeof right === "string") return left + right; throw new Error("Operator '+' expects two numbers or two strings.");
        case "-": return this.numeric(left, right, (a,b) => a-b); case "*": return this.numeric(left, right, (a,b) => a*b); case "/": return this.numeric(left, right, (a,b) => { if (b===0) throw new Error("Division by zero."); return a/b; }); case "%": return this.numeric(left, right, (a,b) => { if (b===0) throw new Error("Division by zero."); return a%b; });
        case "==": return left === right; case "!=": return left !== right; case ">": return this.compare(left,right,(a,b)=>a>b); case ">=": return this.compare(left,right,(a,b)=>a>=b); case "<": return this.compare(left,right,(a,b)=>a<b); case "<=": return this.compare(left,right,(a,b)=>a<=b);
      } }
    }
    throw new Error("Unsupported expression.");
  }
  private numeric(a: Value,b: Value,op:(x:number,y:number)=>number): number { if(typeof a!=="number"||typeof b!=="number") throw new Error("Arithmetic operators require numbers."); return op(a,b); }
  private compare(a: Value,b: Value,op:(x:number,y:number)=>boolean): boolean { if(typeof a!=="number"||typeof b!=="number") throw new Error("Comparison operators require numbers."); return op(a,b); }
  private isTruthy(v: Value): boolean { return v !== false && v !== null; }
  private stringify(v: Value): string { if (v instanceof WFunction) return "<function>"; if (v === null) return "null"; if (Array.isArray(v)) return `[${v.map(x => this.stringify(x)).join(", ")}]`; if (typeof v === "object") return `{ ${Object.entries(v).map(([k,x]) => `${k}: ${this.stringify(x)}`).join(", ")} }`; return String(v); }
}
