import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  addProjectDependency, removeProjectDependency, updateProjectDependencies, listProjectDependencies,
} from "../dist/package-manager/index.js";

function entry(name, content = Buffer.alloc(0), type = "0") {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "utf8"); header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii"); header.write("0000000\0", 116, 8, "ascii");
  header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii"); header.fill(32, 148, 156);
  header.write(type, 156, 1, "ascii"); header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii");
  let sum = 0; for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return Buffer.concat([header, content, Buffer.alloc((512 - content.length % 512) % 512)]);
}
async function archive(root, name, version, deps = {}) {
  const dir = join(root, "archives"); await mkdir(dir, { recursive: true });
  const manifest = Buffer.from(JSON.stringify({ name, version, entry: "src/main.wbf", dependencies: deps }));
  const tar = Buffer.concat([
    entry(`${name}/`, Buffer.alloc(0), "5"), entry(`${name}/wibufy.json`, manifest),
    entry(`${name}/src/`, Buffer.alloc(0), "5"), entry(`${name}/src/main.wbf`, Buffer.from('print("ok")\n')),
    Buffer.alloc(1024),
  ]);
  const path = join(dir, `${name}-${version}.tar.gz`); await writeFile(path, gzipSync(tar)); return path;
}
async function project(root, deps = {}) {
  const dir = join(root, "project"); await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/main.wbf"), 'print("app")\n');
  await writeFile(join(dir, "wibufy.json"), JSON.stringify({ name: "demo", version: "1.0.0", entry: "src/main.wbf", dependencies: deps }));
  return dir;
}
async function temp() { return mkdtemp(join(tmpdir(), "wibufy-management-")); }

test("add installs a dependency and updates manifest and strict lockfile", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    const alpha = await archive(root, "alpha", "1.2.0");
    const result = await addProjectDependency(dir, "alpha", "^1.0.0", [alpha]);
    assert.equal(result.lockfile.dependencies.alpha, "^1.0.0");
    const updatedManifest = JSON.parse(await readFile(join(dir, "wibufy.json"), "utf8"));
    assert.equal(updatedManifest.dependencies.alpha, "^1.0.0");
    assert.equal((await listProjectDependencies(dir)).packages[0].version, "1.2.0");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("add rolls back manifest when dependency resolution fails", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    const before = await readFile(join(dir, "wibufy.json"), "utf8");
    await assert.rejects(addProjectDependency(dir, "missing", "^1.0.0", []), /No supplied archive/);
    assert.equal(await readFile(join(dir, "wibufy.json"), "utf8"), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("remove updates manifest, prunes unreachable package and lockfile", async () => {
  const root = await temp();
  try {
    const dir = await project(root, { alpha: "^1.0.0", beta: "^1.0.0" });
    const alpha = await archive(root, "alpha", "1.0.0");
    const beta = await archive(root, "beta", "1.0.0");
    const { installProjectDependencies } = await import("../dist/package-manager/index.js");
    await installProjectDependencies(dir, { archives: [alpha, beta] });
    const lock = await removeProjectDependency(dir, "alpha");
    assert.deepEqual(Object.keys(lock.dependencies), ["beta"]);
    assert.deepEqual(lock.packages.map((item) => item.name), ["beta"]);
    await assert.rejects(readFile(join(dir, "packages/alpha/wibufy.json"), "utf8"));
    assert.equal((await listProjectDependencies(dir)).packages.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("remove rejects undeclared dependencies without changing manifest", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    const before = await readFile(join(dir, "wibufy.json"), "utf8");
    await assert.rejects(removeProjectDependency(dir, "ghost"), /not declared/);
    assert.equal(await readFile(join(dir, "wibufy.json"), "utf8"), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("update re-resolves and installs the highest compatible supplied release", async () => {
  const root = await temp();
  try {
    const dir = await project(root, { alpha: "^1.0.0" });
    const v1 = await archive(root, "alpha", "1.0.0");
    const v2 = await archive(root, "alpha", "1.5.0");
    const { installProjectDependencies } = await import("../dist/package-manager/index.js");
    await installProjectDependencies(dir, { archives: [v1] });
    const result = await updateProjectDependencies(dir, [v1, v2]);
    assert.equal(result.lockfile.packages[0].version, "1.5.0");
    assert.equal((await listProjectDependencies(dir)).packages[0].version, "1.5.0");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("list requires a valid strict lockfile", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    await assert.rejects(listProjectDependencies(dir), /No wibufy-lock.json/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("publish stores a validated package in the local registry and search finds it", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    await writeFile(join(dir, "README.md"), "A reusable Wibufy package.\n");
    const manifestPath = join(dir, "wibufy.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.description = "Reusable utility package";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    const home = join(root, "home");
    const { publishProject, searchLocalRegistry, getWibufyPaths } = await import("../dist/package-manager/index.js");
    const published = await publishProject(dir, home);
    assert.equal(published.name, "demo");
    assert.equal(published.version, "1.0.0");
    assert.match(published.integrity, /^sha256:[a-f0-9]{64}$/);
    assert.equal((await stat(published.archivePath)).isFile(), true);
    const results = await searchLocalRegistry("utility", home);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "demo");
    assert.equal(results[0].integrity, published.integrity);
    const paths = getWibufyPaths(home);
    assert.equal((await stat(join(paths.registry, "demo", "1.0.0", "metadata.json"))).isFile(), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("publish rejects an already published name and version without replacing it", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    const home = join(root, "home");
    const { publishProject, searchLocalRegistry } = await import("../dist/package-manager/index.js");
    const first = await publishProject(dir, home);
    await assert.rejects(publishProject(dir, home), /already published/);
    const results = await searchLocalRegistry("", home);
    assert.equal(results.length, 1);
    assert.equal(results[0].integrity, first.integrity);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("publish rejects symbolic links and leaves no registry release", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    const outside = join(root, "outside.txt");
    await writeFile(outside, "not package content");
    const { symlink } = await import("node:fs/promises");
    await symlink(outside, join(dir, "linked.txt"));
    const home = join(root, "home");
    const { publishProject, searchLocalRegistry } = await import("../dist/package-manager/index.js");
    await assert.rejects(publishProject(dir, home), /symbolic link/);
    assert.deepEqual(await searchLocalRegistry("", home), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("local registry search detects a modified published archive", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    const home = join(root, "home");
    const { publishProject, searchLocalRegistry } = await import("../dist/package-manager/index.js");
    const release = await publishProject(dir, home);
    await writeFile(release.archivePath, "tampered");
    await assert.rejects(searchLocalRegistry("", home), /not a valid|integrity|archive/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("pack creates a validated archive and refuses to overwrite an existing output", async () => {
  const root = await temp();
  try {
    const dir = await project(root);
    const { packProject } = await import("../dist/package-manager/index.js");
    const output = join(root, "archives", "demo-1.0.0.tar.gz");
    const packed = await packProject(dir, output);
    assert.equal(packed.manifest.name, "demo");
    assert.equal(packed.archivePath, output);
    assert.match(packed.integrity, /^sha256:[a-f0-9]{64}$/);
    const before = await readFile(output);
    await assert.rejects(packProject(dir, output), /EEXIST|already exists/i);
    assert.deepEqual(await readFile(output), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI pack, publish, and search expose the local package workflow", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const root = await temp();
  try {
    const dir = await project(root);
    const cli = new URL("../dist/cli.js", import.meta.url).pathname;
    const home = join(root, "home");
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const packed = await run(process.execPath, [cli, "pack", "out/demo.tar.gz"], { cwd: dir, env });
    assert.match(packed.stdout, /Packed demo@1\.0\.0/);
    const published = await run(process.execPath, [cli, "publish"], { cwd: dir, env });
    assert.match(published.stdout, /Published demo@1\.0\.0 to the local registry/);
    const searched = await run(process.execPath, [cli, "search", "demo"], { cwd: dir, env });
    assert.match(searched.stdout, /demo@1\.0\.0/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
