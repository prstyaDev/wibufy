/** A parsed Semantic Version (SemVer 2.0.0). */
export interface SemVer {
  major: string;
  minor: string;
  patch: string;
  prerelease: string[];
  build: string[];
}

interface Comparator {
  operator: "=" | ">" | ">=" | "<" | "<=";
  version: SemVer;
}

type RangeSet = Comparator[];

const IDENTIFIER = "(?:0|[1-9]\\d*)";
const VERSION_PATTERN = new RegExp(
  `^(${IDENTIFIER})\\.(${IDENTIFIER})\\.(${IDENTIFIER})(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$`,
);

function compareNumericStrings(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return left === right ? 0 : left < right ? -1 : 1;
}

export function parseSemVer(version: string): SemVer | null {
  const match = VERSION_PATTERN.exec(version);
  if (!match) return null;
  const prerelease = match[4]?.split(".") ?? [];
  for (const identifier of prerelease) {
    if (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")) return null;
  }
  return {
    major: match[1]!,
    minor: match[2]!,
    patch: match[3]!,
    prerelease,
    build: match[5]?.split(".") ?? [],
  };
}

export function isValidSemVer(version: string): boolean {
  return parseSemVer(version) !== null;
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return compareNumericStrings(a, b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

/** Compare two valid versions. Build metadata is intentionally ignored. */
export function compareSemVer(left: string | SemVer, right: string | SemVer): number {
  const a = typeof left === "string" ? parseSemVer(left) : left;
  const b = typeof right === "string" ? parseSemVer(right) : right;
  if (!a || !b) throw new Error("compareSemVer requires valid SemVer versions");
  for (const field of ["major", "minor", "patch"] as const) {
    const comparison = compareNumericStrings(a[field], b[field]);
    if (comparison !== 0) return comparison;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function makeVersion(major: string, minor: string, patch: string): SemVer {
  return { major, minor, patch, prerelease: [], build: [] };
}

function increment(value: string): string {
  // BigInt avoids precision loss for large, but valid, SemVer numeric identifiers.
  return (BigInt(value) + 1n).toString();
}

function comparator(operator: Comparator["operator"], version: SemVer): Comparator {
  return { operator, version };
}

function parseComparatorToken(token: string): Comparator[] | null {
  if (token === "*" || token.toLowerCase() === "x") return [];
  const match = /^(\^|~|>=|>|<=|<)?(.+)$/.exec(token);
  if (!match) return null;
  const operator = match[1] ?? "=";
  const version = parseSemVer(match[2]!);
  if (!version) return null;

  if (operator === "^") {
    let upper: SemVer;
    if (version.major !== "0") upper = makeVersion(increment(version.major), "0", "0");
    else if (version.minor !== "0") upper = makeVersion("0", increment(version.minor), "0");
    else upper = makeVersion("0", "0", increment(version.patch));
    return [comparator(">=", version), comparator("<", upper)];
  }
  if (operator === "~") {
    return [comparator(">=", version), comparator("<", makeVersion(version.major, increment(version.minor), "0"))];
  }
  if (operator === ">=" || operator === ">" || operator === "<=" || operator === "<") {
    return [comparator(operator, version)];
  }
  return [comparator("=", version)];
}

function parseRange(range: string): RangeSet[] | null {
  if (!range.trim()) return null;
  const alternatives = range.split("||");
  if (alternatives.some((part) => !part.trim())) return null;
  const sets: RangeSet[] = [];
  for (const alternative of alternatives) {
    const tokens = alternative.trim().split(/\s+/);
    const set: RangeSet = [];
    for (const token of tokens) {
      const parsed = parseComparatorToken(token);
      if (!parsed) return null;
      set.push(...parsed);
    }
    sets.push(set);
  }
  return sets;
}

export function isValidVersionRange(range: string): boolean {
  return parseRange(range) !== null;
}

function satisfiesComparator(version: SemVer, item: Comparator): boolean {
  const comparison = compareSemVer(version, item.version);
  switch (item.operator) {
    case "=": return comparison === 0;
    case ">": return comparison > 0;
    case ">=": return comparison >= 0;
    case "<": return comparison < 0;
    case "<=": return comparison <= 0;
  }
}

/** Check whether a valid version satisfies a supported Wibufy version range. */
export function satisfiesVersionRange(version: string, range: string): boolean {
  const parsedVersion = parseSemVer(version);
  const sets = parseRange(range);
  if (!parsedVersion || !sets) return false;
  return sets.some((set) => {
    // SemVer prereleases are opt-in: a comparator set must mention a prerelease
    // with the same major/minor/patch tuple to admit that prerelease line.
    if (parsedVersion.prerelease.length > 0) {
      const explicitlyMentionsPrerelease = set.some((item) =>
        item.version.prerelease.length > 0
        && item.version.major === parsedVersion.major
        && item.version.minor === parsedVersion.minor
        && item.version.patch === parsedVersion.patch,
      );
      if (!explicitlyMentionsPrerelease) return false;
    }
    return set.every((item) => satisfiesComparator(parsedVersion, item));
  });
}
