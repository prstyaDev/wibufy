import { TypeChecker } from "./typechecker.js";
import { Interpreter } from "./interpreter.js";
import { ModuleLoader } from "./module-loader.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] === "run" ? args.shift() : "run";
  const file = args[0];
  if (!file) {
    console.error("Wibufy v0.5.0\nUsage: wibufy run <file.wbf>");
    process.exitCode = 1;
    return;
  }
  try {
    const loaded = await new ModuleLoader().load(file);
    new TypeChecker(loaded.sourceName, loaded.source).check(loaded.program);
    if (mode === "run") new Interpreter(console.log, loaded.sourceName, loaded.source).interpret(loaded.program);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
