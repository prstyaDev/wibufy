import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const example = fileURLToPath(new URL("../examples/developer_tools.wbf", import.meta.url));

test("CLI rejects unknown commands instead of treating them as source paths", () => {
  const result = spawnSync(process.execPath, [cli, "unknown-command"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command 'unknown-command'/);
  assert.match(result.stderr, /Usage:/);
});

test("CLI run executes the integrated developer-tools example", () => {
  const output = execFileSync(process.execPath, [cli, "run", example], { encoding: "utf8" });
  assert.equal(output, "3\n3\nWIBUFY TOOLS\nWibufy Tools\nLanguage Server\nArray Append\n");
});

test("CLI build writes executable JavaScript to the requested output path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wibufy-cli-build-"));
  try {
    const output = join(directory, "program.mjs");
    execFileSync(process.execPath, [cli, "build", example, "--out", output], { encoding: "utf8" });
    const result = execFileSync(process.execPath, [output], { encoding: "utf8" });
    assert.equal(result, "3\n3\nWIBUFY TOOLS\nWibufy Tools\nLanguage Server\nArray Append\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
