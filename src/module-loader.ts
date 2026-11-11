import { access, readFile, realpath, lstat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep, isAbsolute } from "node:path";
import type { Expr, Stmt, TypeRef } from "./ast.js";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";

interface ModuleRecord {
  path: string;
  source: string;
  prefix: string;
  program: Stmt[];
  exports: Map<string, string>;
  imports: Map<string, string>;
  namespaces: Map<string, Map<string, string>>;
}

const standardLibrary: Record<string, string> = {
  "wibufy/fs": `export fn readText(path: string) -> string { return "" }
export fn writeText(path: string, content: string) -> void {}
export fn exists(path: string) -> boolean { return false }
export fn listDir(path: string) -> Array<string> { return [""] }`,
  "wibufy/json": `export type JsonPrimitive = string | number | boolean | null
 export type JsonValue = JsonPrimitive | Array<JsonPrimitive> | {}
 export fn parse(text: string) -> JsonValue { return null }
 export fn stringify(value: JsonValue) -> string { return "" }`,
  "wibufy/string": `export fn trim(value: string) -> string { return value }
export fn split(value: string, separator: string) -> Array<string> { return [""] }
export fn join(values: Array<string>, separator: string) -> string { return "" }
export fn replace(value: string, search: string, replacement: string) -> string { return value }`,
  "wibufy/math": `export fn abs(value: number) -> number { return value }
export fn sqrt(value: number) -> number { return value }
export fn floor(value: number) -> number { return value }
export fn ceil(value: number) -> number { return value }
export fn round(value: number) -> number { return value }
export fn pow(base: number, exponent: number) -> number { return base }`,
  "wibufy/datetime": `export fn now() -> number { return 0 }
export fn parse(value: string) -> number { return 0 }
export fn toISOString(timestamp: number) -> string { return "" }`,
  "wibufy/io": `export fn readLine() -> string | null { return null }
export fn write(value: string) -> void {}
export fn writeLine(value: string) -> void {}`,
};

function nativeFunctions(program: Stmt[], moduleName: string): void {
  const nativeNames = new Set(["readText", "writeText", "exists", "listDir", "parse", "stringify", "trim", "split", "join", "replace", "abs", "sqrt", "floor", "ceil", "round", "pow", "now", "toISOString", "readLine", "write", "writeLine"]);
  for (const statement of program) if (statement.kind === "function" && nativeNames.has(statement.name)) statement.native = `${moduleName}.${statement.name}`;
}

export class ModuleLoader {
  private readonly cache = new Map<string, ModuleRecord>();
  private readonly active = new Set<string>();
  private readonly ordered: ModuleRecord[] = [];
  private nextId = 0;
  private projectRoot: string | undefined;

  async load(entryPath: string): Promise<{ program: Stmt[]; source: string; sourceName: string }> {
    const absolute = resolve(entryPath);
    this.projectRoot = await this.findProjectRoot(dirname(absolute));
    if (extname(absolute) !== ".wbf") throw new Error("Wibufy source files must use the .wbf extension.");
    await this.visit(absolute);
    const flattened: Stmt[] = [];
    for (const module of this.ordered) {
      for (const statement of module.program) {
        if (statement.kind === "import") continue;
        const transformed = this.transformStatement(statement, module, new Set(), true);
        delete transformed.exported;
        flattened.push(transformed);
      }
    }
    const entry = this.cache.get(absolute)!;
    return { program: flattened, source: entry.source, sourceName: absolute };
  }


  private async findProjectRoot(startDirectory: string): Promise<string | undefined> {
    let current = resolve(startDirectory);
    while (true) {
      try {
        await access(resolve(current, "wibufy.json"));
        return current;
      } catch {
        const parent = dirname(current);
        if (parent === current) return undefined;
        current = parent;
      }
    }
  }

  private async resolveInstalledPackage(packageName: string): Promise<string> {
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(packageName) || packageName.includes("..")) {
      throw new Error(`[Wibufy Package Error] Invalid package import '${packageName}'. Use a package name without subpaths.`);
    }
    if (!this.projectRoot) throw new Error("[Wibufy Package Error] Could not find the project root (wibufy.json) for package imports.");
    const packagesDirectory = resolve(this.projectRoot, "packages");
    const packageDirectory = resolve(packagesDirectory, packageName);
    const manifestPath = resolve(packageDirectory, "wibufy.json");
    let manifest: unknown;
    try {
      const packagesMetadata = await lstat(packagesDirectory);
      const packageMetadata = await lstat(packageDirectory);
      if (packagesMetadata.isSymbolicLink() || !packagesMetadata.isDirectory() || packageMetadata.isSymbolicLink() || !packageMetadata.isDirectory()) {
        throw new Error(`[Wibufy Package Error] Installed package path for '${packageName}' must not be a symbolic link or non-directory.`);
      }
      const [packagesReal, packageReal] = await Promise.all([realpath(packagesDirectory), realpath(packageDirectory)]);
      const packageRelative = relative(packagesReal, packageReal);
      if (packageRelative === ".." || packageRelative.startsWith(`..${sep}`) || isAbsolute(packageRelative)) {
        throw new Error(`[Wibufy Package Error] Installed package '${packageName}' resolves outside the packages directory.`);
      }
      const manifestMetadata = await lstat(manifestPath);
      if (manifestMetadata.isSymbolicLink() || !manifestMetadata.isFile()) {
        throw new Error(`[Wibufy Package Error] Package '${packageName}' manifest must be a regular file, not a link or special filesystem object.`);
      }
      manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`[Wibufy Package Error] Package '${packageName}' is not installed. Run 'wibufy install' first.`);
      }
      throw new Error(`[Wibufy Package Error] Unable to read '${packageName}' manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
      throw new Error(`[Wibufy Package Error] Package '${packageName}' has an invalid wibufy.json.`);
    }
    const data = manifest as Record<string, unknown>;
    if (data.name !== packageName || typeof data.version !== "string") {
      throw new Error(`[Wibufy Package Error] Installed package identity does not match '${packageName}'.`);
    }
    const entry = typeof data.entry === "string" ? data.entry : "src/main.wbf";
    if (!entry.endsWith(".wbf") || entry.includes("\\") || entry.includes(":") || isAbsolute(entry) || entry.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error(`[Wibufy Package Error] Package '${packageName}' has an unsafe entry path.`);
    }
    const entryPath = resolve(packageDirectory, entry);
    const relativeEntry = relative(packageDirectory, entryPath);
    if (relativeEntry === ".." || relativeEntry.startsWith(`..${sep}`) || isAbsolute(relativeEntry)) {
      throw new Error(`[Wibufy Package Error] Package '${packageName}' entry escapes its installation directory.`);
    }
    try {
      const entryMetadata = await lstat(entryPath);
      if (entryMetadata.isSymbolicLink() || !entryMetadata.isFile()) {
        throw new Error(`[Wibufy Package Error] Package '${packageName}' entry must be a regular file, not a link or special filesystem object.`);
      }
      const [rootReal, entryReal] = await Promise.all([realpath(packageDirectory), realpath(entryPath)]);
      const realRelative = relative(rootReal, entryReal);
      if (realRelative === ".." || realRelative.startsWith(`..${sep}`) || isAbsolute(realRelative)) {
        throw new Error(`[Wibufy Package Error] Package '${packageName}' entry resolves outside its installation directory.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`[Wibufy Package Error] Package '${packageName}' entry '${entry}' does not exist.`);
      throw error;
    }
    return entryPath;
  }

  private async visit(path: string): Promise<ModuleRecord> {
    const existing = this.cache.get(path);
    if (existing) {
      if (this.active.has(path)) throw new Error(`[Wibufy Module Error] Circular dependency detected: ${path}`);
      return existing;
    }
    this.active.add(path);
    const source = await readFile(path, "utf8");
    const program = new Parser(new Lexer(source, path).scan(), source, path).parse();
    this.validateModuleLevel(program, path);
    const record: ModuleRecord = { path, source, prefix: `__m${this.nextId++}`, program, exports: new Map(), imports: new Map(), namespaces: new Map() };
    this.cache.set(path, record);

    const declarations = new Set<string>();
    for (const statement of program) {
      if (statement.kind === "import" && program.indexOf(statement) < 0) throw new Error("Invalid import.");
      if (["function", "typeAlias", "var"].includes(statement.kind)) {
        const name = (statement as Extract<Stmt, { kind: "function" | "typeAlias" | "var" }>).name;
        if (declarations.has(name)) throw new Error(`[Wibufy Module Error] Duplicate declaration '${name}' in ${path}.`);
        declarations.add(name);
        if (statement.exported) record.exports.set(name, `${record.prefix}_${name}`);
      }
      if (statement.kind === "import" && statement.loc && statement.loc.line > 0) {
        // Imports are only legal at module scope; nested imports are rejected by the parser/loader boundary.
      }
    }

    for (const statement of program) {
      if (statement.kind !== "import") continue;
      if (statement.source.startsWith("wibufy/")) {
        if (!standardLibrary[statement.source]) throw new Error(`[Wibufy Module Error] Unknown standard library module '${statement.source}'.`);
        const builtin = await this.visitBuiltin(statement.source);
        this.bindImport(record, statement, builtin);
      } else if (statement.source.startsWith(".")) {
        const resolved = resolve(dirname(path), statement.source);
        if (extname(resolved) !== ".wbf") throw new Error(`[Wibufy Module Error] Local imports must use the .wbf extension: '${statement.source}'.`);
        const dependency = await this.visit(resolved);
        this.bindImport(record, statement, dependency);
      } else {
        const packageEntry = await this.resolveInstalledPackage(statement.source);
        const dependency = await this.visit(packageEntry);
        this.bindImport(record, statement, dependency);
      }
    }
    this.assertNoImportedWrites(record);
    this.active.delete(path);
    this.ordered.push(record);
    return record;
  }

  private async visitBuiltin(name: string): Promise<ModuleRecord> {
    const path = `builtin:${name}`;
    const existing = this.cache.get(path);
    if (existing) return existing;
    const source = standardLibrary[name]!;
    const program = new Parser(new Lexer(source, path).scan(), source, path).parse();
    nativeFunctions(program, name);
    const record: ModuleRecord = { path, source, prefix: `__m${this.nextId++}`, program, exports: new Map(), imports: new Map(), namespaces: new Map() };
    for (const statement of program) if (["function", "typeAlias", "var"].includes(statement.kind)) {
      const name = (statement as Extract<Stmt, { kind: "function" | "typeAlias" | "var" }>).name;
      if (statement.exported) record.exports.set(name, `${record.prefix}_${name}`);
    }
    this.cache.set(path, record);
    this.ordered.push(record);
    return record;
  }

  private validateModuleLevel(program: Stmt[], path: string): void {
    const visit = (statement: Stmt, topLevel: boolean): void => {
      if (!topLevel && (statement.kind === "import" || statement.exported)) {
        throw new Error(`[Wibufy Module Error] import/export declarations must be at module top level (${path}).`);
      }
      if (statement.kind === "function" || statement.kind === "block") {
        const body = statement.kind === "function" ? statement.body : statement.statements;
        for (const child of body) visit(child, false);
      } else if (statement.kind === "if") {
        visit(statement.thenBranch, false);
        if (statement.elseBranch) visit(statement.elseBranch, false);
      } else if (statement.kind === "while" || statement.kind === "forIn") visit(statement.body, false);
    };
    for (const statement of program) visit(statement, true);
  }

  private bindImport(owner: ModuleRecord, statement: Extract<Stmt, { kind: "import" }>, dependency: ModuleRecord): void {
    if (statement.namespace) {
      if (owner.namespaces.has(statement.namespace) || owner.imports.has(statement.namespace) || this.hasDeclaration(owner, statement.namespace)) throw new Error(`[Wibufy Module Error] Import name '${statement.namespace}' is already used.`);
      owner.namespaces.set(statement.namespace, new Map(dependency.exports));
      return;
    }
    for (const specifier of statement.specifiers) {
      const target = dependency.exports.get(specifier.imported);
      if (!target) throw new Error(`[Wibufy Module Error] Module '${statement.source}' does not export '${specifier.imported}'.`);
      if (owner.imports.has(specifier.local) || owner.namespaces.has(specifier.local) || this.hasDeclaration(owner, specifier.local)) throw new Error(`[Wibufy Module Error] Import name '${specifier.local}' is already used.`);
      owner.imports.set(specifier.local, target);
    }
  }

  private assertNoImportedWrites(module: ModuleRecord): void {
    const expression = (value: Expr, locals: Set<string>): void => {
      if (value.kind === "assign" && !locals.has(value.name) && module.imports.has(value.name)) throw new Error(`[Wibufy Module Error] Imported binding '${value.name}' is read-only.`);
      if (value.kind === "propertyAssign" && value.object.kind === "variable" && !locals.has(value.object.name) && module.namespaces.has(value.object.name) && module.namespaces.get(value.object.name)!.has(value.name)) throw new Error(`[Wibufy Module Error] Imported binding '${value.object.name}.${value.name}' is read-only.`);
      switch (value.kind) {
        case "grouping": expression(value.expression, locals); break;
        case "unary": expression(value.right, locals); break;
        case "binary": expression(value.left, locals); expression(value.right, locals); break;
        case "typeTest": expression(value.value, locals); break;
        case "assign": expression(value.value, locals); break;
        case "array": value.elements.forEach(item => expression(item, locals)); break;
        case "object": value.properties.forEach(property => expression(property.value, locals)); break;
        case "index": expression(value.object, locals); expression(value.index, locals); break;
        case "indexAssign": expression(value.object, locals); expression(value.index, locals); expression(value.value, locals); break;
        case "property": expression(value.object, locals); break;
        case "propertyAssign": expression(value.object, locals); expression(value.value, locals); break;
        case "call": expression(value.callee, locals); value.args.forEach(item => expression(item, locals)); break;
      }
    };
    const statements = (items: Stmt[], inherited: Set<string>): void => {
      const locals = new Set(inherited);
      for (const value of items) {
        switch (value.kind) {
          case "var": expression(value.initializer, locals); locals.add(value.name); break;
          case "function": { const nested = new Set(locals); value.params.forEach(parameter => nested.add(parameter.name)); statements(value.body, nested); break; }
          case "return": if (value.value) expression(value.value, locals); break;
          case "print": expression(value.expression, locals); break;
          case "expression": expression(value.expression, locals); break;
          case "block": statements(value.statements, locals); break;
          case "if": expression(value.condition, locals); statements([value.thenBranch], locals); if (value.elseBranch) statements([value.elseBranch], locals); break;
          case "while": expression(value.condition, locals); statements([value.body], locals); break;
          case "forIn": { expression(value.iterable, locals); const nested = new Set(locals); nested.add(value.name); statements([value.body], nested); break; }
          case "typeAlias": case "import": break;
        }
      }
    };
    statements(module.program, new Set());
  }

  private resolveName(name: string, module: ModuleRecord, locals: Set<string>): string {
    if (locals.has(name)) return name;
    return module.imports.get(name) ?? (this.hasDeclaration(module, name) ? `${module.prefix}_${name}` : name);
  }
  private hasDeclaration(module: ModuleRecord, name: string): boolean {
    return module.program.some(statement => (statement.kind === "function" || statement.kind === "typeAlias" || statement.kind === "var") && statement.name === name);
  }
  private type(ref: TypeRef, module: ModuleRecord, locals: Set<string>): TypeRef {
    if (typeof ref === "string") return ref;
    switch (ref.kind) {
      case "namedType": return { ...ref, name: this.resolveName(ref.name, module, locals), arguments: ref.arguments.map(arg => this.type(arg, module, locals)) };
      case "union": return { ...ref, types: ref.types.map(item => this.type(item, module, locals)) };
      case "arrayType": return { ...ref, element: this.type(ref.element, module, locals) };
      case "objectType": return { ...ref, properties: ref.properties.map(p => ({ ...p, type: this.type(p.type, module, locals) })) };
    }
  }
  private expression(expr: Expr, module: ModuleRecord, locals: Set<string>): Expr {
    switch (expr.kind) {
      case "literal": return expr;
      case "variable": return { ...expr, name: this.resolveName(expr.name, module, locals) };
      case "grouping": return { ...expr, expression: this.expression(expr.expression, module, locals) };
      case "unary": return { ...expr, right: this.expression(expr.right, module, locals) };
      case "binary": return { ...expr, left: this.expression(expr.left, module, locals), right: this.expression(expr.right, module, locals) };
      case "typeTest": return { ...expr, value: this.expression(expr.value, module, locals), type: this.type(expr.type, module, locals) };
      case "assign": return { ...expr, name: this.resolveName(expr.name, module, locals), value: this.expression(expr.value, module, locals) };
      case "array": return { ...expr, elements: expr.elements.map(item => this.expression(item, module, locals)) };
      case "object": return { ...expr, properties: expr.properties.map(p => ({ ...p, value: this.expression(p.value, module, locals) })) };
      case "index": return { ...expr, object: this.expression(expr.object, module, locals), index: this.expression(expr.index, module, locals) };
      case "indexAssign": return { ...expr, object: this.expression(expr.object, module, locals), index: this.expression(expr.index, module, locals), value: this.expression(expr.value, module, locals) };
      case "property": {
        if (expr.object.kind === "variable" && !locals.has(expr.object.name) && module.namespaces.has(expr.object.name)) {
          const target = module.namespaces.get(expr.object.name)!.get(expr.name);
          if (!target) throw new Error(`[Wibufy Module Error] Namespace '${expr.object.name}' has no export '${expr.name}'.`);
          return { kind: "variable", name: target };
        }
        return { ...expr, object: this.expression(expr.object, module, locals) };
      }
      case "propertyAssign": return { ...expr, object: this.expression(expr.object, module, locals), value: this.expression(expr.value, module, locals) };
      case "call": return { ...expr, callee: this.expression(expr.callee, module, locals), args: expr.args.map(arg => this.expression(arg, module, locals)), ...(expr.typeArguments ? { typeArguments: expr.typeArguments.map(t => this.type(t, module, locals)) } : {}) };
    }
  }
  private transformStatement(statement: Stmt, module: ModuleRecord, inherited: Set<string>, topLevel: boolean): Stmt {
    const locals = new Set(inherited);
    switch (statement.kind) {
      case "import": return statement;
      case "typeAlias": { const aliasLocals = new Set(locals); for (const parameter of statement.typeParameters) aliasLocals.add(parameter.name); return { ...statement, name: topLevel ? `${module.prefix}_${statement.name}` : statement.name, target: this.type(statement.target, module, aliasLocals) }; }
      case "function": {
        const fnLocals = new Set(locals);
        for (const parameter of statement.params) fnLocals.add(parameter.name);
        for (const parameter of statement.typeParameters) fnLocals.add(parameter.name);
        const body = this.transformStatements(statement.body, module, fnLocals, false);
        return { ...statement, name: topLevel ? `${module.prefix}_${statement.name}` : statement.name, params: statement.params.map(p => ({ ...p, type: this.type(p.type, module, fnLocals) })), returnType: this.type(statement.returnType, module, fnLocals), body };
      }
      case "var": return { ...statement, name: topLevel ? `${module.prefix}_${statement.name}` : statement.name, ...(statement.annotation ? { annotation: this.type(statement.annotation, module, locals) } : {}), initializer: this.expression(statement.initializer, module, locals) };
      case "return": return statement.value ? { ...statement, value: this.expression(statement.value, module, locals) } : statement;
      case "print": return { ...statement, expression: this.expression(statement.expression, module, locals) };
      case "expression": return { ...statement, expression: this.expression(statement.expression, module, locals) };
      case "block": return { ...statement, statements: this.transformStatements(statement.statements, module, locals, false) };
      case "if": return { ...statement, condition: this.expression(statement.condition, module, locals), thenBranch: this.transformStatement(statement.thenBranch, module, locals, false), ...(statement.elseBranch ? { elseBranch: this.transformStatement(statement.elseBranch, module, locals, false) } : {}) };
      case "while": return { ...statement, condition: this.expression(statement.condition, module, locals), body: this.transformStatement(statement.body, module, locals, false) };
      case "forIn": { const nested = new Set(locals); nested.add(statement.name); return { ...statement, iterable: this.expression(statement.iterable, module, locals), body: this.transformStatement(statement.body, module, nested, false) }; }
    }
  }
  private transformStatements(statements: Stmt[], module: ModuleRecord, inherited: Set<string>, topLevel: boolean): Stmt[] {
    const locals = new Set(inherited);
    const result: Stmt[] = [];
    for (const statement of statements) {
      if (statement.kind === "import") continue;
      const transformed = this.transformStatement(statement, module, locals, topLevel);
      result.push(transformed);
      if (!topLevel && statement.kind === "var") locals.add(statement.name);
    }
    return result;
  }
}
