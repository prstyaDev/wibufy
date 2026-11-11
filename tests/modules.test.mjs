import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ModuleLoader } from "../dist/module-loader.js";
import { TypeChecker } from "../dist/typechecker.js";
import { Interpreter } from "../dist/interpreter.js";

async function fixture(files, callback) {
  const directory = await mkdtemp(join(tmpdir(), "wibufy-modules-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      const path = join(directory, name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, source);
    }
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runFile(entry) {
  const loaded = await new ModuleLoader().load(entry);
  new TypeChecker(loaded.sourceName, loaded.source).check(loaded.program);
  const output = [];
  new Interpreter(value => output.push(value), loaded.sourceName, loaded.source).interpret(loaded.program);
  return output;
}

test("named and namespace imports resolve exported declarations", async () => {
  await fixture({
    "math.wbf": `export const PI: number = 3.14\nexport fn add(a: number, b: number) -> number { return a + b }`,
    "text.wbf": `export fn greet(name: string) -> string { return "Hi, " + name }`,
    "main.wbf": `import { add, PI as pi } from "./math.wbf"\nimport * as text from "./text.wbf"\nprint(add(20, 22))\nprint(pi)\nprint(text.greet("Wibufy"))`,
  }, async directory => {
    assert.deepEqual(await runFile(join(directory, "main.wbf")), ["42", "3.14", "Hi, Wibufy"]);
  });
});

test("imported modules initialize once and share live exported bindings", async () => {
  await fixture({
    "counter.wbf": `export let count = 0\nexport fn increment() -> number { count = count + 1; return count }`,
    "main.wbf": `import { increment as inc } from "./counter.wbf"\nimport { increment as again } from "./counter.wbf"\nprint(inc())\nprint(again())`,
  }, async directory => {
    assert.deepEqual(await runFile(join(directory, "main.wbf")), ["1", "2"]);
  });
});

test("private declarations cannot be imported", async () => {
  await fixture({
    "lib.wbf": `fn hidden() -> number { return 7 }\nexport fn visible() -> number { return hidden() }`,
    "main.wbf": `import { hidden } from "./lib.wbf"\nprint(hidden())`,
  }, async directory => {
    await assert.rejects(() => runFile(join(directory, "main.wbf")), /does not export 'hidden'/);
  });
});

test("circular module dependencies are rejected", async () => {
  await fixture({
    "a.wbf": `import { valueB } from "./b.wbf"\nexport const valueA = 1`,
    "b.wbf": `import { valueA } from "./a.wbf"\nexport const valueB = 2`,
    "main.wbf": `import { valueA } from "./a.wbf"\nprint(valueA)`,
  }, async directory => {
    await assert.rejects(() => runFile(join(directory, "main.wbf")), /Circular dependency detected/);
  });
});

test("imported bindings are read-only", async () => {
  await fixture({
    "lib.wbf": `export let count = 1`,
    "main.wbf": `import { count } from "./lib.wbf"\ncount = 2`,
  }, async directory => {
    await assert.rejects(() => runFile(join(directory, "main.wbf")), /Imported binding 'count' is read-only/);
  });
});

test("imports and exports are restricted to module top level", async () => {
  await fixture({
    "main.wbf": `if true { export const value = 1 }`,
  }, async directory => {
    await assert.rejects(() => runFile(join(directory, "main.wbf")), /must be at module top level/);
  });
});

test("standard library math, string, JSON, and datetime modules work", async () => {
  await fixture({
    "main.wbf": `import * as math from "wibufy/math"\nimport { trim, split, join } from "wibufy/string"\nimport * as json from "wibufy/json"\nimport * as datetime from "wibufy/datetime"\nprint(math.sqrt(81))\nprint(join(split(trim("  a,b  "), ","), "-"))\nlet parsed = json.parse("{\\"name\\":\\"Wibufy\\"}")\nprint(json.stringify(parsed))\nprint(datetime.toISOString(datetime.parse("2026-01-02T03:04:05.000Z")))`,
  }, async directory => {
    assert.deepEqual(await runFile(join(directory, "main.wbf")), ["9", "a-b", '{"name":"Wibufy"}', "2026-01-02T03:04:05.000Z"]);
  });
});


test("file-system standard-library functions read, write, list, and check paths", async () => {
  await fixture({
    "main.wbf": `import * as fs from "wibufy/fs"\nprint(fs.exists("__EXISTS__"))\nprint(fs.readText("__READ__"))\nfs.writeText("__WRITE__", "updated")\nprint(fs.exists("__WRITE__"))\nprint(fs.listDir("__DIR__"))`,
  }, async directory => {
    const existsPath = join(directory, "alpha.txt");
    const writePath = join(directory, "created.txt");
    await writeFile(existsPath, "file contents");
    const main = join(directory, "main.wbf");
    let source = await (await import("node:fs/promises")).readFile(main, "utf8");
    source = source.replaceAll("__EXISTS__", existsPath).replaceAll("__READ__", existsPath).replaceAll("__WRITE__", writePath).replaceAll("__DIR__", directory);
    await writeFile(main, source);
    const output = await runFile(main);
    assert.equal(output[0], "true");
    assert.equal(output[1], "file contents");
    assert.equal(output[2], "true");
    assert.match(output[3], /alpha\.txt/);
    assert.match(output[3], /created\.txt/);
    assert.equal(await (await import("node:fs/promises")).readFile(writePath, "utf8"), "updated");
  });
});

test("basic I/O module reads a line and writes output", async () => {
  await fixture({
    "main.wbf": `import { readLine, writeLine } from "wibufy/io"\nlet value = readLine()\nif value != null { writeLine("Echo: " + value) }`,
  }, async directory => {
    const result = spawnSync(process.execPath, [new URL("../dist/cli.js", import.meta.url).pathname, "run", join(directory, "main.wbf")], { input: "hello\n", encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "Echo: hello\n");
  });
});

test("exported type aliases can be imported and used in annotations", async () => {
  await fixture({
    "types.wbf": `export type User = { name: string }`,
    "main.wbf": `import { User } from "./types.wbf"\nlet user: User = { name: "Wibufy" }\nprint(user.name)`,
  }, async directory => {
    assert.deepEqual(await runFile(join(directory, "main.wbf")), ["Wibufy"]);
  });
});


test("namespace-imported bindings are read-only while local shadows remain assignable", async () => {
  await fixture({
    "lib.wbf": `export let value = 1`,
    "main.wbf": `import * as lib from "./lib.wbf"\nfn local(value: number) -> number { value = value + 1; return value }\nprint(local(2))\nlib.value = 4`,
  }, async directory => {
    await assert.rejects(() => runFile(join(directory, "main.wbf")), /Imported binding 'lib.value' is read-only/);
  });
});

test("the JSON module exports its safe JsonValue type", async () => {
  await fixture({
    "main.wbf": `import { JsonValue, stringify } from "wibufy/json"\nlet value: JsonValue = { name: "Wibufy" }\nprint(stringify(value))`,
  }, async directory => {
    assert.deepEqual(await runFile(join(directory, "main.wbf")), ['{"name":"Wibufy"}']);
  });
});

test("installed package named imports work through typechecker and interpreter", async () => {
  await fixture({
    "wibufy.json": JSON.stringify({ name: "demo-app", version: "1.0.0", entry: "src/main.wbf", dependencies: { greeter: "^1.0.0" } }),
    "src/main.wbf": `import { greet } from "greeter"\nprint(greet("Wibufy"))`,
    "packages/greeter/wibufy.json": JSON.stringify({ name: "greeter", version: "1.2.0", entry: "src/index.wbf", dependencies: {} }),
    "packages/greeter/src/index.wbf": `export fn greet(name: string) -> string { return "Hello, " + name }`,
  }, async directory => {
    assert.deepEqual(await runFile(join(directory, "src/main.wbf")), ["Hello, Wibufy"]);
  });
});

test("installed package namespace imports work", async () => {
  await fixture({
    "wibufy.json": JSON.stringify({ name: "demo-app", version: "1.0.0", entry: "src/main.wbf", dependencies: { mathkit: "1.0.0" } }),
    "src/main.wbf": `import * as math from "mathkit"\nprint(math.double(21))`,
    "packages/mathkit/wibufy.json": JSON.stringify({ name: "mathkit", version: "1.0.0", entry: "src/main.wbf", dependencies: {} }),
    "packages/mathkit/src/main.wbf": `export fn double(value: number) -> number { return value * 2 }`,
  }, async directory => {
    assert.deepEqual(await runFile(join(directory, "src/main.wbf")), ["42"]);
  });
});

test("installed package directory symlinks cannot escape the project packages directory", async () => {
  await fixture({
    "wibufy.json": JSON.stringify({ name: "demo-app", version: "1.0.0", entry: "src/main.wbf", dependencies: { greeter: "1.0.0" } }),
    "src/main.wbf": `import { greet } from "greeter"\nprint(greet("Wibufy"))`,
  }, async directory => {
    const outside = join(directory, "outside-package");
    await mkdir(join(outside, "src"), { recursive: true });
    await writeFile(join(outside, "wibufy.json"), JSON.stringify({ name: "greeter", version: "1.0.0", entry: "src/main.wbf", dependencies: {} }));
    await writeFile(join(outside, "src/main.wbf"), `export fn greet(name: string) -> string { return name }`);
    await mkdir(join(directory, "packages"), { recursive: true });
    await symlink(outside, join(directory, "packages/greeter"), "dir");
    await assert.rejects(() => new ModuleLoader().load(join(directory, "src/main.wbf")), /must not be a symbolic link/);
  });
});

test("installed package entry symlinks are rejected", async () => {
  await fixture({
    "wibufy.json": JSON.stringify({ name: "demo-app", version: "1.0.0", entry: "src/main.wbf", dependencies: { greeter: "1.0.0" } }),
    "src/main.wbf": `import { greet } from "greeter"\nprint(greet("Wibufy"))`,
    "packages/greeter/wibufy.json": JSON.stringify({ name: "greeter", version: "1.0.0", entry: "src/main.wbf", dependencies: {} }),
  }, async directory => {
    const outside = join(directory, "outside.wbf");
    await writeFile(outside, `export fn greet(name: string) -> string { return name }`);
    await mkdir(join(directory, "packages/greeter/src"), { recursive: true });
    await symlink(outside, join(directory, "packages/greeter/src/main.wbf"), "file");
    await assert.rejects(() => new ModuleLoader().load(join(directory, "src/main.wbf")), /entry must be a regular file/);
  });
});

test("missing installed packages produce an actionable error", async () => {
  await fixture({
    "wibufy.json": JSON.stringify({ name: "demo-app", version: "1.0.0", entry: "src/main.wbf", dependencies: { absent: "1.0.0" } }),
    "src/main.wbf": `import { value } from "absent"\nprint(value)`,
  }, async directory => {
    await assert.rejects(() => new ModuleLoader().load(join(directory, "src/main.wbf")), /Package 'absent' is not installed/);
  });
});

test("installed package imports are flattened for JavaScript compilation", async () => {
  const { Compiler } = await import("../dist/compiler.js");
  await fixture({
    "wibufy.json": JSON.stringify({ name: "demo-app", version: "1.0.0", entry: "src/main.wbf", dependencies: { greeter: "1.0.0" } }),
    "src/main.wbf": `import { greet } from "greeter"\nprint(greet("compiler"))`,
    "packages/greeter/wibufy.json": JSON.stringify({ name: "greeter", version: "1.0.0", entry: "src/main.wbf", dependencies: {} }),
    "packages/greeter/src/main.wbf": `export fn greet(name: string) -> string { return "Hello, " + name }`,
  }, async directory => {
    const loaded = await new ModuleLoader().load(join(directory, "src/main.wbf"));
    new TypeChecker(loaded.sourceName, loaded.source).check(loaded.program);
    const compiled = new Compiler().compile(loaded.program);
    assert.match(compiled.code, /Hello, /);
    assert.match(compiled.code, /wibufyUser_5f_5f_6d_31_5f_67_72_65_65_74/);
  });
});
