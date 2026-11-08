import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function repl(input) {
  const result = spawnSync(process.execPath, ['dist/cli.js', 'repl'], {
    input,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return `${result.stdout}\n${result.stderr}`;
}

test('REPL keeps declarations between submissions and prints expression results', () => {
  const output = repl('let base = 40\nbase + 2\n.exit\n');
  assert.match(output, /42/);
  assert.match(output, /Goodbye from Wibufy/);
});

test('REPL supports multiline functions and calls from later submissions', () => {
  const output = repl('koto double(value: number) -> number {\n  return value * 2\n}\ndouble(21)\n.exit\n');
  assert.match(output, /42/);
});

test('REPL reports type errors without discarding later valid input', () => {
  const output = repl('let broken: number = "nope"\nprint("still working")\n.exit\n');
  assert.match(output, /Type Error/);
  assert.match(output, /still working/);
});
