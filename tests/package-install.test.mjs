import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, access, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  inspectPackageArchive,
  installProjectDependencies,
  readLockfile,
  validateLockfile,
  LockfileError,
} from "../dist/package-manager/index.js";

function tarEntry(name, content = Buffer.alloc(0), type = "0") {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(32, 148, 156);
  header.write(type, 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512, 0);
  return Buffer.concat([header, content, padding]);
}

async function createArchive(root, name, version, dependencies = {}, source = `export const value: string = "${name}"\n`) {
  const directory = join(root, "archives");
  await mkdir(directory, { recursive: true });
  const manifest = Buffer.from(`${JSON.stringify({ name, version, entry: "src/main.wbf", dependencies }, null, 2)}\n`);
  const entries = [
    tarEntry(`${name}/`, Buffer.alloc(0), "5"),
    tarEntry(`${name}/wibufy.json`, manifest),
    tarEntry(`${name}/src/`, Buffer.alloc(0), "5"),
    tarEntry(`${name}/src/main.wbf`, Buffer.from(source)),
  ];
  const archive = join(directory, `${name}-${version}.tar.gz`);
  await writeFile(archive, gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])));
  return archive;
}

async function createProject(root, dependencies) {
  const project = join(root, "project");
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "src", "main.wbf"), 'print("app")\n');
  await writeFile(join(project, "wibufy.json"), `${JSON.stringify({ name: "demo-app", version: "1.0.0", entry: "src/main.wbf", dependencies }, null, 2)}\n`);
  return project;
}

async function temp() { return mkdtemp(join(tmpdir(), "wibufy-package-install-")); }

test("archive inspection reads package identity, dependencies, and SHA-256 integrity", async () => {
  const root = await temp();
  try {
    const archive = await createArchive(root, "alpha", "1.2.0", { shared: "^2.0.0" });
    const info = await inspectPackageArchive(archive);
    assert.equal(info.manifest.name, "alpha");
    assert.equal(info.manifest.version, "1.2.0");
    assert.deepEqual(info.manifest.dependencies, { shared: "^2.0.0" });
    assert.match(info.integrity, /^sha256:[a-f0-9]{64}$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("first install resolves archives, extracts packages, and writes a deterministic strict lockfile", async () => {
  const root = await temp();
  try {
    const project = await createProject(root, { alpha: "^1.0.0" });
    const alpha = await createArchive(root, "alpha", "1.2.0", { shared: "~2.1.0" });
    const shared = await createArchive(root, "shared", "2.1.4");
    const result = await installProjectDependencies(project, { archives: [shared, alpha] });
    assert.equal(result.reusedLockfile, false);
    assert.deepEqual(result.installed, ["alpha@1.2.0", "shared@2.1.4"]);
    assert.equal(await readFile(join(project, "packages", "alpha", "src", "main.wbf"), "utf8"), 'export const value: string = "alpha"\n');
    const lock = JSON.parse(await readFile(join(project, "wibufy-lock.json"), "utf8"));
    assert.equal(lock.lockfileVersion, 1);
    assert.deepEqual(lock.packages.map((item) => item.name), ["alpha", "shared"]);
    assert.equal((await readLockfile(project)).packages.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("strict reinstall uses the locked version and rejects a different archive integrity", async () => {
  const root = await temp();
  try {
    const project = await createProject(root, { alpha: "^1.0.0" });
    const first = await createArchive(root, "alpha", "1.2.0", {}, 'print("first")\n');
    const firstStable = join(root, "archives", "alpha-1.2.0-original.tar.gz");
    await (await import("node:fs/promises")).copyFile(first, firstStable);
    await installProjectDependencies(project, { archives: [firstStable] });
    const changed = await createArchive(root, "alpha", "1.2.0", {}, 'print("tampered")\n');
    await assert.rejects(installProjectDependencies(project, { archives: [changed] }), /Integrity mismatch/);
    const result = await installProjectDependencies(project, { archives: [firstStable] });
    assert.equal(result.reusedLockfile, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("strict lockfile refuses a changed manifest dependency map", async () => {
  const root = await temp();
  try {
    const project = await createProject(root, { alpha: "1.0.0" });
    const archive = await createArchive(root, "alpha", "1.0.0");
    await installProjectDependencies(project, { archives: [archive] });
    await writeFile(join(project, "wibufy.json"), `${JSON.stringify({ name: "demo-app", version: "1.0.0", entry: "src/main.wbf", dependencies: { alpha: "^1.0.0" } }, null, 2)}\n`);
    await assert.rejects(readLockfile(project, JSON.parse(await readFile(join(project, "wibufy.json"), "utf8"))), /do not match/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("missing direct or transitive archives are reported without modifying the project", async () => {
  const root = await temp();
  try {
    const project = await createProject(root, { alpha: "1.0.0" });
    const alpha = await createArchive(root, "alpha", "1.0.0", { missing: "^1.0.0" });
    await assert.rejects(installProjectDependencies(project, { archives: [alpha] }), /not available/);
    await assert.rejects(access(join(project, "packages")));
    await assert.rejects(access(join(project, "wibufy-lock.json")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("archive input symbolic links are rejected", async () => {
  const root = await temp();
  try {
    const directory = join(root, "archives");
    await mkdir(directory, { recursive: true });
    const archive = await createArchive(root, "alpha", "1.0.0");
    const linked = join(directory, "linked.tar.gz");
    await symlink(archive, linked, "file");
    await assert.rejects(inspectPackageArchive(linked), /must be a regular file, not a link/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("archive parser requires a complete tar end marker", async () => {
  const root = await temp();
  try {
    const directory = join(root, "archives");
    await mkdir(directory, { recursive: true });
    const truncated = join(directory, "truncated.tar.gz");
    await writeFile(truncated, gzipSync(tarEntry("alpha/wibufy.json", Buffer.from('{"name":"alpha","version":"1.0.0","entry":"src/main.wbf"}\n'))));
    await assert.rejects(inspectPackageArchive(truncated), /missing the tar end marker|complete tar end marker/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("archive parser rejects duplicate paths and file-directory collisions", async () => {
  const root = await temp();
  try {
    const directory = join(root, "archives");
    await mkdir(directory, { recursive: true });
    const duplicate = join(directory, "duplicate.tar.gz");
    await writeFile(duplicate, gzipSync(Buffer.concat([
      tarEntry("alpha/wibufy.json", Buffer.from("{}")),
      tarEntry("alpha/wibufy.json", Buffer.from("{}")),
      Buffer.alloc(1024),
    ])));
    await assert.rejects(inspectPackageArchive(duplicate), /duplicate path/);

    const collision = join(directory, "collision.tar.gz");
    await writeFile(collision, gzipSync(Buffer.concat([
      tarEntry("alpha/node", Buffer.from("file")),
      tarEntry("alpha/node/child", Buffer.from("nested")),
      Buffer.alloc(1024),
    ])));
    await assert.rejects(inspectPackageArchive(collision), /conflicts with nested path/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("archive extraction rejects path traversal and symbolic links", async () => {
  const root = await temp();
  try {
    const directory = join(root, "archives");
    await mkdir(directory, { recursive: true });
    const traversal = join(directory, "traversal.tar.gz");
    await writeFile(traversal, gzipSync(Buffer.concat([tarEntry("../escape", Buffer.from("bad")), Buffer.alloc(1024)])));
    await assert.rejects(inspectPackageArchive(traversal), /Unsafe archive path/);
    const symlink = join(directory, "symlink.tar.gz");
    await writeFile(symlink, gzipSync(Buffer.concat([tarEntry("alpha/link", Buffer.alloc(0), "2"), Buffer.alloc(1024)])));
    await assert.rejects(inspectPackageArchive(symlink), /unsupported tar entry type/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("lockfile validator rejects unsupported format versions and duplicate package names", () => {
  const base = { lockfileVersion: 1, project: { name: "demo", version: "1.0.0" }, dependencies: {}, packages: [] };
  assert.throws(() => validateLockfile({ ...base, lockfileVersion: 2 }), LockfileError);
  assert.throws(() => validateLockfile({ ...base, packages: [
    { name: "alpha", version: "1.0.0", integrity: `sha256:${"a".repeat(64)}`, dependencies: {} },
    { name: "alpha", version: "2.0.0", integrity: `sha256:${"b".repeat(64)}`, dependencies: {} },
  ] }), /more than one version/);
});

test("empty projects create an empty strict lockfile without requiring archives", async () => {
  const root = await temp();
  try {
    const project = await createProject(root, {});
    const result = await installProjectDependencies(project, { archives: [] });
    assert.deepEqual(result.installed, []);
    assert.deepEqual(JSON.parse(await readFile(join(project, "wibufy-lock.json"), "utf8")).packages, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI install consumes local archives and reports the strict lockfile", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const root = await temp();
  try {
    const project = await createProject(root, { alpha: "1.0.0" });
    const archive = await createArchive(root, "alpha", "1.0.0");
    const cli = new URL("../dist/cli.js", import.meta.url).pathname;
    const result = await run(process.execPath, [cli, "install", "--archive", archive], { cwd: project });
    assert.match(result.stdout, /created wibufy-lock\.json/);
    assert.match(result.stdout, /alpha@1\.0\.0/);
    assert.equal((await readLockfile(project)).packages.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("strict lockfile rejects unreferenced package entries", () => {
  const integrity = `sha256:${"a".repeat(64)}`;
  assert.throws(() => validateLockfile({
    lockfileVersion: 1,
    project: { name: "demo", version: "1.0.0" },
    dependencies: {},
    packages: [{ name: "orphan", version: "1.0.0", integrity, dependencies: {} }],
  }), /not reachable/);
});
