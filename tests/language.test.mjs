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


test("type diagnostics include source file, line, column, and code frame", () => {
  const source = `let count = 1\nlet age: number = "twenty"`;
  const program = new Parser(new Lexer(source).scan()).parse();
  assert.throws(
    () => new TypeChecker("main.wbf", source).check(program),
    error => {
      assert.match(error.message, /\[Wibufy Type Error\]/);
      assert.match(error.message, /main\.wbf:2:1/);
      assert.match(error.message, /2 \| let age: number = "twenty"/);
      assert.match(error.message, /expects number, got string/);
      return true;
    },
  );
});


test("lexer diagnostics include source file, line, column, and code frame", () => {
  const source = `let ok = 1\n  @`;
  assert.throws(
    () => new Lexer(source, "lexer-case.wbf").scan(),
    error => {
      assert.match(error.message, /\[Wibufy Lexer Error\]/);
      assert.match(error.message, /lexer-case\.wbf:2:3/);
      assert.match(error.message, /2 \|   @/);
      assert.match(error.message, /Unexpected character/);
      return true;
    },
  );
});

test("parser diagnostics include source file, line, column, and code frame", () => {
  const source = `let ok = 1\nprint(2`;
  const tokens = new Lexer(source, "parser-case.wbf").scan();
  assert.throws(
    () => new Parser(tokens, source, "parser-case.wbf").parse(),
    error => {
      assert.match(error.message, /\[Wibufy Parser Error\]/);
      assert.match(error.message, /parser-case\.wbf:2:8/);
      assert.match(error.message, /2 \| print\(2/);
      assert.match(error.message, /Expected .* after print expression/);
      return true;
    },
  );
});

test("lexer tracks line and column correctly after multiline strings", () => {
  const source = `let text = "first\nsecond"\n  @`;
  assert.throws(() => new Lexer(source, "multiline.wbf").scan(), /multiline\.wbf:3:3/);
});


test("runtime diagnostics include source file, line, column, and code frame", () => {
  const source = `let numerator = 10\nlet denominator = 0\nprint(numerator / denominator)`;
  const program = new Parser(new Lexer(source, "runtime-case.wbf").scan(), source, "runtime-case.wbf").parse();
  new TypeChecker("runtime-case.wbf", source).check(program);
  assert.throws(
    () => new Interpreter(() => {}, "runtime-case.wbf", source).interpret(program),
    error => {
      assert.match(error.message, /\[Wibufy Runtime Error\]/);
      assert.match(error.message, /runtime-case\.wbf:3:1/);
      assert.match(error.message, /3 \| print\(numerator \/ denominator\)/);
      assert.match(error.message, /Division by zero/);
      return true;
    },
  );
});

test("runtime errors inside functions point to the failing function statement", () => {
  const source = `fn fail() -> number {\n  return 5 / 0\n}\nprint(fail())`;
  const program = new Parser(new Lexer(source, "function-runtime.wbf").scan(), source, "function-runtime.wbf").parse();
  new TypeChecker("function-runtime.wbf", source).check(program);
  assert.throws(
    () => new Interpreter(() => {}, "function-runtime.wbf", source).interpret(program),
    error => {
      assert.match(error.message, /function-runtime\.wbf:2:3/);
      assert.match(error.message, /Division by zero/);
      return true;
    },
  );
});


test("TypeChecker resets state between separate programs", () => {
  const checker = new TypeChecker();

  const first = new Parser(new Lexer("let first = 10").scan()).parse();
  const second = new Parser(new Lexer("let first = 20").scan()).parse();

  assert.doesNotThrow(() => checker.check(first));
  assert.doesNotThrow(() => checker.check(second));
});

test("TypeChecker restores return context after a failed function check", () => {
  const checker = new TypeChecker();

  const brokenSource = `fn broken() -> number {
  return "not a number"
}`;
  const brokenProgram = new Parser(new Lexer(brokenSource).scan()).parse();

  assert.throws(
    () => checker.check(brokenProgram),
    /function returns number, got string/,
  );

  const topLevelReturn = new Parser(
    new Lexer("return 123").scan(),
  ).parse();

  assert.throws(
    () => checker.check(topLevelReturn),
    /return outside function/,
  );
});
