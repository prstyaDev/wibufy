import { basename, dirname, extname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { TypeChecker } from "./typechecker.js";
import { Interpreter } from "./interpreter.js";
import { ModuleLoader } from "./module-loader.js";
import { Compiler } from "./compiler.js";

function usage(): void {
  console.error([
    "Wibufy v0.6.0-dev.2",
    "Usage:",
    "  wibufy run <file.wbf>",
    "  wibufy build <file.wbf> [--out <file.js>]",
  ].join("\n"));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] === "run" || args[0] === "build" ? args.shift()! : "run";
  const file = args.shift();
  if (!file) { usage(); process.exitCode = 1; return; }

  let outputPath: string | undefined;
  while (args.length) {
    const option = args.shift();
    if ((option === "--out" || option === "-o") && args[0]) outputPath = args.shift();
    else { console.error(`Unknown or incomplete option '${option}'.`); usage(); process.exitCode = 1; return; }
  }

  try {
    const loaded = await new ModuleLoader().load(file);
    new TypeChecker(loaded.sourceName, loaded.source).check(loaded.program);
    if (mode === "run") {
      new Interpreter(console.log, loaded.sourceName, loaded.source).interpret(loaded.program);
      return;
    }

    const result = new Compiler().compile(loaded.program);
    const defaultName = `${basename(file, extname(file))}.js`;
    const destination = resolve(outputPath ?? resolve("dist", "build", defaultName));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, result.code, "utf8");
    console.log(`Compiled ${file} -> ${destination}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
