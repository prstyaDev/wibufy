import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { PackageManagerError } from "./errors.js";
import { isValidSemVer, isValidVersionRange, satisfiesVersionRange } from "./semver.js";
import { resolveProjectName, type ProjectManifest } from "./project.js";

export interface LockfilePackage {
  name: string;
  version: string;
  integrity: string;
  dependencies: Record<string, string>;
}

export interface WibufyLockfile {
  lockfileVersion: 1;
  project: { name: string; version: string };
  dependencies: Record<string, string>;
  packages: LockfilePackage[];
}

export class LockfileError extends PackageManagerError {
  constructor(message: string) { super(message); this.name = "LockfileError"; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateDependencyMap(value: unknown, label: string): Record<string, string> {
  if (!isRecord(value)) throw new LockfileError(`${label} must be an object.`);
  const entries: Array<[string, string]> = [];
  for (const [name, range] of Object.entries(value)) {
    try { if (resolveProjectName(name) !== name) throw new Error(); }
    catch { throw new LockfileError(`${label} contains invalid package name '${name}'.`); }
    if (typeof range !== "string" || !isValidVersionRange(range)) {
      throw new LockfileError(`${label} has invalid version range for '${name}'.`);
    }
    entries.push([name, range]);
  }
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

export function validateLockfile(value: unknown, manifest?: ProjectManifest): WibufyLockfile {
  if (!isRecord(value)) throw new LockfileError("wibufy-lock.json must contain a JSON object.");
  const allowed = new Set(["lockfileVersion", "project", "dependencies", "packages"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new LockfileError(`Unknown lockfile field '${key}'.`);
  if (value.lockfileVersion !== 1) throw new LockfileError("Unsupported lockfileVersion; expected 1.");
  if (!isRecord(value.project) || typeof value.project.name !== "string" || typeof value.project.version !== "string") {
    throw new LockfileError("Lockfile project metadata is invalid.");
  }
  for (const key of Object.keys(value.project)) if (key !== "name" && key !== "version") throw new LockfileError(`Unknown lockfile project field '${key}'.`);
  try { if (resolveProjectName(value.project.name) !== value.project.name || value.project.name.length > 214) throw new Error(); }
  catch { throw new LockfileError("Lockfile project name is invalid."); }
  if (!isValidSemVer(value.project.version)) throw new LockfileError("Lockfile project version is invalid.");
  const dependencies = validateDependencyMap(value.dependencies, "Lockfile dependencies");
  if (!Array.isArray(value.packages)) throw new LockfileError("Lockfile packages must be an array.");
  const seen = new Set<string>();
  const packages: LockfilePackage[] = value.packages.map((item, index) => {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.version !== "string" || typeof item.integrity !== "string") {
      throw new LockfileError(`Lockfile package at index ${index} is invalid.`);
    }
    for (const key of Object.keys(item)) if (!["name", "version", "integrity", "dependencies"].includes(key)) throw new LockfileError(`Unknown field '${key}' in lockfile package at index ${index}.`);
    try { if (resolveProjectName(item.name) !== item.name || item.name.length > 214) throw new Error(); }
    catch { throw new LockfileError(`Lockfile package at index ${index} has an invalid name.`); }
    if (!isValidSemVer(item.version)) throw new LockfileError(`Lockfile package '${item.name}' has an invalid version.`);
    if (!/^sha256:[a-f0-9]{64}$/.test(item.integrity)) throw new LockfileError(`Lockfile package '${item.name}' has invalid SHA-256 integrity.`);
    const key = `${item.name}@${item.version}`;
    if (seen.has(item.name)) throw new LockfileError(`Lockfile contains more than one version of '${item.name}'.`);
    seen.add(item.name);
    return { name: item.name, version: item.version, integrity: item.integrity, dependencies: validateDependencyMap(item.dependencies, `Dependencies of '${key}'`) };
  });
  const selected = new Map(packages.map((item) => [item.name, item.version]));
  for (const [name, range] of Object.entries(dependencies)) {
    const version = selected.get(name);
    if (!version || !satisfiesVersionRange(version, range)) throw new LockfileError(`Locked package '${name}' does not satisfy project range '${range}'.`);
  }
  const reachable = new Set<string>();
  const visit = (name: string): void => {
    if (reachable.has(name)) return;
    reachable.add(name);
    const item = packages.find((candidate) => candidate.name === name);
    if (item) for (const dependency of Object.keys(item.dependencies)) visit(dependency);
  };
  for (const name of Object.keys(dependencies)) visit(name);
  if (reachable.size !== packages.length) {
    const unused = packages.filter((item) => !reachable.has(item.name)).map((item) => item.name);
    throw new LockfileError(`Lockfile contains packages not reachable from project dependencies: ${unused.join(", ")}.`);
  }
  for (const item of packages) {
    for (const [name, range] of Object.entries(item.dependencies)) {
      const version = selected.get(name);
      if (!version || !satisfiesVersionRange(version, range)) {
        throw new LockfileError(`Locked dependency '${name}' required by ${item.name}@${item.version} is missing or incompatible with '${range}'.`);
      }
    }
  }
  if (manifest) {
    if (value.project.name !== manifest.name || value.project.version !== manifest.version) {
      throw new LockfileError("Lockfile project identity does not match wibufy.json.");
    }
    if (JSON.stringify(sortObject(dependencies)) !== JSON.stringify(sortObject(manifest.dependencies ?? {}))) {
      throw new LockfileError("Lockfile dependencies do not match wibufy.json. Run 'wibufy install' to resolve them.");
    }
  }
  packages.sort((a, b) => a.name.localeCompare(b.name));
  return { lockfileVersion: 1, project: { name: value.project.name, version: value.project.version }, dependencies, packages };
}

function sortObject(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

export async function readLockfile(projectDirectory: string, manifest?: ProjectManifest): Promise<WibufyLockfile | null> {
  const path = resolve(projectDirectory, "wibufy-lock.json");
  let source: string;
  try { source = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new LockfileError(`Unable to read wibufy-lock.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(source) as unknown; }
  catch (error) { throw new LockfileError(`Invalid wibufy-lock.json: ${error instanceof Error ? error.message : String(error)}`); }
  return validateLockfile(parsed, manifest);
}

export async function writeLockfile(projectDirectory: string, lockfile: WibufyLockfile): Promise<void> {
  const path = resolve(projectDirectory, "wibufy-lock.json");
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(validateLockfile(lockfile), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new LockfileError(`Unable to write wibufy-lock.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}
