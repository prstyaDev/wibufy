import test from "node:test";
import assert from "node:assert/strict";
import { Lexer } from "../dist/lexer.js";
import { Parser } from "../dist/parser.js";
import { TypeChecker } from "../dist/typechecker.js";
import { Interpreter } from "../dist/interpreter.js";

function compile(source) {
  const tokens = new Lexer(source).scan();
  const program = new Parser(tokens).parse();
  new TypeChecker().check(program);
  return program;
}
function run(source) {
  const output = [];
  new Interpreter(value => output.push(value)).interpret(compile(source));
  return output;
}

test("Wibufy aliases normalize to standard keyword tokens", () => {
  const tokens = new Lexer("koto senpai sugoi muri").scan();
  assert.deepEqual(tokens.slice(0, 4).map(token => token.type), ["fn", "const", "true", "false"]);
});

test("aliases execute with the same semantics as standard keywords", () => {
  assert.deepEqual(run(`senpai name = "Wibufy"\nlet yes = sugoi\nlet no = muri\nprint(name)\nprint(yes)\nprint(no)`), ["Wibufy", "true", "false"]);
});

test("typed functions, calls, return values, and forward references work", () => {
  assert.deepEqual(run(`let result = twice(21)\nkoto twice(value: number) -> number {\n return value * 2\n}\nprint(result)`), ["42"]);
});

test("inferred variables support compatible reassignment", () => {
  assert.deepEqual(run(`let count = 1\ncount = count + 4\nprint(count)`), ["5"]);
});

test("nullable values narrow after a null check", () => {
  assert.deepEqual(run(`let nickname: string | null = "Senpai"\nif nickname != null {\n print("Hello, " + nickname)\n}`), ["Hello, Senpai"]);
});

test("multiline expressions and multiline call arguments parse", () => {
  assert.deepEqual(run(`fn add(a: number, b: number) -> number { return a + b }\nprint(add(\n  10,\n  32\n))\nlet total = 1 +\n  2 +\n  3\nprint(total)`), ["42", "6"]);
});

test("reserved aliases cannot be used as identifiers", () => {
  assert.throws(() => compile("let koto = 1"), /Expected variable name/);
  assert.throws(() => compile("let senpai = 1"), /Expected variable name/);
  assert.throws(() => compile("let sugoi = 1"), /Expected variable name/);
  assert.throws(() => compile("let muri = 1"), /Expected variable name/);
});

test("type errors are detected before execution", () => {
  assert.throws(() => compile(`let score: number = "wrong"`), /expects number, got string/);
  assert.throws(() => compile(`fn broken() -> number { if sugoi { return 1 } }`), /must return number on every path/);
});

test("immutable bindings cannot be reassigned", () => {
  assert.throws(() => compile(`senpai version = "0.2"\nversion = "0.3"`), /cannot assign to constant/);
});

test("newline or semicolon is required between statements", () => {
  assert.throws(() => compile("let a = 1 let b = 2"), /Expected a newline/);
});

test("nullable annotations accept only T | null in v0.2", () => {
  assert.throws(() => compile("let value: string | number = \"x\""), /nullable types must use/);
});

test("semicolon terminators and symbolic logical operators work", () => {
  assert.deepEqual(run(`let ready = true;\nlet allowed = ready && sugoi || false;\nprint(allowed);`), ["true"]);
});

test("functions validate parameter and return types", () => {
  assert.throws(() => compile(`fn add(a: number) -> number { return a }\nadd("one")`), /expects number, got string/);
  assert.throws(() => compile(`fn wrong() -> string { return 123 }`), /function returns string, got number/);
});

test("nested function declarations are rejected in v0.2", () => {
  assert.throws(() => compile(`if sugoi { fn nested() -> void {} }`), /function declarations must be at top level/);
});

test("assignment may continue on the following line after '='", () => {
  assert.deepEqual(run(`let value =\n  42\nprint(value)`), ["42"]);
});

test("recursive functions and complete if/else returns work", () => {
  assert.deepEqual(run(`fn factorial(n: number) -> number {\n if n <= 1 { return 1 } else { return n * factorial(n - 1) }\n}\nprint(factorial(5))`), ["120"]);
});

test("nullable values can be passed after narrowing", () => {
  assert.deepEqual(run(`fn greet(name: string) -> void { print("Hi, " + name) }\nlet name: string | null = "Wibufy"\nif name != null { greet(name) }`), ["Hi, Wibufy"]);
});
