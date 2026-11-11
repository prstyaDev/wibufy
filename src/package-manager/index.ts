export { initProject } from "./commands/init.js";
export type { ProjectInitOptions, ProjectManifest } from "./project.js";
export { createDefaultManifest, inferProjectName, resolveProjectDirectory, resolveProjectName } from "./project.js";
export { getWibufyPaths, type WibufyPaths } from "./paths.js";
export {
  ensureWibufyDirectories,
  readWibufyConfig,
  writeWibufyConfig,
  type WibufyConfig,
} from "./config.js";
export { PackageManagerError } from "./errors.js";

export {
  loadProjectManifest,
  ManifestValidationError,
  validateProjectManifest,
  type ManifestValidationOptions,
} from "./manifest.js";

export { isValidSemVer, isValidVersionRange, parseSemVer, compareSemVer, satisfiesVersionRange, type SemVer } from "./semver.js";
export {
  resolveDependencies,
  DependencyResolutionError,
  type PackageRelease,
  type ResolvedPackage,
  type DependencyEdge,
  type DependencyResolution,
} from "./resolver.js";

export { inspectPackageArchive, extractPackageArchive, getArchiveIntegrity, type PackageArchiveInfo } from "./archive.js";
export { installProjectDependencies, type InstallOptions, type InstallResult } from "./installer.js";
export { readLockfile, writeLockfile, validateLockfile, LockfileError, type WibufyLockfile, type LockfilePackage } from "./lockfile.js";

export { addProjectDependency, removeProjectDependency, updateProjectDependencies, listProjectDependencies } from "./management.js";

export { packProject, publishProject, searchLocalRegistry, type PackedPackage, type LocalRegistryRelease } from "./registry.js";
