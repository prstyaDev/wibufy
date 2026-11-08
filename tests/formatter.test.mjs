import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatWibufy } from "../dist/formatter.js";
import { Lexer } from "../dist/lexer.js";
import { Parser } from "../dist/parser.js";

const parse = (source) => new Parser(new Lexer(source).scan(), source).parse();

test("formatter normalizes declarations, operators, and block indentation", () => {
  const source = 'fn add(a:number,b:number)->number{let total=a+b\nreturn total}\nprint(add(2,3))';
  const formatted = formatWibufy(source);
  assert.equal(formatted, 'fn add(a: number, b: number) -> number {\n    let total = a + b\n    return total\n}\nprint(add(2, 3))\n');
  assert.doesNotThrow(() => parse(formatted));
});

test("formatter preserves Wibufy aliases and string contents", () => {
  const formatted = formatWibufy('koto greet(name:string)->string{return "konnichiwa,\\n"+name}\nsenpai enabled=true');
  assert.match(formatted, /koto greet/);
  assert.match(formatted, /senpai enabled = true/);
  assert.match(formatted, /"konnichiwa,\\n"/);
  assert.doesNotThrow(() => parse(formatted));
});

test("formatter is stable on already formatted source", async () => {
  const source = await readFile(new URL("../examples/hello.wbf", import.meta.url), "utf8");
  const once = formatWibufy(source);
  assert.equal(formatWibufy(once), once);
  assert.doesNotThrow(() => parse(once));
});

test("formatter retains line comments", () => {
  const formatted = formatWibufy('let answer=42 // the answer\nprint(answer)');
  assert.match(formatted, /\/\/ the answer/);
  assert.doesNotThrow(() => parse(formatted));
});
