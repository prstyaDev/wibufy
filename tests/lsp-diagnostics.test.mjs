import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWibufyDiagnostic } from '../dist/lsp-diagnostics.js';

test('converts parser diagnostics to zero-based LSP positions', () => {
  const source = 'let value = ;';
  const error = new Error([
    '[Wibufy Parser Error]',
    '  --> test.wbf:1:13',
    '',
    '1 | let value = ;',
    '  |             ^',
    '  = Expected expression.',
  ].join('\n'));

  const diagnostic = parseWibufyDiagnostic(error, source);
  assert.equal(diagnostic.source, 'Wibufy Parser');
  assert.equal(diagnostic.message, 'Expected expression.');
  assert.deepEqual(diagnostic.range.start, { line: 0, character: 12 });
});

test('converts type errors without a source location safely', () => {
  const error = new Error("[Wibufy Type Error] undefined variable 'missing'.");
  const diagnostic = parseWibufyDiagnostic(error, 'print missing');

  assert.equal(diagnostic.source, 'Wibufy Type');
  assert.equal(diagnostic.message, "undefined variable 'missing'.");
  assert.deepEqual(diagnostic.range.start, { line: 0, character: 0 });
});

test('clamps diagnostic positions to the current document', () => {
  const error = new Error([
    '[Wibufy Lexer Error]',
    '  --> test.wbf:99:999',
    '  = Unexpected character.',
  ].join('\n'));

  const diagnostic = parseWibufyDiagnostic(error, 'abc');
  assert.deepEqual(diagnostic.range.start, { line: 0, character: 3 });
  assert.deepEqual(diagnostic.range.end, { line: 0, character: 3 });
});

test('preserves multiline source line locations', () => {
  const error = new Error([
    '[Wibufy Type Error]',
    '  --> test.wbf:2:6',
    '  = variable expects number, got string.',
  ].join('\n'));

  const diagnostic = parseWibufyDiagnostic(error, 'let a = 1\nlet b = "x"');
  assert.deepEqual(diagnostic.range.start, { line: 1, character: 5 });
});
