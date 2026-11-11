import test from "node:test";
import assert from "node:assert/strict";
import {
  compareSemVer,
  isValidSemVer,
  isValidVersionRange,
  parseSemVer,
  resolveDependencies,
  satisfiesVersionRange,
  DependencyResolutionError,
} from "../dist/package-manager/index.js";

test("SemVer parser accepts valid versions and rejects invalid numeric identifiers", () => {
  assert.deepEqual(parseSemVer("1.2.3-alpha.1+build.7"), {
    major: "1", minor: "2", patch: "3", prerelease: ["alpha", "1"], build: ["build", "7"],
  });
  for (const version of ["1.2.3", "0.0.0", "10.20.30", "1.2.3-rc.1", "1.2.3+build.4"]) {
    assert.equal(isValidSemVer(version), true, version);
  }
  for (const version of ["01.2.3", "1.02.3", "1.2.03", "1.2.3-01", "1.2", "v1.2.3"]) {
    assert.equal(isValidSemVer(version), false, version);
  }
});

test("SemVer comparison follows numeric and prerelease precedence", () => {
  assert.equal(compareSemVer("1.10.0", "1.9.9"), 1);
  assert.equal(compareSemVer("1.0.0-alpha", "1.0.0-alpha.1"), -1);
  assert.equal(compareSemVer("1.0.0-alpha.2", "1.0.0-alpha.10"), -1);
  assert.equal(compareSemVer("1.0.0-rc.1", "1.0.0"), -1);
  assert.equal(compareSemVer("1.0.0+one", "1.0.0+two"), 0);
});

test("version ranges support exact, caret, tilde, comparators, wildcards, and OR sets", () => {
  for (const range of ["1.2.3", "^1.2.3", "~1.2.3", ">=1.2.3", ">1.2.3", "<=2.0.0", "<3.0.0", "*", "x", ">=1.0.0 <2.0.0", "^1.0.0 || ^2.0.0"]) {
    assert.equal(isValidVersionRange(range), true, range);
  }
  for (const range of ["", "latest", "^1.2", "01.2.3", "^1.2.3 ||", ">=1.0.0 nope"]) {
    assert.equal(isValidVersionRange(range), false, range);
  }
});

test("range evaluation handles caret, tilde, comparator intersections, and prereleases", () => {
  assert.equal(satisfiesVersionRange("1.9.0", "^1.2.3"), true);
  assert.equal(satisfiesVersionRange("2.0.0", "^1.2.3"), false);
  assert.equal(satisfiesVersionRange("0.2.9", "^0.2.3"), true);
  assert.equal(satisfiesVersionRange("0.3.0", "^0.2.3"), false);
  assert.equal(satisfiesVersionRange("1.2.9", "~1.2.3"), true);
  assert.equal(satisfiesVersionRange("1.3.0", "~1.2.3"), false);
  assert.equal(satisfiesVersionRange("1.5.0", ">=1.0.0 <2.0.0"), true);
  assert.equal(satisfiesVersionRange("2.0.0", ">=1.0.0 <2.0.0"), false);
  assert.equal(satisfiesVersionRange("1.2.3-beta.2", ">=1.2.3-beta.1 <1.2.3"), true);
  assert.equal(satisfiesVersionRange("1.2.4-beta.1", ">=1.2.3-beta.1 <2.0.0"), false);
  assert.equal(satisfiesVersionRange("1.2.3", "^1.0.0 || ^2.0.0"), true);
});

test("resolver selects the highest compatible direct and transitive releases", () => {
  const result = resolveDependencies({ alpha: "^1.0.0" }, [
    { name: "alpha", version: "1.0.0", dependencies: { shared: "^2.0.0" } },
    { name: "alpha", version: "1.4.0", dependencies: { shared: "^2.1.0" } },
    { name: "shared", version: "2.1.0" },
    { name: "shared", version: "2.5.0" },
  ]);
  assert.deepEqual(result.packages.map(({ name, version }) => `${name}@${version}`), ["alpha@1.4.0", "shared@2.5.0"]);
  assert.deepEqual(result.edges, [
    { from: "<root>", to: "alpha@1.4.0", range: "^1.0.0" },
    { from: "alpha@1.4.0", to: "shared@2.5.0", range: "^2.1.0" },
  ]);
});

test("resolver backtracks to a lower release when transitive constraints require it", () => {
  const result = resolveDependencies({ alpha: "^1.0.0", beta: "^1.0.0" }, [
    { name: "alpha", version: "1.2.0", dependencies: { shared: "^1.0.0" } },
    { name: "alpha", version: "1.1.0", dependencies: { shared: "^2.0.0" } },
    { name: "beta", version: "1.0.0", dependencies: { shared: "^2.0.0" } },
    { name: "shared", version: "1.5.0" },
    { name: "shared", version: "2.4.0" },
  ]);
  assert.deepEqual(result.packages.map(({ name, version }) => `${name}@${version}`), ["alpha@1.1.0", "beta@1.0.0", "shared@2.4.0"]);
});

test("resolver rejects incompatible requirements when one version per name is required", () => {
  assert.throws(
    () => resolveDependencies({ alpha: "^1.0.0", beta: "^1.0.0" }, [
      { name: "alpha", version: "1.0.0", dependencies: { shared: "^1.0.0" } },
      { name: "beta", version: "1.0.0", dependencies: { shared: "^2.0.0" } },
      { name: "shared", version: "1.5.0" },
      { name: "shared", version: "2.5.0" },
    ]),
    (error) => error instanceof DependencyResolutionError && error.code === "VERSION_CONFLICT" && /No single version/.test(error.message),
  );
});

test("resolver reports packages missing from the available catalog", () => {
  assert.throws(
    () => resolveDependencies({ missing: "^1.0.0" }, []),
    (error) => error instanceof DependencyResolutionError && error.code === "PACKAGE_NOT_FOUND" && /not available/.test(error.message),
  );
});

test("resolver rejects invalid catalogs and duplicate releases", () => {
  assert.throws(() => resolveDependencies({}, [{ name: "Bad Name", version: "1.0.0" }]), /Invalid package name/);
  assert.throws(() => resolveDependencies({}, [null]), /Each catalog release must be an object/);
  assert.throws(() => resolveDependencies({}, [
    { name: "alpha", version: "1.0.0" }, { name: "alpha", version: "1.0.0" },
  ]), /Duplicate package release/);
  assert.throws(() => resolveDependencies({}, [{ name: "alpha", version: "1.0.0", dependencies: { beta: "latest" } }]), /invalid range/);
});

test("resolver handles empty roots and dependency cycles without looping", () => {
  assert.deepEqual(resolveDependencies({}, []), { packages: [], edges: [] });
  const result = resolveDependencies({ alpha: "1.0.0" }, [
    { name: "alpha", version: "1.0.0", dependencies: { beta: "1.0.0" } },
    { name: "beta", version: "1.0.0", dependencies: { alpha: "1.0.0" } },
  ]);
  assert.equal(result.packages.length, 2);
  assert.equal(result.edges.length, 3);
});
