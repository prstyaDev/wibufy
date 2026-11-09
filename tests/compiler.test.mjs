import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Lexer } from '../dist/lexer.js';
import { Parser } from '../dist/parser.js';
import { TypeChecker } from '../dist/typechecker.js';
import { Compiler } from '../dist/compiler.js';
import { ModuleLoader } from '../dist/module-loader.js';

async function execute(code) {
  const directory = await mkdtemp(join(tmpdir(), 'wibufy-compiler-'));
  try {
    const file = join(directory, 'program.mjs');
    await writeFile(file, code, 'utf8');
    return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function compileSource(source) {
  const program = new Parser(new Lexer(source, 'compiler-test.wbf').scan(), source, 'compiler-test.wbf').parse();
  new TypeChecker('compiler-test.wbf', source).check(program);
  return new Compiler().compile(program).code;
}

test('JavaScript backend compiles functions, expressions, arrays, objects, and loops', async () => {
  const source = `
fn add(a: number, b: number) -> number { return a + b }
const values: Array<number> = [1, 2, 3]
let total: number = 0
for item in values { total = total + item }
const profile = { name: "Wibufy", score: add(total, 4) }
print(profile.name)
print(profile.score)
`;
  assert.equal(await execute(compileSource(source)), 'Wibufy\n10\n');
});

test('compiled while loops retain the interpreter safety limit', async () => {
  const source = `let count: number = 0\nwhile count < 3 { count = count + 1 }\nprint(count)`;
  assert.equal(await execute(compileSource(source)), '3\n');
});

test('compiled array reads and writes evaluate the target once and enforce bounds', async () => {
  const source = `
let values: Array<number> = [1]
values[0] = 9
print(values[0])
`;
  assert.equal(await execute(compileSource(source)), '9\n');
  const invalid = `const values: Array<number> = [1]\nprint(values[2])`;
  await assert.rejects(() => execute(compileSource(invalid)), /out of bounds/);
});

test('compiler emits standard-library native implementations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wibufy-modules-'));
  try {
    await writeFile(join(directory, 'main.wbf'), `import { abs } from "wibufy/math"\nimport { trim } from "wibufy/string"\nprint(abs(-12))\nprint(trim("  hi  "))`, 'utf8');
    const loaded = await new ModuleLoader().load(join(directory, 'main.wbf'));
    new TypeChecker(loaded.sourceName, loaded.source).check(loaded.program);
    const code = new Compiler().compile(loaded.program).code;
    assert.equal(await execute(code), '12\nhi\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('compiler preserves module exports and local import resolution after flattening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wibufy-modules-'));
  try {
    await writeFile(join(directory, 'math.wbf'), `export fn double(value: number) -> number { return value * 2 }`, 'utf8');
    await writeFile(join(directory, 'main.wbf'), `import { double } from "./math.wbf"\nprint(double(21))`, 'utf8');
    const loaded = await new ModuleLoader().load(join(directory, 'main.wbf'));
    new TypeChecker(loaded.sourceName, loaded.source).check(loaded.program);
    const code = new Compiler().compile(loaded.program).code;
    assert.equal(await execute(code), '42\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('compiler output is valid JavaScript ESM and includes no Wibufy type syntax', () => {
  const code = compileSource(`const answer: number = 42\nprint(answer)`);
  assert.match(code, /const __wibufyUser_61_6e_73_77_65_72 = 42;/);
  assert.doesNotMatch(code, /: number/);
  assert.match(code, /import \* as __wibufyFs from 'node:fs'/);
});

test('compiled primitive type guards resolve type aliases', async () => {
  const source = `type Numeric = number\nfn increment(value: number | string) -> number { if value is Numeric { return value + 1 } else { return 0 } }\nprint(increment(8))`;
  assert.equal(await execute(compileSource(source)), '9\n');
});

test('compiled division preserves Wibufy division-by-zero errors', async () => {
  const source = `const result: number = 10 / 0\nprint(result)`;
  await assert.rejects(() => execute(compileSource(source)), /Division by zero/);
});

test('compiled numeric type guards reject NaN like the interpreter', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wibufy-modules-'));
  try {
    await writeFile(join(directory, 'main.wbf'), `import { sqrt } from "wibufy/math"\nfn isNumber(value: number) -> boolean { return value is number }\nprint(isNumber(sqrt(-1)))`, 'utf8');
    const loaded = await new ModuleLoader().load(join(directory, 'main.wbf'));
    new TypeChecker(loaded.sourceName, loaded.source).check(loaded.program);
    assert.equal(await execute(new Compiler().compile(loaded.program).code), 'false\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('compiled object literals preserve own-property behavior for special names', async () => {
  const source = `const value = { toString: 7 }\nprint(value.toString)`;
  assert.equal(await execute(compileSource(source)), '7\n');
});

test('compiled namespace imports resolve through the shared module graph', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wibufy-modules-'));
  try {
    await writeFile(join(directory, 'math.wbf'), `export fn square(value: number) -> number { return value * value }`, 'utf8');
    await writeFile(join(directory, 'main.wbf'), `import * as math from "./math.wbf"\nprint(math.square(7))`, 'utf8');
    const loaded = await new ModuleLoader().load(join(directory, 'main.wbf'));
    new TypeChecker(loaded.sourceName, loaded.source).check(loaded.program);
    assert.equal(await execute(new Compiler().compile(loaded.program).code), '49\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('compiler safely encodes JavaScript reserved identifiers and helper-like names', async () => {
  const source = `
fn class(await: number) -> number {
  let default = await + 1
  return default
}
fn useHelper(__wibufyPrint: number) -> number {
  print(42)
  return __wibufyPrint
}
const enum = class(4)
print(enum)
print(useHelper(7))
`;
  assert.equal(await execute(compileSource(source)), '5\n42\n7\n');
});

test('compiled primitive type guards evaluate their input exactly once', async () => {
  const source = `
let count: number = 0
fn next() -> number {
  count = count + 1
  return count
}
print(next() is number)
print(count)
`;
  assert.equal(await execute(compileSource(source)), 'true\n1\n');
});


test('compiler emits safe string method calls with interpreter-compatible results', async () => {
  const source = `
let text = "  Wibufy Language  "
print(text.trim().toUpperCase())
print(text.includes("Language"))
print(text.indexOf("Language"))
print(text.replace("Language", "Compiler"))
`;
  assert.equal(await execute(compileSource(source)), 'WIBUFY LANGUAGE\ntrue\n9\n  Wibufy Compiler  \n');
});

test('compiled string method receivers are evaluated exactly once', async () => {
  const source = `
let count = 0
fn next() -> string {
  count = count + 1
  return "wibufy"
}
print(next().toUpperCase())
print(count)
`;
  assert.equal(await execute(compileSource(source)), 'WIBUFY\n1\n');
});
