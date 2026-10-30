import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { TypeChecker } from "./typechecker.js";
import { Interpreter } from "./interpreter.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] === "run" ? args.shift() : "run";
  const file = args[0];
  if (!file) {
    console.error("Wibufy v0.2.0\nUsage: wibufy run <file.wbf>");
    process.exitCode = 1;
    return;
  }
  if (extname(file) !== ".wbf") {
    console.error("Wibufy source files must use the .wbf extension.");
    process.exitCode = 1;
    return;
  }
  try {
    const source = await readFile(resolve(file), "utf8");
    const program = new Parser(new Lexer(source, file).scan(), source, file).parse();
    new TypeChecker(file, source).check(program);
    if (mode === "run") new Interpreter(console.log, file, source).interpret(program);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
