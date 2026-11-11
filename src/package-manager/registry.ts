import { randomBytes } from "node:crypto";
import { access, lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { basename, dirname, join, resolve } from "node:path";
import { PackageManagerError } from "./errors.js";
import { loadProjectManifest } from "./manifest.js";
import { getWibufyPaths } from "./paths.js";
import { inspectPackageArchive, getArchiveIntegrity } from "./archive.js";
import type { ProjectManifest } from "./project.js";

const BLOCK = 512;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const EXCLUDED = new Set([".git", "node_modules", "packages", "dist", ".wibufy"]);

export interface PackedPackage {
  manifest: ProjectManifest;
  archivePath: string;
  integrity: string;
}

export interface LocalRegistryRelease {
  name: string;
  version: string;
  description: string;
  dependencies: Record<string, string>;
  integrity: string;
  publishedAt: string;
  archivePath: string;
}

function writeOctal(header: Buffer, offset: number, length: number, value: number): void {
  const encoded = value.toString(8).padStart(length - 1, "0") + "\0";
  if (encoded.length > length) throw new PackageManagerError("A package file is too large for the supported tar format.");
  header.write(encoded, offset, length, "ascii");
}

function tarHeader(path: string, size: number, type: "0" | "5"): Buffer {
  const header = Buffer.alloc(BLOCK, 0);
  let name = path;
  let prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf("/");
    if (split < 1 || Buffer.byteLength(name.slice(split + 1)) > 100 || Buffer.byteLength(name.slice(0, split)) > 155) {
      throw new PackageManagerError(`Package path '${path}' is too long for the supported archive format.`);
    }
    prefix = name.slice(0, split);
    name = name.slice(split + 1);
  }
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(32, 148, 156);
  header.write(type, 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  if (prefix) header.write(prefix, 345, 155, "utf8");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return header;
}

function tarEntry(path: string, data: Buffer, directory = false): Buffer {
  const content = directory ? Buffer.alloc(0) : data;
  const header = tarHeader(directory ? `${path.replace(/\/$/, "")}/` : path, content.length, directory ? "5" : "0");
  const padding = Buffer.alloc((BLOCK - content.length % BLOCK) % BLOCK);
  return Buffer.concat([header, content, padding]);
}

async function collectProjectEntries(project: string, manifest: ProjectManifest): Promise<Buffer> {
  const entries: Buffer[] = [];
  let expanded = 0;
  let count = 0;
  const rootName = manifest.name;

  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (!relativeDirectory && EXCLUDED.has(child.name)) continue;
      if (child.name === "wibufy-lock.json" || child.name === ".DS_Store") continue;
      const absolute = join(directory, child.name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) throw new PackageManagerError(`Cannot publish symbolic link '${relativePath}'.`);
      const archivePath = `${rootName}/${relativePath}`;
      if (metadata.isDirectory()) {
        entries.push(tarEntry(archivePath, Buffer.alloc(0), true));
        count += 1;
        await visit(absolute, relativePath);
      } else if (metadata.isFile()) {
        if (metadata.size > MAX_FILE_BYTES) throw new PackageManagerError(`Package file '${relativePath}' exceeds the 10 MiB file size limit.`);
        expanded += metadata.size;
        if (expanded > MAX_EXPANDED_BYTES) throw new PackageManagerError("Package contents exceed the 50 MiB expanded size limit.");
        const data = await readFile(absolute);
        entries.push(tarEntry(archivePath, data));
        count += 1;
      } else {
        throw new PackageManagerError(`Cannot publish special filesystem entry '${relativePath}'.`);
      }
      if (count > 10_000) throw new PackageManagerError("Package contains too many filesystem entries (maximum 10,000).");
    }
  };

  await visit(project, "");
  const tar = Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]);
  if (tar.length > MAX_EXPANDED_BYTES) throw new PackageManagerError("Package archive contents exceed the 50 MiB expanded size limit.");
  const gzip = gzipSync(tar, { level: 9 });
  if (gzip.length > MAX_ARCHIVE_BYTES) throw new PackageManagerError("Package archive exceeds the 20 MiB compressed size limit.");
  return gzip;
}

async function ensureRegistryRoot(homeDirectory?: string): Promise<string> {
  const paths = getWibufyPaths(homeDirectory);
  await mkdir(paths.root, { recursive: true });
  const rootMetadata = await lstat(paths.root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new PackageManagerError(`Wibufy home path '${paths.root}' must be a real directory, not a link or file.`);
  }
  const registry = paths.registry;
  await mkdir(registry, { recursive: true });
  const metadata = await lstat(registry);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new PackageManagerError(`Local registry path '${registry}' must be a real directory, not a link or file.`);
  }
  return registry;
}

function releaseDirectory(registry: string, name: string, version: string): string {
  // Both values are validated by the manifest/strict SemVer parser before this is called.
  return join(registry, name, version);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRelease(directory: string): Promise<LocalRegistryRelease> {
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8")) as unknown; }
  catch (error) { throw new PackageManagerError(`Unable to read local registry metadata in '${directory}': ${error instanceof Error ? error.message : String(error)}`); }
  if (!isRecord(parsed) || typeof parsed.name !== "string" || typeof parsed.version !== "string" ||
      typeof parsed.description !== "string" || !isRecord(parsed.dependencies) || typeof parsed.integrity !== "string" ||
      typeof parsed.publishedAt !== "string") {
    throw new PackageManagerError(`Local registry metadata in '${directory}' is invalid.`);
  }
  const archivePath = join(directory, "package.tar.gz");
  const info = await inspectPackageArchive(archivePath);
  if (basename(dirname(directory)) !== parsed.name || basename(directory) !== parsed.version ||
      info.manifest.name !== parsed.name || info.manifest.version !== parsed.version ||
      (info.manifest.description ?? "") !== parsed.description ||
      JSON.stringify(Object.entries(info.manifest.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))) !==
        JSON.stringify(Object.entries(parsed.dependencies).sort(([a], [b]) => a.localeCompare(b))) ||
      info.integrity !== parsed.integrity || !Number.isFinite(Date.parse(parsed.publishedAt))) {
    throw new PackageManagerError(`Local registry release '${parsed.name}@${parsed.version}' failed metadata or integrity verification.`);
  }
  const dependencies: Record<string, string> = {};
  for (const [name, range] of Object.entries(parsed.dependencies)) {
    if (typeof range !== "string") throw new PackageManagerError(`Local registry dependencies for '${parsed.name}@${parsed.version}' are invalid.`);
    dependencies[name] = range;
  }
  return {
    name: parsed.name,
    version: parsed.version,
    description: parsed.description,
    dependencies,
    integrity: parsed.integrity,
    publishedAt: parsed.publishedAt,
    archivePath,
  };
}

/** Build a validated .tar.gz archive from a Wibufy project. */
export async function packProject(
  projectDirectory = process.cwd(),
  outputPath?: string,
): Promise<PackedPackage> {
  const project = resolve(projectDirectory);
  const manifest = await loadProjectManifest(project);
  const archiveBytes = await collectProjectEntries(project, manifest);
  const destination = resolve(project, outputPath ?? `dist/packages/${manifest.name}-${manifest.version}.tar.gz`);
  await mkdir(dirname(destination), { recursive: true });
  let created = false;
  try {
    await writeFile(destination, archiveBytes, { flag: "wx" });
    created = true;
    const inspected = await inspectPackageArchive(destination);
    if (inspected.manifest.name !== manifest.name || inspected.manifest.version !== manifest.version) {
      throw new PackageManagerError("Generated package archive metadata does not match the project manifest.");
    }
    return { manifest, archivePath: destination, integrity: inspected.integrity };
  } catch (error) {
    if (created) await rm(destination, { force: true });
    throw error;
  }
}

/** Create and atomically publish the current project into the local registry. */
export async function publishProject(
  projectDirectory = process.cwd(),
  homeDirectory?: string,
): Promise<LocalRegistryRelease> {
  const project = resolve(projectDirectory);
  const manifest = await loadProjectManifest(project);
  const archiveBytes = await collectProjectEntries(project, manifest);
  const temporaryArchive = join(project, `.wibufy-publish-${randomBytes(8).toString("hex")}.tar.gz`);
  try {
    await writeFile(temporaryArchive, archiveBytes, { flag: "wx" });
    const inspected = await inspectPackageArchive(temporaryArchive);
    if (inspected.manifest.name !== manifest.name || inspected.manifest.version !== manifest.version) {
      throw new PackageManagerError("Generated package archive metadata does not match the project manifest.");
    }

    const registry = await ensureRegistryRoot(homeDirectory);
    const packageDirectory = join(registry, manifest.name);
    await mkdir(packageDirectory, { recursive: true });
    const packageDirectoryMetadata = await lstat(packageDirectory);
    if (packageDirectoryMetadata.isSymbolicLink() || !packageDirectoryMetadata.isDirectory()) {
      throw new PackageManagerError(`Local registry package path '${packageDirectory}' must be a real directory.`);
    }
    const releaseDirectoryPath = releaseDirectory(registry, manifest.name, manifest.version);
    const lockPath = join(packageDirectory, `.${manifest.version}.publish-lock`);
    let lock;
    try { lock = await open(lockPath, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new PackageManagerError(`Package '${manifest.name}@${manifest.version}' is already being published.`);
      throw error;
    }
    const staging = join(packageDirectory, `.staging-${randomBytes(8).toString("hex")}`);
    try {
      try { await access(releaseDirectoryPath); throw new PackageManagerError(`Package '${manifest.name}@${manifest.version}' is already published in the local registry.`); }
      catch (error) {
        if (error instanceof PackageManagerError) throw error;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await mkdir(staging);
      const archivePath = join(staging, "package.tar.gz");
      await writeFile(archivePath, archiveBytes, { flag: "wx" });
      const metadata = {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? "",
        dependencies: { ...(manifest.dependencies ?? {}) },
        integrity: getArchiveIntegrity(archiveBytes),
        publishedAt: new Date().toISOString(),
      };
      await writeFile(join(staging, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
      await rename(staging, releaseDirectoryPath);
      return { ...metadata, archivePath: join(releaseDirectoryPath, "package.tar.gz") };
    } finally {
      await rm(staging, { recursive: true, force: true });
      await lock.close();
      await rm(lockPath, { force: true });
    }
  } finally {
    await rm(temporaryArchive, { force: true });
  }
}

/** Search and verify releases stored in the local registry. */
export async function searchLocalRegistry(query = "", homeDirectory?: string): Promise<LocalRegistryRelease[]> {
  const registry = await ensureRegistryRoot(homeDirectory);
  const normalizedQuery = query.trim().toLowerCase();
  const results: LocalRegistryRelease[] = [];
  const packages = await readdir(registry, { withFileTypes: true });
  for (const packageEntry of packages.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!packageEntry.isDirectory() || packageEntry.name.startsWith(".")) continue;
    const packagePath = join(registry, packageEntry.name);
    const versions = await readdir(packagePath, { withFileTypes: true });
    for (const versionEntry of versions.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!versionEntry.isDirectory() || versionEntry.name.startsWith(".")) continue;
      const release = await readRelease(join(packagePath, versionEntry.name));
      if (!normalizedQuery || release.name.toLowerCase().includes(normalizedQuery) || release.description.toLowerCase().includes(normalizedQuery)) {
        results.push(release);
      }
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}
