import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PackageManagerError } from "../errors.js";
import {
  createDefaultManifest,
  inferProjectName,
  resolveProjectDirectory,
  resolveProjectName,
  type ProjectInitOptions,
} from "../project.js";

const DEFAULT_SOURCE = 'print("Hello from Wibufy!")\n';
const DEFAULT_GITIGNORE = "node_modules/\ndist/\npackages/\n.wibufy-install-*/\n*.log\n.env\n";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function initProject(options: ProjectInitOptions = {}): Promise<string> {
  const directory = resolveProjectDirectory(options);
  const name = options.name ? resolveProjectName(options.name) : inferProjectName(directory);
  const manifestPath = join(directory, "wibufy.json");
  const sourcePath = join(directory, "src", "main.wbf");
  const gitignorePath = join(directory, ".gitignore");

  if (!options.force) {
    const conflicts: string[] = [];
    for (const path of [manifestPath, sourcePath]) {
      if (await exists(path)) conflicts.push(path);
    }
    if (conflicts.length) {
      throw new PackageManagerError(
        `Project files already exist (${conflicts.join(", ")}). Use --force to overwrite them.`,
      );
    }
  }

  try {
    await mkdir(join(directory, "src"), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(createDefaultManifest(name), null, 2)}\n`, "utf8");
    await writeFile(sourcePath, DEFAULT_SOURCE, "utf8");
    if (!(await exists(gitignorePath))) {
      await writeFile(gitignorePath, DEFAULT_GITIGNORE, "utf8");
    }
  } catch (error) {
    throw new PackageManagerError(
      `Unable to initialize project: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return directory;
}
