import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Lexer } from "../dist/lexer.js";
import { Parser } from "../dist/parser.js";
import { TypeChecker } from "../dist/typechecker.js";
import { Interpreter } from "../dist/interpreter.js";
import { Compiler } from "../dist/compiler.js";

test("v0.7 developer-tools example has matching interpreter and compiler behavior", async () => {
  const source = await readFile(new URL("../examples/developer_tools.wbf", import.meta.url), "utf8");
  const program = new Parser(new Lexer(source, "developer_tools.wbf").scan(), source, "developer_tools.wbf").parse();
  new TypeChecker("developer_tools.wbf", source).check(program);

  const interpreted = [];
  new Interpreter(value => interpreted.push(String(value)), "developer_tools.wbf", source).interpret(program);

  const directory = await mkdtemp(join(tmpdir(), "wibufy-v07-integration-"));
  try {
    const output = join(directory, "developer-tools.mjs");
    await writeFile(output, new Compiler().compile(program).code, "utf8");
    const compiled = execFileSync(process.execPath, [output], { encoding: "utf8" });
    assert.equal(compiled, interpreted.join("\n") + "\n");
    assert.equal(compiled, "3\n3\nWIBUFY TOOLS\nWibufy Tools\nLanguage Server\nArray Append\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
