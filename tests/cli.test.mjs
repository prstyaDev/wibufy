import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const example = fileURLToPath(new URL("../examples/developer_tools.wbf", import.meta.url));

test("CLI reports its version with --version and -v", () => {
  for (const option of ["--version", "-v"]) {
    const result = spawnSync(process.execPath, [cli, option], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "Wibufy v0.8.0-dev.8.1\n");
    assert.equal(result.stderr, "");
  }
});

test("CLI rejects unknown commands instead of treating them as source paths", () => {
  const result = spawnSync(process.execPath, [cli, "unknown-command"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command 'unknown-command'/);
  assert.match(result.stderr, /Usage:/);
});

test("CLI run executes the integrated developer-tools example", () => {
  const output = execFileSync(process.execPath, [cli, "run", example], { encoding: "utf8" });
  assert.equal(output, "3\n3\nWIBUFY TOOLS\nWibufy Tools\nLanguage Server\nArray Append\n");
});

test("CLI build writes executable JavaScript to the requested output path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wibufy-cli-build-"));
  try {
    const output = join(directory, "program.mjs");
    execFileSync(process.execPath, [cli, "build", example, "--out", output], { encoding: "utf8" });
    const result = execFileSync(process.execPath, [output], { encoding: "utf8" });
    assert.equal(result, "3\n3\nWIBUFY TOOLS\nWibufy Tools\nLanguage Server\nArray Append\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI init creates a new Wibufy project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wibufy-cli-init-"));
  try {
    const result = spawnSync(process.execPath, [cli, "init", "sample-app"], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const project = join(directory, "sample-app");
    const manifest = JSON.parse(await readFile(join(project, "wibufy.json"), "utf8"));
    assert.equal(manifest.name, "sample-app");
    assert.match(await readFile(join(project, "src", "main.wbf"), "utf8"), /Hello from Wibufy/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI init refuses to overwrite an existing project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wibufy-cli-init-conflict-"));
  try {
    const project = join(directory, "sample-app");
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "wibufy.json"), "{}\n");
    const result = spawnSync(process.execPath, [cli, "init", "sample-app"], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already exist.*--force/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("CLI validate accepts a valid project manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wibufy-cli-validate-"));
  try {
    await mkdir(join(directory, "src"), { recursive: true });
    await writeFile(join(directory, "src", "main.wbf"), 'print("valid")\n');
    await writeFile(join(directory, "wibufy.json"), JSON.stringify({
      name: "valid-project", version: "1.2.3", entry: "src/main.wbf", dependencies: { helper: "^2.0.0" },
    }, null, 2));
    const result = spawnSync(process.execPath, [cli, "validate", directory], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Valid Wibufy project: valid-project@1\.2\.3/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI validate reports an invalid project manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wibufy-cli-validate-invalid-"));
  try {
    await writeFile(join(directory, "wibufy.json"), JSON.stringify({ name: "bad name", version: "1.2" }));
    const result = spawnSync(process.execPath, [cli, "validate", directory], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid wibufy.json/);
    assert.match(result.stderr, /'version'/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
