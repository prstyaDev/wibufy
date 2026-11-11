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
import {
  initProject, loadProjectManifest, installProjectDependencies,
  addProjectDependency, removeProjectDependency, updateProjectDependencies, listProjectDependencies,
  packProject, publishProject, searchLocalRegistry,
} from "./package-manager/index.js";

function usage(): void {
  console.error([
    "Wibufy v0.8.0-dev.8.1",
    "Usage:",
    "  wibufy run <file.wbf>",
    "  wibufy build <file.wbf> [--out <file.js>]",
    "  wibufy format <file.wbf> [--write]",
    "  wibufy repl",
    "  wibufy init [project-name] [--force]",
    "  wibufy validate [project-directory]",
    "  wibufy install --archive <package.tar.gz> [--archive <package.tar.gz> ...]",
    "  wibufy add <name> <range> --archive <package.tar.gz> [--archive <package.tar.gz> ...]",
    "  wibufy remove <name>",
    "  wibufy update --archive <package.tar.gz> [--archive <package.tar.gz> ...]",
    "  wibufy list",
    "  wibufy pack [output.tar.gz]",
    "  wibufy publish [project-directory]",
    "  wibufy search [query]",
  "  wibufy --version",
  ].join("\n"));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commands = ["run", "build", "format", "repl", "init", "validate", "install", "add", "remove", "update", "list", "pack", "publish", "search"];
  const first = args[0] ?? "";
  if (first === "--help" || first === "-h") { usage(); return; }
  if (first === "--version" || first === "-v") { console.log("Wibufy v0.8.0-dev.8.1"); return; }
  if (commands.includes(first)) args.shift();
  else if (first && !first.endsWith(".wbf")) {
    console.error(`Unknown command '${first}'.`);
    usage();
    process.exitCode = 1;
    return;
  }
  const mode = commands.includes(first) ? first : "run";
  if (mode === "init") {
    if (args.includes("--help") || args.includes("-h")) {
      console.log("Usage: wibufy init [project-name] [--force]");
      return;
    }
    const force = args.includes("--force");
    const positional = args.filter((argument) => argument !== "--force");
    if (positional.length > 1 || args.some((argument) => argument.startsWith("-") && argument !== "--force")) {
      console.error("Usage: wibufy init [project-name] [--force]");
      process.exitCode = 1;
      return;
    }
    try {
      const directory = await initProject({ ...(positional[0] ? { name: positional[0], directory: positional[0] } : {}), force });
      console.log(`Initialized Wibufy project at ${directory}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  if (mode === "validate") {
    if (args.includes("--help") || args.includes("-h")) {
      console.log("Usage: wibufy validate [project-directory]");
      return;
    }
    if (args.length > 1 || args.some((argument) => argument.startsWith("-"))) {
      console.error("Usage: wibufy validate [project-directory]");
      process.exitCode = 1;
      return;
    }
    try {
      const manifest = await loadProjectManifest(args[0] ?? process.cwd());
      console.log(`Valid Wibufy project: ${manifest.name}@${manifest.version}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  if (mode === "install") {
    if (args.includes("--help") || args.includes("-h")) {
      console.log("Usage: wibufy install --archive <package.tar.gz> [--archive <package.tar.gz> ...]");
      return;
    }
    const archives: string[] = [];
    while (args.length) {
      const option = args.shift();
      if (option === "--archive" && args[0] && !args[0]!.startsWith("-")) archives.push(args.shift()!);
      else {
        console.error("Usage: wibufy install --archive <package.tar.gz> [--archive <package.tar.gz> ...]");
        process.exitCode = 1;
        return;
      }
    }
    if (archives.length === 0) {
      console.error("No package archives supplied. Use --archive; local registry integration is planned for a later milestone.");
      process.exitCode = 1;
      return;
    }
    try {
      const result = await installProjectDependencies(process.cwd(), { archives });
      console.log(result.reusedLockfile ? "Installed packages from strict lockfile." : "Resolved dependencies and created wibufy-lock.json.");
      for (const item of result.installed) console.log(`  + ${item}`);
      if (result.installed.length === 0) console.log("No dependencies to install.");
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  if (mode === "add" || mode === "update") {
    const usageText = mode === "add"
      ? "Usage: wibufy add <name> <range> --archive <package.tar.gz> [--archive <package.tar.gz> ...]"
      : "Usage: wibufy update --archive <package.tar.gz> [--archive <package.tar.gz> ...]";
    if (args.includes("--help") || args.includes("-h")) { console.log(usageText); return; }
    const positional: string[] = [];
    const archives: string[] = [];
    while (args.length) {
      const option = args.shift()!;
      if (option === "--archive" && args[0] && !args[0]!.startsWith("-")) archives.push(args.shift()!);
      else if (!option.startsWith("-")) positional.push(option);
      else { console.error(usageText); process.exitCode = 1; return; }
    }
    if (archives.length === 0 || (mode === "add" ? positional.length !== 2 : positional.length !== 0)) {
      console.error(usageText); process.exitCode = 1; return;
    }
    try {
      const result = mode === "add"
        ? await addProjectDependency(process.cwd(), positional[0]!, positional[1]!, archives)
        : await updateProjectDependencies(process.cwd(), archives);
      console.log(mode === "add" ? "Added dependency and updated strict lockfile." : "Updated dependencies and strict lockfile.");
      for (const item of result.installed) console.log(`  + ${item}`);
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
    return;
  }

  if (mode === "remove") {
    if (args.includes("--help") || args.includes("-h")) { console.log("Usage: wibufy remove <name>"); return; }
    if (args.length !== 1 || args[0]!.startsWith("-")) { console.error("Usage: wibufy remove <name>"); process.exitCode = 1; return; }
    try {
      const lock = await removeProjectDependency(process.cwd(), args[0]!);
      console.log(`Removed '${args[0]}'. Strict lockfile updated.`);
      for (const item of lock.packages) console.log(`  ${item.name}@${item.version}`);
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
    return;
  }

  if (mode === "list") {
    if (args.length) { console.error("Usage: wibufy list"); process.exitCode = 1; return; }
    try {
      const lock = await listProjectDependencies(process.cwd());
      if (!lock.packages.length) console.log("No dependencies installed.");
      else {
        const direct = new Set(Object.keys(lock.dependencies));
        console.log("Wibufy dependencies:");
        for (const item of lock.packages) console.log(`  ${direct.has(item.name) ? "direct" : "transitive"}  ${item.name}@${item.version}`);
      }
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
    return;
  }



  if (mode === "pack") {
    if (args.includes("--help") || args.includes("-h")) { console.log("Usage: wibufy pack [output.tar.gz]"); return; }
    if (args.length > 1 || args.some((argument) => argument.startsWith("-"))) { console.error("Usage: wibufy pack [output.tar.gz]"); process.exitCode = 1; return; }
    try {
      const packed = await packProject(process.cwd(), args[0]);
      console.log(`Packed ${packed.manifest.name}@${packed.manifest.version} -> ${packed.archivePath}`);
      console.log(`  integrity ${packed.integrity}`);
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
    return;
  }

  if (mode === "publish") {
    if (args.includes("--help") || args.includes("-h")) { console.log("Usage: wibufy publish [project-directory]"); return; }
    if (args.length > 1 || args.some((argument) => argument.startsWith("-"))) { console.error("Usage: wibufy publish [project-directory]"); process.exitCode = 1; return; }
    try {
      const release = await publishProject(args[0] ?? process.cwd());
      console.log(`Published ${release.name}@${release.version} to the local registry.`);
      console.log(`  integrity ${release.integrity}`);
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
    return;
  }

  if (mode === "search") {
    if (args.includes("--help") || args.includes("-h")) { console.log("Usage: wibufy search [query]"); return; }
    if (args.length > 1 || args.some((argument) => argument.startsWith("-"))) { console.error("Usage: wibufy search [query]"); process.exitCode = 1; return; }
    try {
      const releases = await searchLocalRegistry(args[0] ?? "");
      if (!releases.length) console.log("No packages found in the local registry.");
      else {
        console.log("Local registry packages:");
        for (const release of releases) {
          console.log(`  ${release.name}@${release.version}${release.description ? ` — ${release.description}` : ""}`);
        }
      }
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
    return;
  }

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
