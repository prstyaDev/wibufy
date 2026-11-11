import { basename, resolve } from "node:path";

export interface ProjectManifest {
  name: string;
  version: string;
  description?: string;
  entry?: string;
  dependencies?: Record<string, string>;
}

export interface ProjectInitOptions {
  name?: string;
  directory?: string;
  force?: boolean;
}

const PROJECT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export function resolveProjectName(name: string): string {
  const normalized = name.trim();
  if (!PROJECT_NAME_PATTERN.test(normalized) || normalized.includes("..")) {
    throw new Error(
      `Invalid project name '${name}'. Use lowercase letters, numbers, dots, underscores, or hyphens; start and end with a letter or number.`,
    );
  }
  return normalized;
}

export function createDefaultManifest(name: string): ProjectManifest {
  return {
    name: resolveProjectName(name),
    version: "0.1.0",
    description: "",
    entry: "src/main.wbf",
    dependencies: {},
  };
}

export function resolveProjectDirectory(options: ProjectInitOptions): string {
  return resolve(options.directory ?? options.name ?? ".");
}

export function inferProjectName(directory: string): string {
  return resolveProjectName(basename(resolve(directory)));
}
