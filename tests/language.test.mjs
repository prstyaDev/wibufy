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

test("array literals infer element types and support indexing, mutation, and length", () => {
  assert.deepEqual(run(`let numbers = [10, 20, 30]\nprint(numbers[0])\nnumbers[1] = 99\nprint(numbers[1])\nprint(numbers.length)`), ["10", "99", "3"]);
});

test("explicit Array<T> annotations support empty arrays", () => {
  assert.deepEqual(run(`let names: Array<string> = []\nnames = ["Aki", "Yuki"]\nprint(names[1])`), ["Yuki"]);
});

test("arrays reject mixed element types and invalid assignments", () => {
  assert.throws(() => compile(`let values = [1, "two"]`), /array elements must have a consistent type/);
  assert.throws(() => compile(`let values = [1, 2]\nvalues[0] = "wrong"`), /array element expects number, got string/);
  assert.throws(() => compile(`let values = [1, 2]\nprint(values["zero"])`), /array index must be a number/);
});

test("object literals infer structural types and support property access and mutation", () => {
  assert.deepEqual(run(`let user = { name: "Prasetya", age: 24, active: sugoi }\nprint(user.name)\nuser.age = 25\nprint(user.age)\nprint(user.active)`), ["Prasetya", "25", "true"]);
});

test("object annotations validate declared properties", () => {
  assert.deepEqual(run(`let user: { name: string, age: number } = { name: "Aki", age: 18 }\nprint(user.name)`), ["Aki"]);
  assert.throws(() => compile(`let user: { name: string, age: number } = { name: "Aki", age: "old" }`), /expects Object\{name:string,age:number\}, got Object\{name:string,age:string\}/);
  assert.throws(() => compile(`let user = { name: "Aki" }\nprint(user.age)`), /object has no property 'age'/);
});

test("for-in iterates arrays in order", () => {
  assert.deepEqual(run(`let numbers = [10, 20, 30]\nfor item in numbers {\n print(item)\n}`), ["10", "20", "30"]);
});

test("for-in supports typed iteration variables and rejects non-arrays", () => {
  assert.throws(() => compile(`for value in 123 { print(value) }`), /for-in requires an array/);
  assert.throws(() => compile(`let values = [1, 2]\nfor item in values {\n print(item + "x")\n}`), /requires numbers or two strings/);
});

test("nested arrays and object properties are supported", () => {
  assert.deepEqual(run(`let matrix = [[1, 2], [3, 4]]\nprint(matrix[1][0])\nlet profile = { user: { name: "Yuki" } }\nprint(profile.user.name)`), ["3", "Yuki"]);
});

test("structural object compatibility ignores property order and permits extra fields", () => {
  assert.deepEqual(run(`let profile: { age: number, name: string } = { name: "Yuki", active: sugoi, age: 20 }\nprint(profile.name)\nprint(profile.age)`), ["Yuki", "20"]);
});

test("mutable arrays reject structurally compatible but different element types", () => {
  const source = `
koto replace(values: Array<{ name: string }>) -> void {
  values[0] = { name: "Yuki" }
}
let records: Array<{ name: string, score: number }> = [
  { name: "Aki", score: 10 }
]
replace(records)
`;

  assert.throws(() => compile(source), /expects Array<Object/);
});

test("mutable array variables cannot be reassigned across structural element types", () => {
  assert.throws(
    () => compile(`
let detailed: Array<{ name: string, score: number }> = [{ name: "Aki", score: 10 }]
let basic: Array<{ name: string }> = [{ name: "Yuki" }]
detailed = basic
`),
    /cannot assign Array<Object/,
  );
  assert.throws(
    () => compile(`
let detailed: Array<{ name: string, score: number }> = [{ name: "Aki", score: 10 }]
let basic: Array<{ name: string }> = [{ name: "Yuki" }]
basic = detailed
`),
    /cannot assign Array<Object/,
  );
});

test("array invariance is symmetric and recursive", () => {
  assert.throws(
    () => compile(`
koto replace(values: Array<{ name: string, score: number }>) -> void {}
let records: Array<{ name: string }> = [{ name: "Aki" }]
replace(records)
`),
    /expects Array<Object/,
  );

  assert.throws(
    () => compile(`
koto replace(values: Array<Array<{ name: string }>>) -> void {}
let records: Array<Array<{ name: string, score: number }>> = [
  [{ name: "Aki", score: 10 }]
]
replace(records)
`),
    /expects Array</,
  );
});

test("array element writes preserve structural object compatibility", () => {
  assert.deepEqual(
    run(`let people: Array<{ name: string }> = [{ name: "Aki" }]
people[0] = { name: "Yuki", score: 20 }
print(people[0].name)`),
    ["Yuki"],
  );
});

test("array element structural types ignore object property order", () => {
  assert.deepEqual(
    run(`let people = [{ name: "Aki", age: 18 }, { age: 20, name: "Yuki" }]
print(people[1].name)
print(people[1].age)`),
    ["Yuki", "20"],
  );
});

test("nested collection types preserve structural validation", () => {
  assert.deepEqual(run(`let records: Array<{ name: string, score: number }> = [{ name: "Aki", score: 10 }]\nprint(records[0].name)\nprint(records[0].score)`), ["Aki", "10"]);
  assert.throws(() => compile(`let records: Array<{ name: string, score: number }> = [{ name: "Aki", score: "ten" }]`), /expects Array<Object\{name:string,score:number\}>/);
});

test("array iteration variable is scoped and immutable", () => {
  assert.throws(() => compile(`let values = [1, 2]\nfor item in values {\n item = 3\n}`), /cannot assign to constant 'item'/);
  assert.throws(() => compile(`let values = [1, 2]\nfor item in values {\n print(item)\n}\nprint(item)`), /undefined variable 'item'/);
});

test("array bounds are checked at runtime", () => {
  assert.throws(() => run(`let values = [1, 2]\nprint(values[2])`), /out of bounds/);
  assert.throws(() => run(`let values = [1, 2]\nprint(values[0.5])`), /out of bounds/);
});

test("array length and object properties are read-only where specified", () => {
  assert.throws(() => compile(`let values = [1, 2]\nvalues.length = 10`), /cannot assign property 'length'/);
  assert.throws(() => compile(`let user = { name: "Aki" }\nuser.name = 123`), /property 'name' expects string, got number/);
});

test("for-in supports parenthesized form", () => {
  assert.deepEqual(run(`let values = [4, 5]\nfor (item in values) {\n print(item)\n}`), ["4", "5"]);
});

// v0.3.0 hardening: edge cases for data structures and iteration.
test("empty arrays require an explicit element type", () => {
  assert.throws(
    () => compile("let values = []"),
    /cannot infer the element type of an empty array/,
  );
  assert.deepEqual(run("let values: Array<number> = []\nprint(values.length)"), ["0"]);
});

test("array indexes reject negative, fractional, and out-of-range values at runtime", () => {
  assert.throws(() => run("let values = [10, 20]\nprint(values[-1])"), /Array index -1 is out of bounds/);
  assert.throws(() => run("let values = [10, 20]\nprint(values[0.5])"), /Array index 0.5 is out of bounds/);
  assert.throws(() => run("let values = [10, 20]\nprint(values[2])"), /Array index 2 is out of bounds/);
});

test("array index assignment rejects invalid runtime indexes", () => {
  assert.throws(() => run("let values = [10]\nvalues[-1] = 5"), /Array index -1 is out of bounds/);
  assert.throws(() => run("let values = [10]\nvalues[1.2] = 5"), /Array index 1.2 is out of bounds/);
});

test("array length is readable but cannot be assigned", () => {
  assert.deepEqual(run("let values = [1, 2, 3]\nprint(values.length)"), ["3"]);
  assert.throws(() => compile("let values = [1, 2]\nvalues.length = 10"), /cannot assign property 'length'/);
});

test("nested arrays support independent indexed mutation", () => {
  assert.deepEqual(
    run("let matrix = [[1, 2], [3, 4]]\nmatrix[1][0] = 99\nprint(matrix[0][0])\nprint(matrix[1][0])"),
    ["1", "99"],
  );
});

test("object literals reject duplicate properties", () => {
  assert.throws(
    () => compile('let user = { name: "Aki", name: "Yuki" }'),
    /duplicate object property 'name'/,
  );
});

test("object property writes reject undeclared properties and incompatible values", () => {
  assert.throws(
    () => compile('let user = { name: "Aki" }\nuser.age = 20'),
    /object has no property 'age'/,
  );
  assert.throws(
    () => compile('let user = { age: 20 }\nuser.age = "old"'),
    /property 'age' expects number, got string/,
  );
});

test("nested object properties can be mutated", () => {
  assert.deepEqual(
    run('let user = { profile: { name: "Aki" } }\nuser.profile.name = "Yuki"\nprint(user.profile.name)'),
    ["Yuki"],
  );
});

test("for-in supports nested loops and preserves iteration order", () => {
  assert.deepEqual(
    run("let rows = [[1, 2], [3, 4]]\nfor row in rows {\n for cell in row {\n  print(cell)\n }\n}"),
    ["1", "2", "3", "4"],
  );
});

test("for-in over an empty typed array executes zero times", () => {
  assert.deepEqual(
    run("let values: Array<number> = []\nfor value in values {\n print(value)\n}\nprint(\"done\")"),
    ["done"],
  );
});

test("for-in loop variable does not leak outside the loop", () => {
  assert.throws(
    () => compile("let values = [1]\nfor value in values { print(value) }\nprint(value)"),
    /undefined variable 'value'/,
  );
});
