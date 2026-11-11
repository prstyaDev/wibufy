import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getWibufyPaths } from "./paths.js";

export interface WibufyConfig {
  registry: "local";
}

export async function ensureWibufyDirectories(homeDirectory?: string): Promise<void> {
  const paths = getWibufyPaths(homeDirectory);
  await mkdir(paths.cache, { recursive: true });
  await mkdir(paths.registry, { recursive: true });
}

export async function readWibufyConfig(homeDirectory?: string): Promise<WibufyConfig | null> {
  const path = getWibufyPaths(homeDirectory).config;
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || (parsed as { registry?: unknown }).registry !== "local") {
      throw new Error(`Invalid Wibufy config at ${path}.`);
    }
    return parsed as WibufyConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeWibufyConfig(config: WibufyConfig, homeDirectory?: string): Promise<void> {
  const path = getWibufyPaths(homeDirectory).config;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
