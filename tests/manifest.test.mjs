import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isValidSemVer,
  isValidVersionRange,
  loadProjectManifest,
  ManifestValidationError,
  validateProjectManifest,
} from "../dist/package-manager/index.js";

async function temporaryDirectory(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

const validManifest = {
  name: "sample-package",
  version: "1.2.3",
  description: "A sample package",
  entry: "src/main.wbf",
  dependencies: { helper: "^2.0.0", exact: "1.4.2", compatible: "~3.1.0" },
};

test("manifest validation accepts a complete valid manifest", () => {
  assert.deepEqual(validateProjectManifest(validManifest), validManifest);
});

test("SemVer validation accepts stable, prerelease, and build metadata versions", () => {
  for (const version of ["0.1.0", "1.2.3", "2.0.0-alpha.1", "1.0.0+build.7", "1.0.0-rc.1+build.9"]) {
    assert.equal(isValidSemVer(version), true, version);
  }
  for (const version of ["1", "1.2", "01.2.3", "1.02.3", "1.2.03", "1.2.3-01", "v1.2.3", "1.2.3.4"]) {
    assert.equal(isValidSemVer(version), false, version);
  }
});

test("dependency version ranges accept exact, caret, tilde, comparators, and wildcard", () => {
  for (const range of ["1.2.3", "^1.2.3", "~1.2.3", ">=1.2.3", ">1.2.3", "<=2.0.0", "<3.0.0", ">=1.0.0 <2.0.0", "*"]) {
    assert.equal(isValidVersionRange(range), true, range);
  }
  for (const range of ["latest", "", "^1.2", "01.2.3", "^1.2.3 ||"]) {
    assert.equal(isValidVersionRange(range), false, range);
  }
});

test("manifest validation reports missing fields, invalid names, and invalid versions", () => {
  assert.throws(
    () => validateProjectManifest({ name: "Bad Name", version: "1.2", dependencies: [] }),
    (error) => {
      assert.ok(error instanceof ManifestValidationError);
      assert.match(error.message, /'name'/);
      assert.match(error.message, /'version'/);
      assert.match(error.message, /'dependencies'/);
      return true;
    },
  );
  assert.throws(() => validateProjectManifest({ version: "1.0.0" }), /'name' is required/);
});

test("manifest validation checks optional field types and rejects unknown fields", () => {
  assert.throws(
    () => validateProjectManifest({ ...validManifest, description: 42, entry: 10, extra: true }),
    (error) => {
      assert.match(error.message, /'description' must be a string/);
      assert.match(error.message, /'entry' must be a string/);
      assert.match(error.message, /unknown field 'extra'/);
      return true;
    },
  );
});

test("manifest validation rejects unsafe entry paths", () => {
  for (const entry of ["../outside.wbf", "src/../outside.wbf", "/tmp/main.wbf", "src\\main.wbf", "src/main.js", ""]) {
    assert.throws(() => validateProjectManifest({ ...validManifest, entry }), /'entry'/, entry);
  }
});

test("manifest validation checks dependency names and version range syntax", () => {
  assert.throws(
    () => validateProjectManifest({ ...validManifest, dependencies: { "Bad Name": "latest", helper: "^1.2" } }),
    (error) => {
      assert.match(error.message, /dependency name 'Bad Name' is invalid/);
      assert.match(error.message, /dependency 'Bad Name' must use/);
      assert.match(error.message, /dependency 'helper' must use/);
      return true;
    },
  );
});

test("loadProjectManifest reads and validates the manifest and entry file", async () => {
  const root = await temporaryDirectory("wibufy-manifest-valid-");
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "main.wbf"), 'print("ok")\n');
    await writeFile(join(root, "wibufy.json"), `${JSON.stringify(validManifest, null, 2)}\n`);
    assert.deepEqual(await loadProjectManifest(root), validManifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadProjectManifest rejects malformed JSON and a missing entry", async () => {
  const root = await temporaryDirectory("wibufy-manifest-invalid-");
  try {
    await writeFile(join(root, "wibufy.json"), "{ invalid json");
    await assert.rejects(loadProjectManifest(root), /invalid JSON/);
    await writeFile(join(root, "wibufy.json"), `${JSON.stringify(validManifest)}\n`);
    await assert.rejects(loadProjectManifest(root), /entry file 'src\/main.wbf' does not exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadProjectManifest rejects a directory as the entry and missing manifest", async () => {
  const root = await temporaryDirectory("wibufy-manifest-entry-dir-");
  try {
    await mkdir(join(root, "src", "main.wbf"), { recursive: true });
    await writeFile(join(root, "wibufy.json"), `${JSON.stringify(validManifest)}\n`);
    await assert.rejects(loadProjectManifest(root), /entry 'src\/main.wbf' is not a file/);
    await assert.rejects(loadProjectManifest(join(root, "missing")), /No wibufy.json found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("loadProjectManifest rejects an entry symlink that escapes the project", async () => {
  const root = await temporaryDirectory("wibufy-manifest-symlink-");
  const outside = await temporaryDirectory("wibufy-manifest-outside-");
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(outside, "outside.wbf"), 'print("outside")\n');
    await symlink(join(outside, "outside.wbf"), join(root, "src", "main.wbf"));
    await writeFile(join(root, "wibufy.json"), `${JSON.stringify(validManifest)}\n`);
    await assert.rejects(loadProjectManifest(root), /resolves outside the project directory/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
