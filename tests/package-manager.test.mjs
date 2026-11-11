import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureWibufyDirectories,
  getWibufyPaths,
  initProject,
  readWibufyConfig,
  resolveProjectName,
  writeWibufyConfig,
} from "../dist/package-manager/index.js";

async function temporaryDirectory(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

test("project initialization creates a manifest, source entry, and gitignore", async () => {
  const root = await temporaryDirectory("wibufy-init-");
  try {
    const project = join(root, "hello-world");
    const result = await initProject({ directory: project });
    assert.equal(result, project);
    const manifest = JSON.parse(await readFile(join(project, "wibufy.json"), "utf8"));
    assert.deepEqual(manifest, {
      name: "hello-world",
      version: "0.1.0",
      description: "",
      entry: "src/main.wbf",
      dependencies: {},
    });
    assert.equal(await readFile(join(project, "src", "main.wbf"), "utf8"), 'print("Hello from Wibufy!")\n');
    assert.match(await readFile(join(project, ".gitignore"), "utf8"), /node_modules\//);
    assert.match(await readFile(join(project, ".gitignore"), "utf8"), /packages\//);
    assert.equal(await (async () => { try { await readFile(join(project, "wibufy-lock.json")); return true; } catch { return false; } })(), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project initialization accepts an explicit name and directory", async () => {
  const root = await temporaryDirectory("wibufy-init-name-");
  try {
    const project = join(root, "folder");
    await initProject({ name: "custom-name", directory: project });
    const manifest = JSON.parse(await readFile(join(project, "wibufy.json"), "utf8"));
    assert.equal(manifest.name, "custom-name");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project initialization refuses to overwrite generated files by default", async () => {
  const root = await temporaryDirectory("wibufy-init-conflict-");
  try {
    const project = join(root, "existing");
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "src", "main.wbf"), "print(1)\n");
    await assert.rejects(initProject({ directory: project }), /already exist.*--force/);
    assert.equal(await readFile(join(project, "src", "main.wbf"), "utf8"), "print(1)\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--force overwrites generated files but preserves an existing gitignore", async () => {
  const root = await temporaryDirectory("wibufy-init-force-");
  try {
    const project = join(root, "existing");
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "src", "main.wbf"), "old source\n");
    await writeFile(join(project, ".gitignore"), "custom-ignore\n");
    await initProject({ directory: project, force: true });
    assert.equal(await readFile(join(project, "src", "main.wbf"), "utf8"), 'print("Hello from Wibufy!")\n');
    assert.equal(await readFile(join(project, ".gitignore"), "utf8"), "custom-ignore\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project names are restricted to safe lowercase package identifiers", () => {
  assert.equal(resolveProjectName("hello-world_2.0"), "hello-world_2.0");
  for (const name of ["", "Hello", "../escape", "a..b", "-bad", "bad-"]) {
    assert.throws(() => resolveProjectName(name), /Invalid project name/);
  }
});

test("global Wibufy paths are portable and directories are created only on request", async () => {
  const home = await temporaryDirectory("wibufy-home-");
  try {
    const paths = getWibufyPaths(home);
    assert.equal(paths.root, join(home, ".wibufy"));
    await ensureWibufyDirectories(home);
    assert.equal((await stat(paths.cache)).isDirectory(), true);
    assert.equal((await stat(paths.registry)).isDirectory(), true);
    await writeWibufyConfig({ registry: "local" }, home);
    assert.deepEqual(await readWibufyConfig(home), { registry: "local" });
    assert.equal(await readWibufyConfig(join(home, "missing-home")), null);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
