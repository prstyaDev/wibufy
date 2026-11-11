import { access, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PackageManagerError } from "./errors.js";
import { resolveProjectName, type ProjectManifest } from "./project.js";
import { isValidSemVer, isValidVersionRange } from "./semver.js";
const ALLOWED_FIELDS = new Set(["name", "version", "description", "entry", "dependencies"]);

export interface ManifestValidationOptions {
  /** When provided, the entry file must exist inside this project directory. */
  projectDirectory?: string;
  /** Defaults to true when projectDirectory is provided. */
  checkEntry?: boolean;
}

export class ManifestValidationError extends PackageManagerError {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid wibufy.json:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "ManifestValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeEntryPath(entry: string): boolean {
  if (!entry || entry.includes("\\") || entry.includes(":") || isAbsolute(entry)) return false;
  const segments = entry.split("/");
  return entry.endsWith(".wbf") && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function validateProjectManifest(
  value: unknown,
  options: ManifestValidationOptions = {},
): ProjectManifest {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new ManifestValidationError(["the manifest must be a JSON object"]);
  }

  for (const field of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(field)) issues.push(`unknown field '${field}'`);
  }

  if (typeof value.name !== "string") {
    issues.push("'name' is required and must be a string");
  } else {
    try {
      if (resolveProjectName(value.name) !== value.name) throw new Error("name must not contain surrounding whitespace");
      if (value.name.length > 214) issues.push("'name' must be at most 214 characters");
    } catch {
      issues.push("'name' must be a valid lowercase package name (letters, numbers, '.', '_' or '-')");
    }
  }

  if (typeof value.version !== "string") {
    issues.push("'version' is required and must be a string");
  } else if (!isValidSemVer(value.version)) {
    issues.push(`'version' must be a valid SemVer version (received '${value.version}')`);
  }

  if (value.description !== undefined && typeof value.description !== "string") {
    issues.push("'description' must be a string when provided");
  }

  if (value.entry !== undefined) {
    if (typeof value.entry !== "string") {
      issues.push("'entry' must be a string when provided");
    } else if (!isSafeEntryPath(value.entry)) {
      issues.push("'entry' must be a relative .wbf path without '.' or '..' segments");
    }
  }

  if (value.dependencies !== undefined) {
    if (!isRecord(value.dependencies)) {
      issues.push("'dependencies' must be an object mapping package names to version ranges");
    } else {
      for (const [name, range] of Object.entries(value.dependencies)) {
        try {
          if (resolveProjectName(name) !== name) throw new Error("invalid dependency name");
        } catch {
          issues.push(`dependency name '${name}' is invalid`);
        }
        if (typeof range !== "string" || !isValidVersionRange(range)) {
          issues.push(`dependency '${name}' must use a supported version range (exact, ^, ~, comparator, or *)`);
        }
      }
    }
  }

  if (issues.length) throw new ManifestValidationError(issues);

  const manifest: ProjectManifest = {
    name: value.name as string,
    version: value.version as string,
    ...(value.description !== undefined ? { description: value.description as string } : {}),
    ...(value.entry !== undefined ? { entry: value.entry as string } : {}),
    ...(value.dependencies !== undefined ? { dependencies: value.dependencies as Record<string, string> } : {}),
  };

  if (options.projectDirectory && options.checkEntry !== false) {
    const entry = manifest.entry ?? "src/main.wbf";
    const root = resolve(options.projectDirectory);
    const entryPath = resolve(root, entry);
    const relativeEntry = relative(root, entryPath);
    if (relativeEntry === ".." || relativeEntry.startsWith(`..${sep}`) || isAbsolute(relativeEntry)) {
      throw new ManifestValidationError(["'entry' must resolve inside the project directory"]);
    }
    // Entry paths are checked asynchronously by loadProjectManifest; this synchronous
    // validator only validates their shape and containment.
  }

  return manifest;
}

export async function loadProjectManifest(projectDirectory = process.cwd()): Promise<ProjectManifest> {
  const manifestPath = resolve(projectDirectory, "wibufy.json");
  let source: string;
  try {
    source = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PackageManagerError(`No wibufy.json found in '${resolve(projectDirectory)}'. Run 'wibufy init' first.`);
    }
    throw new PackageManagerError(`Unable to read wibufy.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    throw new ManifestValidationError([`invalid JSON: ${error instanceof Error ? error.message : String(error)}`]);
  }

  const manifest = validateProjectManifest(parsed, { projectDirectory });
  const entry = manifest.entry ?? "src/main.wbf";
  const projectPath = resolve(projectDirectory);
  const entryPath = resolve(projectPath, entry);
  try {
    await access(entryPath);
    if (!(await stat(entryPath)).isFile()) {
      throw new ManifestValidationError([`entry '${entry}' is not a file`]);
    }
    const realProjectPath = await realpath(projectPath);
    const realEntryPath = await realpath(entryPath);
    const realRelativeEntry = relative(realProjectPath, realEntryPath);
    if (realRelativeEntry === ".." || realRelativeEntry.startsWith(`..${sep}`) || isAbsolute(realRelativeEntry)) {
      throw new ManifestValidationError([`entry '${entry}' resolves outside the project directory`]);
    }
  } catch (error) {
    if (error instanceof ManifestValidationError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ManifestValidationError([`entry file '${entry}' does not exist`]);
    }
    throw new PackageManagerError(`Unable to validate entry '${entry}': ${error instanceof Error ? error.message : String(error)}`);
  }

  return manifest;
}
