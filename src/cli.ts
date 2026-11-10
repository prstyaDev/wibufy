import { basename, dirname, extname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { TypeChecker } from "./typechecker.js";
import { Interpreter } from "./interpreter.js";
import { ModuleLoader } from "./module-loader.js";
import { Compiler } from "./compiler.js";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { formatWibufy } from "./formatter.js";
import { runRepl } from "./repl.js";

function usage(): void {
  console.error([
    "Wibufy v0.7.0-dev.9",
    "Usage:",
    "  wibufy run <file.wbf>",
    "  wibufy build <file.wbf> [--out <file.js>]",
    "  wibufy format <file.wbf> [--write]",
    "  wibufy repl",
  ].join("\n"));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commands = ["run", "build", "format", "repl"];
  const first = args[0] ?? "";
  if (first === "--help" || first === "-h") { usage(); return; }
  if (commands.includes(first)) args.shift();
  else if (first && !first.endsWith(".wbf")) {
    console.error(`Unknown command '${first}'.`);
    usage();
    process.exitCode = 1;
    return;
  }
  const mode = commands.includes(first) ? first : "run";
  if (mode === "repl") {
    if (args.length) { console.error("Usage: wibufy repl"); process.exitCode = 1; return; }
    await runRepl();
    return;
  }
  const file = args.shift();
  if (!file) { usage(); process.exitCode = 1; return; }

  if (mode === "format") {
    const write = args.length === 1 && args[0] === "--write";
    if (args.length > 0 && !write) { console.error("Usage: wibufy format <file.wbf> [--write]"); process.exitCode = 1; return; }
    try {
      const source = await readFile(file, "utf8");
      const formatted = formatWibufy(source);
      // Refuse to rewrite syntactically invalid source.
      new Parser(new Lexer(formatted, file).scan(), formatted, file).parse();
      if (write) { await writeFile(file, formatted, "utf8"); console.log(`Formatted ${file}`); }
      else process.stdout.write(formatted);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  if (mode === "run" && args.length > 0) {
    console.error("Usage: wibufy run <file.wbf>");
    process.exitCode = 1;
    return;
  }

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
