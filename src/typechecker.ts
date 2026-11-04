import type { Expr, Stmt, TypeRef, TypeParameter } from "./ast.js";
import { formatDiagnostic } from "./diagnostics.js";

type PrimitiveName = "number" | "string" | "boolean" | "void" | "null" | "never";
type ValueType =
  | { kind: "primitive"; name: PrimitiveName }
  | { kind: "parameter"; name: string }
  | { kind: "array"; element: ValueType }
  | { kind: "object"; properties: Map<string, ValueType> }
  | { kind: "union"; members: ValueType[] };
interface VariableSymbol { type: ValueType; declaredType: ValueType; mutable: boolean }
interface GenericParameter { name: string; constraint?: ValueType }
interface FunctionSymbol { params: ValueType[]; returns: ValueType; typeParameters: GenericParameter[] }
interface AliasSymbol { parameters: TypeParameter[]; target: TypeRef }

const primitiveNames = new Set<PrimitiveName>(["number", "string", "boolean", "void", "null"]);
const primitive = (name: PrimitiveName): ValueType => ({ kind: "primitive", name });
const parameter = (name: string): ValueType => ({ kind: "parameter", name });
const isPrimitive = (type: ValueType, name: PrimitiveName): boolean => type.kind === "primitive" && type.name === name;

function typeKey(type: ValueType): string {
  switch (type.kind) {
    case "primitive": return type.name;
    case "parameter": return `'$${type.name}'`;
    case "array": return `Array<${typeKey(type.element)}>`;
    case "object": return `Object{${[...type.properties].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}:${typeKey(value)}`).join(",")}}`;
    case "union": return type.members.map(typeKey).join("|");
  }
}
function formatType(type: ValueType): string {
  switch (type.kind) {
    case "primitive": return type.name;
    case "parameter": return type.name;
    case "array": return `Array<${formatType(type.element)}>`;
    case "object": return `Object{${[...type.properties].map(([name, value]) => `${name}:${formatType(value)}`).join(",")}}`;
    case "union": return type.members.map(formatType).join("|");
  }
}
function unionType(types: ValueType[]): ValueType {
  const flat = types.flatMap(type => type.kind === "union" ? type.members : [type]);
  const nonBottom = flat.filter(type => !isPrimitive(type, "never"));
  const normalized = nonBottom.length ? nonBottom : flat;
  const unique = new Map<string, ValueType>();
  for (const type of normalized) unique.set(typeKey(type), type);
  const values = [...unique.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
  if (values.some(type => isPrimitive(type, "void")) && values.length > 1) throw new Error("Type error: void cannot be a member of a union.");
  if (values.length === 0) return primitive("never");
  return values.length === 1 ? values[0]! : { kind: "union", members: values };
}
function members(type: ValueType): ValueType[] { return type.kind === "union" ? type.members : [type]; }
function arrayElement(type: ValueType): ValueType | null { return type.kind === "array" ? type.element : null; }
function objectProperties(type: ValueType): Map<string, ValueType> | null { return type.kind === "object" ? type.properties : null; }
function sameType(a: ValueType, b: ValueType): boolean { return accepts(a, b) && accepts(b, a); }
function accepts(expected: ValueType, actual: ValueType): boolean {
  if (sameKey(expected, actual) || isPrimitive(actual, "never")) return true;
  if (expected.kind === "union") return members(actual).every(a => expected.members.some(e => accepts(e, a)));
  if (actual.kind === "union") return actual.members.every(a => accepts(expected, a));
  if (expected.kind === "array" && actual.kind === "array") return sameType(expected.element, actual.element);
  if (expected.kind === "object" && actual.kind === "object") {
    for (const [name, expectedType] of expected.properties) {
      const actualType = actual.properties.get(name);
      if (!actualType || !accepts(expectedType, actualType)) return false;
    }
    return true;
  }
  return false;
}
function sameKey(a: ValueType, b: ValueType): boolean { return typeKey(a) === typeKey(b); }
function withoutNull(type: ValueType): ValueType {
  const rest = members(type).filter(member => !isPrimitive(member, "null"));
  return rest.length ? unionType(rest) : primitive("never");
}
function substitute(type: ValueType, substitutions: Map<string, ValueType>): ValueType {
  if (type.kind === "parameter") return substitutions.get(type.name) ?? type;
  if (type.kind === "array") return { kind: "array", element: substitute(type.element, substitutions) };
  if (type.kind === "object") return { kind: "object", properties: new Map([...type.properties].map(([name, value]) => [name, substitute(value, substitutions)])) };
  if (type.kind === "union") return unionType(type.members.map(member => substitute(member, substitutions)));
  return type;
}
function infer(template: ValueType, actual: ValueType, names: Set<string>, found: Map<string, ValueType>): boolean {
  if (template.kind === "parameter" && names.has(template.name)) {
    const previous = found.get(template.name);
    if (!previous) { found.set(template.name, actual); return true; }
    return sameType(previous, actual);
  }
  if (sameKey(template, actual)) return true;
  if (template.kind === "union") {
    const baseline = new Map(found);
    const merged = new Map(found);

    for (const actualMember of members(actual)) {
      // Infer each actual union member independently from the original
      // bindings. This allows T to collect number | string, for example.
      const candidates = template.members.flatMap(member => {
        const candidate = new Map(baseline);
        if (!infer(member, actualMember, names, candidate)) return [];
        const added = [...candidate.keys()].filter(name => !baseline.has(name)).length;
        return [{ candidate, added }];
      }).sort((a, b) => a.added - b.added);

      if (!candidates.length) return false;

      for (const [name, value] of candidates[0]!.candidate) {
        if (baseline.has(name)) continue;
        const previous = merged.get(name);
        merged.set(name, previous ? unionType([previous, value]) : value);
      }
    }

    found.clear();
    for (const [name, value] of merged) found.set(name, value);
    return true;
  }
  if (template.kind === "array" && actual.kind === "array") return infer(template.element, actual.element, names, found);
  if (template.kind === "object" && actual.kind === "object") {
    for (const [name, value] of template.properties) {
      const got = actual.properties.get(name);
      if (!got || !infer(value, got, names, found)) return false;
    }
    return true;
  }
  return false;
}

export class TypeChecker {
  constructor(private readonly sourceName = "<source>", private readonly sourceText = "") {}
  private scopes: Map<string, VariableSymbol>[] = [new Map()];
  private functions = new Map<string, FunctionSymbol>();
  private aliases = new Map<string, AliasSymbol>();
  private currentReturn: ValueType | null = null;
  private genericScopes: Map<string, ValueType>[] = [];

  private diagnostic(message: string, statement?: Stmt): Error {
    const loc = statement?.loc;
    if (!loc) return new Error(`[Wibufy Type Error] ${message}`);
    return new Error(formatDiagnostic("Type", this.sourceName, this.sourceText, loc.line, loc.column, message));
  }
  check(program: Stmt[]): void {
    this.scopes = [new Map()]; this.functions = new Map(); this.aliases = new Map(); this.currentReturn = null; this.genericScopes = [];
    for (const statement of program) if (statement.kind === "typeAlias") {
      if (this.aliases.has(statement.name)) throw this.diagnostic(`type alias '${statement.name}' already declared.`, statement);
      this.aliases.set(statement.name, { parameters: statement.typeParameters, target: statement.target });
    }
    for (const [name, alias] of this.aliases) {
      const generic = this.makeGenericParams(alias.parameters);
      this.genericScopes.push(new Map(generic.map(p => [p.name, p.constraint ?? parameter(p.name)])));
      try { this.resolve(alias.target, new Set([name])); } finally { this.genericScopes.pop(); }
    }
    for (const statement of program) if (statement.kind === "function") {
      if (this.functions.has(statement.name)) throw this.diagnostic(`function '${statement.name}' already declared.`, statement);
      const generic = this.makeGenericParams(statement.typeParameters);
      this.genericScopes.push(new Map(generic.map(p => [p.name, p.constraint ?? parameter(p.name)])));
      try {
        const params = statement.params.map(p => this.resolve(p.type));
        const returns = this.resolve(statement.returnType);
        this.functions.set(statement.name, { params, returns, typeParameters: generic });
      } finally { this.genericScopes.pop(); }
    }
    for (const statement of program) this.statement(statement);
  }
  private makeGenericParams(params: TypeParameter[]): GenericParameter[] {
    const names = new Set<string>();
    for (const p of params) { if (names.has(p.name)) throw new Error(`Type error: duplicate type parameter '${p.name}'.`); names.add(p.name); }
    const base = new Map(params.map(p => [p.name, parameter(p.name)]));
    this.genericScopes.push(base);
    try { return params.map(p => p.constraint ? { name: p.name, constraint: this.resolve(p.constraint) } : { name: p.name }); }
    finally { this.genericScopes.pop(); }
  }
  private resolve(ref: TypeRef, stack = new Set<string>()): ValueType {
    if (typeof ref === "string") return primitive(ref);
    if (ref.kind === "arrayType") return { kind: "array", element: this.resolve(ref.element, stack) };
    if (ref.kind === "objectType") {
      const properties = new Map<string, ValueType>();
      for (const property of ref.properties) {
        if (properties.has(property.name)) throw new Error(`Type error: duplicate object type property '${property.name}'.`);
        properties.set(property.name, this.resolve(property.type, stack));
      }
      return { kind: "object", properties };
    }
    if (ref.kind === "union") return unionType(ref.types.map(type => this.resolve(type, stack)));
    if (ref.name === "Array") {
      if (ref.arguments.length !== 1) throw new Error("Type error: Array expects exactly one type argument.");
      return { kind: "array", element: this.resolve(ref.arguments[0]!, stack) };
    }
    if (primitiveNames.has(ref.name as PrimitiveName)) {
      if (ref.arguments.length) throw new Error(`Type error: '${ref.name}' is not generic.`);
      return primitive(ref.name as PrimitiveName);
    }
    for (let i = this.genericScopes.length - 1; i >= 0; i--) {
      const scope = this.genericScopes[i]!;
      if (scope.has(ref.name)) {
        if (ref.arguments.length) throw new Error(`Type error: type parameter '${ref.name}' does not accept arguments.`);
        return parameter(ref.name);
      }
    }
    const alias = this.aliases.get(ref.name);
    if (!alias) throw new Error(`Type error: unknown type '${ref.name}'.`);
    if (stack.has(ref.name)) throw new Error(`Type error: circular type alias involving '${ref.name}'.`);
    if (alias.parameters.length !== ref.arguments.length) throw new Error(`Type error: type '${ref.name}' expects ${alias.parameters.length} type arguments, got ${ref.arguments.length}.`);
    const substitutions = new Map<string, ValueType>();
    alias.parameters.forEach((p, i) => substitutions.set(p.name, this.resolve(ref.arguments[i]!, stack)));
    const generic = this.makeGenericParams(alias.parameters);
    const next = new Set(stack); next.add(ref.name);
    this.genericScopes.push(new Map(generic.map(p => [p.name, p.constraint ?? parameter(p.name)])));
    let target: ValueType;
    try { target = this.resolve(alias.target, next); } finally { this.genericScopes.pop(); }
    for (const p of generic) {
      if (p.constraint) {
        const actual = substitutions.get(p.name)!;
        const constraint = substitute(p.constraint, substitutions);
        if (!this.satisfiesConstraint(constraint, actual)) throw new Error(`Type error: type argument '${formatType(actual)}' does not satisfy constraint '${formatType(constraint)}' for '${p.name}'.`);
      }
    }
    return substitute(target, substitutions);
  }
  private declare(name: string, type: ValueType, mutable: boolean): void {
    const scope = this.scopes[this.scopes.length - 1]!;
    if (scope.has(name)) throw new Error(`Type error: '${name}' already declared in this scope.`);
    scope.set(name, { type, declaredType: type, mutable });
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
  private statementCore(s: Stmt): void {
    switch (s.kind) {
      case "import": throw new Error("Type error: imports must be resolved by the module loader before type checking.");
      case "typeAlias": if (this.scopes.length !== 1) throw new Error("Type error: type aliases must be declared at top level."); return;
      case "var": {
        if (this.scopes.length === 1 && this.functions.has(s.name)) throw new Error(`Type error: '${s.name}' conflicts with a function declaration.`);
        const expected = s.annotation ? this.resolve(s.annotation) : null;
        const actual = s.initializer.kind === "array" && s.initializer.elements.length === 0 && expected?.kind === "array" ? expected : this.expression(s.initializer, expected ?? undefined);
        const target = expected ?? actual;
        if (!accepts(target, actual)) throw new Error(`Type error: variable '${s.name}' expects ${formatType(target)}, got ${formatType(actual)}.`);
        if (isPrimitive(target, "void")) throw new Error("Type error: variable cannot have type void.");
        this.declare(s.name, target, s.mutable); return;
      }
      case "function": {
        if (this.scopes.length !== 1) throw new Error("Type error: function declarations must be at top level in v0.2.");
        if (this.scopes[0]!.has(s.name)) throw new Error(`Type error: function '${s.name}' conflicts with a variable declaration.`);
        const generic = this.makeGenericParams(s.typeParameters);
        const previousReturn = this.currentReturn;
        this.genericScopes.push(new Map(generic.map(p => [p.name, p.constraint ?? parameter(p.name)])));
        try {
          this.withScope(() => {
            for (const p of s.params) this.declare(p.name, this.resolve(p.type), false);
            this.currentReturn = this.resolve(s.returnType);
            for (const child of s.body) this.statement(child);
            if (!isPrimitive(this.currentReturn!, "void") && !this.alwaysReturns(s.body)) throw new Error(`Type error: function '${s.name}' must return ${formatType(this.currentReturn!)} on every path.`);
          });
        } finally { this.currentReturn = previousReturn; this.genericScopes.pop(); }
        return;
      }
      case "return": {
        if (this.currentReturn === null) throw new Error("Type error: return outside function.");
        const actual = s.value ? this.expression(s.value) : primitive("void");
        if (!accepts(this.currentReturn, actual)) throw new Error(`Type error: function returns ${formatType(this.currentReturn)}, got ${formatType(actual)}.`);
        return;
      }
      case "print": if (isPrimitive(this.expression(s.expression), "void")) throw new Error("Type error: cannot print a void expression."); return;
      case "expression": this.expression(s.expression); return;
      case "block": this.withScope(() => { for (const child of s.statements) this.statement(child); }); return;
      case "if": {
        if (!isPrimitive(this.expression(s.condition), "boolean")) throw new Error("Type error: if condition must be boolean.");
        const narrowing = this.narrowing(s.condition);
        if (narrowing) {
          const symbol = this.lookup(narrowing.name), original = symbol.type;
          symbol.type = narrowing.whenTrue; try { this.statement(s.thenBranch); } finally { symbol.type = original; }
          if (s.elseBranch) { symbol.type = narrowing.whenFalse; try { this.statement(s.elseBranch); } finally { symbol.type = original; } }
        } else { this.statement(s.thenBranch); if (s.elseBranch) this.statement(s.elseBranch); }
        return;
      }
      case "while": if (!isPrimitive(this.expression(s.condition), "boolean")) throw new Error("Type error: while condition must be boolean."); this.statement(s.body); return;
      case "forIn": {
        const iterable = this.expression(s.iterable), element = arrayElement(iterable);
        if (!element) throw new Error(`Type error: for-in requires an array, got ${formatType(iterable)}.`);
        this.withScope(() => { this.declare(s.name, element, false); this.statement(s.body); }); return;
      }
    }
  }
  private narrowing(e: Expr): { name: string; whenTrue: ValueType; whenFalse: ValueType } | null {
    if (e.kind === "typeTest" && e.value.kind === "variable") {
      const current = this.lookup(e.value.name).type, tested = this.resolve(e.type);
      const hit = members(current).filter(member => accepts(tested, member));
      if (!hit.length) return null;
      const rest = members(current).filter(member => !hit.some(m => sameType(m, member)));
      return { name: e.value.name, whenTrue: unionType(hit), whenFalse: rest.length ? unionType(rest) : primitive("never") };
    }
    if (e.kind === "binary" && (e.operator === "!=" || e.operator === "==")) {
      const value = e.left.kind === "variable" && e.right.kind === "literal" && e.right.value === null ? e.left
        : e.right.kind === "variable" && e.left.kind === "literal" && e.left.value === null ? e.right : null;
      if (value) {
        const current = this.lookup(value.name).type;
        if (!members(current).some(member => isPrimitive(member, "null"))) return null;
        const nonNull = withoutNull(current);
        return e.operator === "!=" ? { name: value.name, whenTrue: nonNull, whenFalse: primitive("null") }
          : { name: value.name, whenTrue: primitive("null"), whenFalse: nonNull };
      }
    }
    return null;
  }
  private alwaysReturns(statements: Stmt[]): boolean {
    for (const s of statements) {
      if (s.kind === "return") return true;
      if (s.kind === "block" && this.alwaysReturns(s.statements)) return true;
      if (s.kind === "if" && s.elseBranch && this.statementAlwaysReturns(s.thenBranch) && this.statementAlwaysReturns(s.elseBranch)) return true;
    }
    return false;
  }
  private statementAlwaysReturns(s: Stmt): boolean {
    if (s.kind === "return") return true;
    if (s.kind === "block") return this.alwaysReturns(s.statements);
    if (s.kind === "if") return !!s.elseBranch && this.statementAlwaysReturns(s.thenBranch) && this.statementAlwaysReturns(s.elseBranch);
    return false;
  }
  private expression(e: Expr, expected?: ValueType): ValueType {
    switch (e.kind) {
      case "literal": return e.value === null ? primitive("null") : typeof e.value === "number" ? primitive("number") : typeof e.value === "string" ? primitive("string") : primitive("boolean");
      case "typeTest": {
        const actual = this.expression(e.value), tested = this.resolve(e.type);
        if (tested.kind !== "primitive" || !["number", "string", "boolean", "null"].includes(tested.name)) throw new Error("Type error: 'is' supports only number, string, boolean, and null.");
        if (!members(actual).some(member => accepts(tested, member))) throw new Error(`Type error: type '${formatType(actual)}' can never match '${formatType(tested)}'.`);
        return primitive("boolean");
      }
      case "grouping": return this.expression(e.expression);
      case "variable": return this.lookup(e.name).type;
      case "assign": {
        const symbol = this.lookup(e.name);
        if (!symbol.mutable) throw new Error(`Type error: cannot assign to constant '${e.name}'.`);
        const actual = this.expression(e.value);
        if (!accepts(symbol.declaredType, actual)) throw new Error(`Type error: '${e.name}' is ${formatType(symbol.declaredType)}, cannot assign ${formatType(actual)}.`);
        symbol.type = actual; return actual;
      }
      case "array": {
        const contextualElement = expected?.kind === "array" ? expected.element : null;
        if (!e.elements.length) { if (contextualElement) return expected!; throw new Error("Type error: cannot infer the element type of an empty array; add an Array<T> annotation."); }
        if (contextualElement) {
          for (const element of e.elements) {
            const actual = this.expression(element, contextualElement);
            if (!accepts(contextualElement, actual)) throw new Error(`Type error: array expects Array<${formatType(contextualElement)}>, got Array<${formatType(actual)}>.`);
          }
          return expected!;
        }
        const types = e.elements.map(element => this.expression(element)), first = types[0]!;
        const bad = types.find(type => !sameType(first, type));
        if (bad) throw new Error(`Type error: array elements must have a consistent type; expected ${formatType(first)}, got ${formatType(bad)}.`);
        return { kind: "array", element: first };
      }
      case "object": {
        const properties = new Map<string, ValueType>();
        for (const property of e.properties) {
          if (properties.has(property.name)) throw new Error(`Type error: duplicate object property '${property.name}'.`);
          properties.set(property.name, this.expression(property.value));
        }
        return { kind: "object", properties };
      }
      case "index": {
        const object = this.expression(e.object), index = this.expression(e.index);
        if (!isPrimitive(index, "number")) throw new Error("Type error: array index must be a number.");
        const element = arrayElement(object);
        if (!element) throw new Error(`Type error: cannot index value of type ${formatType(object)}; expected an array.`);
        return element;
      }
      case "indexAssign": {
        const object = this.expression(e.object), index = this.expression(e.index), value = this.expression(e.value);
        if (!isPrimitive(index, "number")) throw new Error("Type error: array index must be a number.");
        const element = arrayElement(object);
        if (!element) throw new Error(`Type error: cannot assign an index on ${formatType(object)}.`);
        if (!accepts(element, value)) throw new Error(`Type error: array element expects ${formatType(element)}, got ${formatType(value)}.`);
        return value;
      }
      case "property": {
        const object = this.expression(e.object);
        if (arrayElement(object) && e.name === "length") return primitive("number");
        const properties = objectProperties(this.constraintFor(object) ?? object);
        if (!properties) throw new Error(`Type error: property '${e.name}' is not available on ${formatType(object)}.`);
        const type = properties.get(e.name);
        if (!type) throw new Error(`Type error: object has no property '${e.name}'.`);
        return type;
      }
      case "propertyAssign": {
        const object = this.expression(e.object), value = this.expression(e.value);
        const properties = objectProperties(this.constraintFor(object) ?? object);
        if (!properties) throw new Error(`Type error: cannot assign property '${e.name}' on ${formatType(object)}.`);
        const expectedType = properties.get(e.name);
        if (!expectedType) throw new Error(`Type error: object has no property '${e.name}'.`);
        if (!accepts(expectedType, value)) throw new Error(`Type error: property '${e.name}' expects ${formatType(expectedType)}, got ${formatType(value)}.`);
        return value;
      }
      case "call": {
        if (e.callee.kind !== "variable") throw new Error("Type error: only named function calls are supported.");
        const name = e.callee.name, fn = this.functions.get(name);
        if (!fn) throw new Error(`Type error: unknown function '${name}'.`);
        if (e.args.length !== fn.params.length) throw new Error(`Type error: '${name}' expects ${fn.params.length} arguments, got ${e.args.length}.`);
        const genericNames = new Set(fn.typeParameters.map(p => p.name)), found = new Map<string, ValueType>();
        if (e.typeArguments && e.typeArguments.length !== fn.typeParameters.length) throw new Error(`Type error: '${name}' expects ${fn.typeParameters.length} explicit type arguments, got ${e.typeArguments.length}.`);
        if (!fn.typeParameters.length) {
          if (e.typeArguments) throw new Error(`Type error: function '${name}' is not generic.`);
          const actuals = e.args.map((arg, i) => this.expression(arg, fn.params[i]));
          fn.params.forEach((expectedType, i) => { const actual = actuals[i]!; if (!accepts(expectedType, actual)) throw new Error(`Type error: argument ${i + 1} of '${name}' expects ${formatType(expectedType)}, got ${formatType(actual)}.`); });
          return fn.returns;
        }
        if (e.typeArguments) fn.typeParameters.forEach((p, i) => found.set(p.name, this.resolve(e.typeArguments![i]!)));
        const actuals = e.args.map((arg, i) => this.expression(arg, e.typeArguments ? substitute(fn.params[i]!, found) : undefined));
        if (!e.typeArguments) fn.params.forEach((expectedType, i) => {
          const actual = actuals[i]!;
          if (!infer(expectedType, actual, genericNames, found)) throw new Error(`Type error: cannot infer type arguments for '${name}' from parameter ${i + 1} (${formatType(expectedType)} versus ${formatType(actual)}).`);
        });
        for (const p of fn.typeParameters) {
          const value = found.get(p.name);
          if (!value) throw new Error(`Type error: cannot infer generic type parameter '${p.name}' for '${name}'.`);
          if (p.constraint) {
            const constraint = substitute(p.constraint, found);
            if (!this.satisfiesConstraint(constraint, value)) throw new Error(`Type error: type argument '${formatType(value)}' does not satisfy constraint '${formatType(constraint)}' for '${p.name}'.`);
          }
        }
        fn.params.forEach((expectedType, i) => {
          const resolved = substitute(expectedType, found), actual = actuals[i]!;
          if (!accepts(resolved, actual)) throw new Error(`Type error: argument ${i + 1} of '${name}' expects ${formatType(resolved)}, got ${formatType(actual)}.`);
        });
        return substitute(fn.returns, found);
      }
      case "unary": {
        const type = this.expression(e.right);
        if (e.operator === "!" && isPrimitive(type, "boolean")) return primitive("boolean");
        if (e.operator === "-" && isPrimitive(type, "number")) return primitive("number");
        if (isPrimitive(type, "never")) return type;
        throw new Error(`Type error: invalid operand '${e.operator}' for ${formatType(type)}.`);
      }
      case "binary": {
        const left = this.expression(e.left), right = this.expression(e.right);
        if (isPrimitive(left, "never") || isPrimitive(right, "never")) return primitive("never");
        if (["+", "-", "*", "/", "%"].includes(e.operator)) {
          if (e.operator === "+" && isPrimitive(left, "string") && isPrimitive(right, "string")) return primitive("string");
          if (!isPrimitive(left, "number") || !isPrimitive(right, "number")) throw new Error(`Type error: operator '${e.operator}' requires numbers${e.operator === "+" ? " or two strings" : ""}.`);
          return primitive("number");
        }
        if ([">", ">=", "<", "<="] .includes(e.operator)) {
          if (!isPrimitive(left, "number") || !isPrimitive(right, "number")) throw new Error("Type error: comparisons require numbers.");
          return primitive("boolean");
        }
        if (["==", "!="].includes(e.operator)) {
          if (!accepts(left, right) && !accepts(right, left)) throw new Error("Type error: equality operands must have compatible types.");
          return primitive("boolean");
        }
        if (["and", "or"].includes(e.operator)) {
          if (!isPrimitive(left, "boolean") || !isPrimitive(right, "boolean")) throw new Error(`Type error: '${e.operator}' requires booleans.`);
          return primitive("boolean");
        }
        throw new Error(`Type error: unsupported operator '${e.operator}'.`);
      }
    }
  }
  private satisfiesConstraint(constraint: ValueType, actual: ValueType): boolean {
    return accepts(constraint, this.constraintFor(actual) ?? actual);
  }
  private constraintFor(type: ValueType): ValueType | null {
    let current = type;
    const seen = new Set<string>();
    while (current.kind === "parameter" && !seen.has(current.name)) {
      seen.add(current.name);
      let constraint: ValueType | undefined;
      for (let i = this.genericScopes.length - 1; i >= 0; i--) {
        constraint = this.genericScopes[i]!.get(current.name);
        if (constraint) break;
      }
      if (!constraint || constraint.kind === "parameter" && constraint.name === current.name) return null;
      current = constraint;
    }
    return current;
  }
}
