import { mkdtemp, mkdir, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadProjectManifest } from "./manifest.js";
import { inspectPackageArchive, extractPackageArchive, type PackageArchiveInfo } from "./archive.js";
import { resolveDependencies, type PackageRelease } from "./resolver.js";
import { readLockfile, writeLockfile, type LockfilePackage, type WibufyLockfile } from "./lockfile.js";
import { PackageManagerError } from "./errors.js";

export interface InstallOptions {
  /** Local .tar.gz archives available for this offline installation. */
  archives: string[];
  /** Re-resolve from supplied archives instead of reusing an existing strict lockfile. */
  refreshLockfile?: boolean;
}
export interface InstallResult {
  lockfile: WibufyLockfile;
  installed: string[];
  reusedLockfile: boolean;
}

function packageKey(name: string, version: string): string { return `${name}@${version}`; }

async function loadArchiveCatalog(paths: readonly string[]): Promise<{ infos: PackageArchiveInfo[]; releases: PackageRelease[] }> {
  const infos: PackageArchiveInfo[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const info = await inspectPackageArchive(path);
    const key = packageKey(info.manifest.name, info.manifest.version);
    if (seen.has(key)) throw new PackageManagerError(`Duplicate archive supplied for '${key}'.`);
    seen.add(key);
    infos.push(info);
  }
  const releases = infos.map((info) => ({
    name: info.manifest.name,
    version: info.manifest.version,
    dependencies: { ...(info.manifest.dependencies ?? {}) },
  }));
  return { infos, releases };
}

function createLockfile(
  manifest: Awaited<ReturnType<typeof loadProjectManifest>>,
  packages: LockfilePackage[],
): WibufyLockfile {
  return {
    lockfileVersion: 1,
    project: { name: manifest.name, version: manifest.version },
    dependencies: { ...(manifest.dependencies ?? {}) },
    packages: [...packages].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Install exact local archives, generating a strict lockfile on first install. */
export async function installProjectDependencies(
  projectDirectory = process.cwd(),
  options: InstallOptions,
): Promise<InstallResult> {
  const project = resolve(projectDirectory);
  const manifest = await loadProjectManifest(project);
  const { infos, releases } = await loadArchiveCatalog(options.archives);
  const byKey = new Map(infos.map((info) => [packageKey(info.manifest.name, info.manifest.version), info]));
  const existingLock = options.refreshLockfile ? null : await readLockfile(project, manifest);
  let lockfile: WibufyLockfile;
  if (existingLock) {
    lockfile = existingLock;
  } else {
    const resolution = resolveDependencies(manifest.dependencies ?? {}, releases);
    const packages: LockfilePackage[] = resolution.packages.map((item) => {
      const info = byKey.get(packageKey(item.name, item.version));
      if (!info) throw new PackageManagerError(`Archive missing for resolved package '${item.name}@${item.version}'.`);
      return { name: item.name, version: item.version, integrity: info.integrity, dependencies: { ...item.dependencies } };
    });
    lockfile = createLockfile(manifest, packages);
  }

  for (const item of lockfile.packages) {
    const info = byKey.get(packageKey(item.name, item.version));
    if (!info) throw new PackageManagerError(`Strict lockfile requires '${item.name}@${item.version}', but its archive was not supplied.`);
    if (info.integrity !== item.integrity) {
      throw new PackageManagerError(`Integrity mismatch for '${item.name}@${item.version}'. Expected ${item.integrity}, received ${info.integrity}.`);
    }
    if (JSON.stringify(Object.fromEntries(Object.entries(info.manifest.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b)))) !==
        JSON.stringify(Object.fromEntries(Object.entries(item.dependencies).sort(([a], [b]) => a.localeCompare(b))))) {
      throw new PackageManagerError(`Dependency metadata mismatch for '${item.name}@${item.version}'.`);
    }
  }

  const work = await mkdtemp(join(project, ".wibufy-install-"));
  const stagedPackages = join(work, "packages");
  const targetPackages = join(project, "packages");
  const backupPackages = join(work, "packages-backup");
  let backedUp = false;
  let installed = false;
  try {
    await mkdir(stagedPackages, { recursive: true });
    for (const item of lockfile.packages) {
      const info = byKey.get(packageKey(item.name, item.version))!;
      const destination = join(stagedPackages, item.name);
      await extractPackageArchive(info.archivePath, destination, item.integrity);
      const extractedManifest = JSON.parse(await readFile(join(destination, "wibufy.json"), "utf8")) as unknown;
      if (typeof extractedManifest !== "object" || extractedManifest === null ||
          (extractedManifest as Record<string, unknown>).name !== item.name ||
          (extractedManifest as Record<string, unknown>).version !== item.version) {
        throw new PackageManagerError(`Extracted archive identity mismatch for '${item.name}@${item.version}'.`);
      }
    }
    try {
      await rename(targetPackages, backupPackages);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(stagedPackages, targetPackages);
    installed = true;
    await writeLockfile(project, lockfile);
    if (backedUp) await rm(backupPackages, { recursive: true, force: true });
  } catch (error) {
    if (installed) await rm(targetPackages, { recursive: true, force: true });
    if (backedUp) await rename(backupPackages, targetPackages).catch(() => undefined);
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return { lockfile, installed: lockfile.packages.map((item) => packageKey(item.name, item.version)), reusedLockfile: existingLock !== null };
}
