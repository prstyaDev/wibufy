import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, lstat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { PackageManagerError } from "./errors.js";
import { validateProjectManifest } from "./manifest.js";
import type { ProjectManifest } from "./project.js";

const BLOCK = 512;
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

export interface PackageArchiveInfo {
  manifest: ProjectManifest;
  integrity: string;
  archivePath: string;
}
interface TarEntry { name: string; type: string; data: Buffer; }


async function readArchiveBytes(archivePath: string): Promise<Buffer> {
  const path = resolve(archivePath);
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new PackageManagerError(`Package archive '${path}' must be a regular file, not a link or special filesystem object.`);
  if (metadata.size > MAX_ARCHIVE_BYTES) throw new PackageManagerError("Package archive exceeds the 20 MiB compressed size limit.");
  return readFile(path);
}

async function ensureSafeDirectory(root: string, directory: string): Promise<void> {
  const relativeDirectory = relative(root, directory);
  if (relativeDirectory === ".." || relativeDirectory.startsWith(`..${sep}`) || isAbsolute(relativeDirectory)) {
    throw new PackageManagerError(`Archive directory '${directory}' escapes the package directory.`);
  }
  let current = root;
  for (const segment of relativeDirectory.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new PackageManagerError(`Archive directory '${current}' conflicts with an unsafe filesystem object.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
}

function readString(buffer: Buffer, start: number, length: number): string {
  const value = buffer.subarray(start, start + length);
  const end = value.indexOf(0);
  return value.subarray(0, end < 0 ? value.length : end).toString("utf8");
}
function readOctal(buffer: Buffer, start: number, length: number): number {
  const raw = readString(buffer, start, length).trim();
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) throw new PackageManagerError("Archive contains an invalid tar numeric field.");
  return Number.parseInt(raw, 8);
}
function parseTar(gzip: Buffer): TarEntry[] {
  if (gzip.length > MAX_ARCHIVE_BYTES) throw new PackageManagerError("Package archive exceeds the 20 MiB compressed size limit.");
  let tar: Buffer;
  try { tar = gunzipSync(gzip, { maxOutputLength: MAX_EXPANDED_BYTES }); }
  catch { throw new PackageManagerError("Package archive is not a valid or safely sized gzip stream."); }
  if (tar.length % BLOCK !== 0) throw new PackageManagerError("Package archive has an invalid tar block alignment.");
  const entries: TarEntry[] = [];
  let offset = 0;
  let total = 0;
  let terminated = false;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      if (tar.length - offset < BLOCK * 2) throw new PackageManagerError("Package archive is missing the complete tar end marker.");
      if (!tar.subarray(offset).every((byte) => byte === 0)) throw new PackageManagerError("Package archive contains data after the tar end marker.");
      terminated = true;
      break;
    }
    const expected = readOctal(header, 148, 8);
    let checksum = 0;
    for (let index = 0; index < BLOCK; index += 1) checksum += index >= 148 && index < 156 ? 32 : header[index]!;
    if (checksum !== expected) throw new PackageManagerError("Package archive has an invalid tar header checksum.");
    const prefix = readString(header, 345, 155);
    const name = [prefix, readString(header, 0, 100)].filter(Boolean).join("/");
    const size = readOctal(header, 124, 12);
    const type = readString(header, 156, 1) || "0";
    if (type !== "0" && type !== "\0" && type !== "5") {
      throw new PackageManagerError(`Package archive contains an unsupported tar entry type '${type}'. Links and special files are forbidden.`);
    }
    if (type === "5" && size !== 0) throw new PackageManagerError(`Archive directory '${name}' must not contain file data.`);
    if (size > MAX_FILE_BYTES) throw new PackageManagerError(`Archive entry '${name}' exceeds the 10 MiB file size limit.`);
    total += size;
    if (total > MAX_EXPANDED_BYTES) throw new PackageManagerError("Package archive exceeds the 50 MiB expanded size limit.");
    if (entries.length >= MAX_ENTRIES) throw new PackageManagerError("Package archive contains too many entries.");
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new PackageManagerError("Package archive is truncated.");
    entries.push({ name, type, data: tar.subarray(dataStart, dataEnd) });
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  if (!terminated) throw new PackageManagerError("Package archive is missing the tar end marker.");
  return entries;
}

function safeEntryName(name: string): string {
  if (!name || name.includes("\\") || name.includes(":") || name.startsWith("/") || isAbsolute(name)) {
    throw new PackageManagerError(`Unsafe archive path '${name}'.`);
  }
  const normalized = name.replace(/\/$/, "");
  const segments = normalized.split("/");
  if (!normalized || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new PackageManagerError(`Unsafe archive path '${name}'.`);
  }
  return segments.join("/");
}

function normalizeEntries(entries: TarEntry[]): TarEntry[] {
  let normalized = entries.map((entry) => ({ ...entry, name: safeEntryName(entry.name) }));
  const firstSegments = new Set(normalized.map((entry) => entry.name.split("/")[0]!));
  const hasRootFile = normalized.some((entry) => !entry.name.includes("/") && entry.type !== "5");
  if (firstSegments.size === 1 && !hasRootFile) {
    const prefix = [...firstSegments][0]!;
    normalized = normalized
      .filter((entry) => entry.name !== prefix)
      .map((entry) => ({ ...entry, name: entry.name.slice(prefix.length + 1) }));
  }

  const paths = new Map<string, "file" | "directory">();
  for (const entry of normalized) {
    const kind = entry.type === "5" ? "directory" : "file";
    if (paths.has(entry.name)) throw new PackageManagerError(`Package archive contains duplicate path '${entry.name}'.`);
    const segments = entry.name.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const parent = segments.slice(0, index).join("/");
      if (paths.get(parent) === "file") throw new PackageManagerError(`Archive file '${parent}' conflicts with nested path '${entry.name}'.`);
    }
    if (kind === "file") {
      for (const existing of paths.keys()) {
        if (existing.startsWith(`${entry.name}/`)) throw new PackageManagerError(`Archive file '${entry.name}' conflicts with nested path '${existing}'.`);
      }
    }
    paths.set(entry.name, kind);
  }
  return normalized;
}

export function getArchiveIntegrity(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function inspectPackageArchive(archivePath: string): Promise<PackageArchiveInfo> {
  const path = resolve(archivePath);
  const bytes = await readArchiveBytes(path);
  const entries = normalizeEntries(parseTar(bytes));
  const manifestEntry = entries.find((entry) => entry.name === "wibufy.json" && entry.type !== "5");
  if (!manifestEntry) throw new PackageManagerError(`Archive '${path}' does not contain a root wibufy.json.`);
  let parsed: unknown;
  try { parsed = JSON.parse(manifestEntry.data.toString("utf8")) as unknown; }
  catch { throw new PackageManagerError(`Archive '${path}' contains an invalid wibufy.json.`); }
  const manifest = validateProjectManifest(parsed, { checkEntry: false });
  const entryPath = manifest.entry ?? "src/main.wbf";
  if (!entries.some((entry) => entry.name === entryPath && entry.type !== "5")) {
    throw new PackageManagerError(`Package '${manifest.name}@${manifest.version}' is missing entry '${entryPath}'.`);
  }
  return { manifest, integrity: getArchiveIntegrity(bytes), archivePath: path };
}

export async function extractPackageArchive(
  archivePath: string,
  destination: string,
  expectedIntegrity?: string,
): Promise<void> {
  const bytes = await readArchiveBytes(archivePath);
  if (expectedIntegrity && getArchiveIntegrity(bytes) !== expectedIntegrity) {
    throw new PackageManagerError(`Archive integrity changed before extraction for '${resolve(archivePath)}'.`);
  }
  const entries = normalizeEntries(parseTar(bytes));
  const root = resolve(destination);
  await mkdir(root, { recursive: true });
  const rootMetadata = await lstat(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new PackageManagerError("Package extraction destination must be a real directory, not a link or file.");
  }
  for (const entry of entries) {
    const name = safeEntryName(entry.name);
    const target = resolve(root, ...name.split("/"));
    const relativeTarget = relative(root, target);
    if (relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
      throw new PackageManagerError(`Archive path '${entry.name}' escapes the package directory.`);
    }
    if (entry.type === "5") {
      await ensureSafeDirectory(root, target);
      continue;
    }
    await ensureSafeDirectory(root, dirname(target));
    await writeFile(target, entry.data, { flag: "wx" });
  }
}
