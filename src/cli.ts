import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { Interpreter } from "./interpreter.js";

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error("Wibufy 0.1.0\nUsage: wibufy <file.wbf>");
    process.exitCode = 1;
    return;
  }
  if (!file.endsWith(".wbf")) {
    console.error("Wibufy files must use the .wbf extension.");
    process.exitCode = 1;
    return;
  }
  try {
    const source = await readFile(resolve(file), "utf8");
    const tokens = new Lexer(source).scan();
    const program = new Parser(tokens).parse();
    new Interpreter().interpret(program);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
