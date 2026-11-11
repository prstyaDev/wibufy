import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { loadProjectManifest, validateProjectManifest } from "./manifest.js";
import { inspectPackageArchive } from "./archive.js";
import { installProjectDependencies, type InstallResult } from "./installer.js";
import { readLockfile, writeLockfile, type WibufyLockfile } from "./lockfile.js";
import { satisfiesVersionRange, isValidVersionRange } from "./semver.js";
import { PackageManagerError } from "./errors.js";

async function saveManifest(project: string, value: unknown): Promise<void> {
  const path = join(project, "wibufy.json");
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, path);
}

export async function addProjectDependency(projectDirectory: string, name: string, range: string, archives: string[]): Promise<InstallResult> {
  const project = resolve(projectDirectory);
  const manifest = await loadProjectManifest(project);
  if (!isValidVersionRange(range)) throw new PackageManagerError(`Invalid version range '${range}'.`);
  const archiveInfos = await Promise.all(archives.map((path) => inspectPackageArchive(path)));
  if (!archiveInfos.some((item) => item.manifest.name === name && satisfiesVersionRange(item.manifest.version, range))) {
    throw new PackageManagerError(`No supplied archive for '${name}' satisfies '${range}'.`);
  }
  const previous = await readFile(join(project, "wibufy.json"), "utf8");
  const next = { ...manifest, dependencies: { ...(manifest.dependencies ?? {}), [name]: range } };
  validateProjectManifest(next, { projectDirectory: project });
  await saveManifest(project, next);
  try { return await installProjectDependencies(project, { archives, refreshLockfile: true }); }
  catch (error) { await writeFile(join(project, "wibufy.json"), previous, "utf8"); throw error; }
}

export async function removeProjectDependency(projectDirectory: string, name: string): Promise<WibufyLockfile> {
  const project = resolve(projectDirectory);
  const manifest = await loadProjectManifest(project);
  const dependencies = { ...(manifest.dependencies ?? {}) };
  if (!(name in dependencies)) throw new PackageManagerError(`Dependency '${name}' is not declared in wibufy.json.`);
  delete dependencies[name];
  const next = { ...manifest, dependencies };
  validateProjectManifest(next, { projectDirectory: project });
  const previousManifest = await readFile(join(project, "wibufy.json"), "utf8");
  const previousLock = await readLockfile(project, manifest);
  const selected = new Map((previousLock?.packages ?? []).map((item) => [item.name, item]));
  const reachable = new Set<string>();
  const visit = (dependency: string): void => {
    if (reachable.has(dependency)) return;
    reachable.add(dependency);
    for (const child of Object.keys(selected.get(dependency)?.dependencies ?? {})) visit(child);
  };
  for (const dependency of Object.keys(dependencies)) visit(dependency);
  const packages = (previousLock?.packages ?? []).filter((item) => reachable.has(item.name));
  const lockfile: WibufyLockfile = { lockfileVersion: 1, project: { name: manifest.name, version: manifest.version }, dependencies, packages };
  await saveManifest(project, next);
  try {
    await writeLockfile(project, lockfile);
  } catch (error) {
    await writeFile(join(project, "wibufy.json"), previousManifest, "utf8");
    throw error;
  }
  // The manifest and lockfile are now consistent. A cleanup failure may leave
  // an unreferenced directory, but must not roll back only one metadata file.
  for (const item of (previousLock?.packages ?? []).filter((entry) => !reachable.has(entry.name))) {
    await rm(join(project, "packages", item.name), { recursive: true, force: true });
  }
  return lockfile;
}

export async function updateProjectDependencies(projectDirectory: string, archives: string[]): Promise<InstallResult> {
  return installProjectDependencies(resolve(projectDirectory), { archives, refreshLockfile: true });
}

export async function listProjectDependencies(projectDirectory: string): Promise<WibufyLockfile> {
  const project = resolve(projectDirectory);
  const manifest = await loadProjectManifest(project);
  const lockfile = await readLockfile(project, manifest);
  if (!lockfile) throw new PackageManagerError("No wibufy-lock.json found. Run 'wibufy install' first.");
  return lockfile;
}
