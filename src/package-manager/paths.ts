import { homedir } from "node:os";
import { join } from "node:path";

export interface WibufyPaths {
  root: string;
  cache: string;
  registry: string;
  config: string;
}

export function getWibufyPaths(homeDirectory: string = homedir()): WibufyPaths {
  const root = join(homeDirectory, ".wibufy");
  return {
    root,
    cache: join(root, "cache"),
    registry: join(root, "registry"),
    config: join(root, "config.json"),
  };
}
