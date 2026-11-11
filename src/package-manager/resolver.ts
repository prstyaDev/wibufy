import { compareSemVer, isValidSemVer, isValidVersionRange, satisfiesVersionRange } from "./semver.js";
import { PackageManagerError } from "./errors.js";
import { resolveProjectName } from "./project.js";

export interface PackageRelease {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}

export interface ResolvedPackage {
  name: string;
  version: string;
  dependencies: Record<string, string>;
}

export interface DependencyEdge {
  from: string;
  to: string;
  range: string;
}

export interface DependencyResolution {
  packages: ResolvedPackage[];
  edges: DependencyEdge[];
}

interface Constraint {
  range: string;
  requestedBy: string;
}

interface SearchState {
  constraints: Map<string, Constraint[]>;
  selected: Map<string, PackageRelease>;
  expanded: Set<string>;
}

export class DependencyResolutionError extends PackageManagerError {
  readonly code: "PACKAGE_NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_CATALOG";

  constructor(code: DependencyResolutionError["code"], message: string) {
    super(message);
    this.name = "DependencyResolutionError";
    this.code = code;
  }
}

function cloneState(state: SearchState): SearchState {
  return {
    constraints: new Map([...state.constraints].map(([name, values]) => [name, [...values]])),
    selected: new Map(state.selected),
    expanded: new Set(state.expanded),
  };
}

function validateCatalog(catalog: readonly PackageRelease[]): Map<string, PackageRelease[]> {
  const packages = new Map<string, PackageRelease[]>();
  const seen = new Set<string>();
  for (const release of catalog) {
    if (typeof release !== "object" || release === null || Array.isArray(release)) {
      throw new DependencyResolutionError("INVALID_CATALOG", "Each catalog release must be an object.");
    }
    try {
      if (resolveProjectName(release.name) !== release.name || release.name.length > 214) throw new Error("invalid name");
    } catch {
      throw new DependencyResolutionError("INVALID_CATALOG", `Invalid package name '${release.name}'.`);
    }
    if (!isValidSemVer(release.version)) {
      throw new DependencyResolutionError("INVALID_CATALOG", `Package '${release.name}' has invalid version '${release.version}'.`);
    }
    const key = `${release.name}@${release.version}`;
    if (seen.has(key)) throw new DependencyResolutionError("INVALID_CATALOG", `Duplicate package release '${key}'.`);
    seen.add(key);
    const dependencies = release.dependencies ?? {};
    if (typeof dependencies !== "object" || dependencies === null || Array.isArray(dependencies)) {
      throw new DependencyResolutionError("INVALID_CATALOG", `Dependencies for '${key}' must be an object.`);
    }
    for (const [dependency, range] of Object.entries(dependencies)) {
      try {
        if (resolveProjectName(dependency) !== dependency) throw new Error("invalid name");
      } catch {
        throw new DependencyResolutionError("INVALID_CATALOG", `Package '${key}' has invalid dependency name '${dependency}'.`);
      }
      if (typeof range !== "string" || !isValidVersionRange(range)) {
        throw new DependencyResolutionError("INVALID_CATALOG", `Package '${key}' has invalid range '${String(range)}' for '${dependency}'.`);
      }
    }
    const list = packages.get(release.name) ?? [];
    list.push({ name: release.name, version: release.version, dependencies: { ...dependencies } });
    packages.set(release.name, list);
  }
  for (const releases of packages.values()) {
    releases.sort((a, b) => compareSemVer(b.version, a.version) || b.version.localeCompare(a.version));
  }
  return packages;
}

function addConstraint(state: SearchState, name: string, constraint: Constraint): void {
  const values = state.constraints.get(name) ?? [];
  values.push(constraint);
  state.constraints.set(name, values);
}

function satisfiesAll(version: string, constraints: readonly Constraint[]): boolean {
  return constraints.every((constraint) => satisfiesVersionRange(version, constraint.range));
}

/**
 * Resolve a project's direct dependencies against an available package catalog.
 * Exactly one version per package name is selected for the complete graph.
 * The resolver prefers the highest compatible release and backtracks when
 * transitive constraints make an earlier choice incompatible.
 */
export function resolveDependencies(
  rootDependencies: Record<string, string>,
  catalog: readonly PackageRelease[],
): DependencyResolution {
  if (typeof rootDependencies !== "object" || rootDependencies === null || Array.isArray(rootDependencies)) {
    throw new DependencyResolutionError("INVALID_CATALOG", "Root dependencies must be an object.");
  }
  const available = validateCatalog(catalog);
  const initial: SearchState = { constraints: new Map(), selected: new Map(), expanded: new Set() };
  for (const [name, range] of Object.entries(rootDependencies)) {
    try {
      if (resolveProjectName(name) !== name || name.length > 214) throw new Error("invalid name");
    } catch {
      throw new DependencyResolutionError("INVALID_CATALOG", `Invalid root dependency name '${name}'.`);
    }
    if (typeof range !== "string" || !isValidVersionRange(range)) {
      throw new DependencyResolutionError("INVALID_CATALOG", `Invalid version range '${String(range)}' for root dependency '${name}'.`);
    }
    addConstraint(initial, name, { range, requestedBy: "<root>" });
  }

  let lastFailure: DependencyResolutionError | undefined;
  const search = (state: SearchState): SearchState | null => {
    // Expand selected releases before choosing another package. Marking a
    // release expanded also makes dependency cycles terminate deterministically.
    const pending = [...state.selected.keys()].sort().find((name) => !state.expanded.has(name));
    if (pending) {
      const release = state.selected.get(pending)!;
      const next = cloneState(state);
      next.expanded.add(pending);
      for (const [dependency, range] of Object.entries(release.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        addConstraint(next, dependency, { range, requestedBy: `${release.name}@${release.version}` });
        const selected = next.selected.get(dependency);
        if (selected && !satisfiesAll(selected.version, next.constraints.get(dependency)!)) {
          lastFailure = new DependencyResolutionError(
            "VERSION_CONFLICT",
            `Version conflict for '${dependency}': selected ${selected.version}, but ${release.name}@${release.version} requires ${range}.`,
          );
          return null;
        }
      }
      return search(next);
    }

    const unresolved = [...state.constraints.keys()].filter((name) => !state.selected.has(name)).sort();
    if (unresolved.length === 0) return state;
    const name = unresolved[0]!;
    const constraints = state.constraints.get(name)!;
    const releases = available.get(name) ?? [];
    if (releases.length === 0) {
      lastFailure = new DependencyResolutionError(
        "PACKAGE_NOT_FOUND",
        `Package '${name}' is not available (required by ${constraints.map((item) => item.requestedBy).join(", ")}).`,
      );
      return null;
    }
    const candidates = releases.filter((release) => satisfiesAll(release.version, constraints));
    if (candidates.length === 0) {
      lastFailure = new DependencyResolutionError(
        "VERSION_CONFLICT",
        `No single version of '${name}' satisfies ${constraints.map((item) => `${item.range} (from ${item.requestedBy})`).join(" and ")}.`,
      );
      return null;
    }
    for (const candidate of candidates) {
      const next = cloneState(state);
      next.selected.set(name, candidate);
      const result = search(next);
      if (result) return result;
    }
    return null;
  };

  const resolved = search(initial);
  if (!resolved) {
    throw lastFailure ?? new DependencyResolutionError("VERSION_CONFLICT", "Unable to resolve package dependencies.");
  }

  const packages = [...resolved.selected.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((release) => ({
      name: release.name,
      version: release.version,
      dependencies: { ...(release.dependencies ?? {}) },
    }));
  const edges: DependencyEdge[] = Object.entries(rootDependencies)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, range]) => ({ from: "<root>", to: `${name}@${resolved.selected.get(name)!.version}`, range }));
  for (const release of packages) {
    for (const [name, range] of Object.entries(release.dependencies).sort(([a], [b]) => a.localeCompare(b))) {
      edges.push({ from: `${release.name}@${release.version}`, to: `${name}@${resolved.selected.get(name)!.version}`, range });
    }
  }
  return { packages, edges };
}
