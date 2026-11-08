import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDiagnostic } from '../dist/diagnostics.js';
import { Lexer } from '../dist/lexer.js';
import { Parser } from '../dist/parser.js';
import { TypeChecker } from '../dist/typechecker.js';

test('diagnostics show surrounding source context and an accurate pointer', () => {
  const output = formatDiagnostic('Parser', 'sample.wbf', 'let count = 1\nprint(count + )\nprint(count)', 2, 14, 'Expected expression.');
  assert.match(output, /1 \| let count = 1/);
  assert.match(output, /2 \| print\(count \+ \)/);
  assert.match(output, /3 \| print\(count\)/);
  assert.match(output, /\^/);
  assert.match(output, /Help: Add a value/);
});

test('diagnostics suggest how to fix common undefined-name errors', () => {
  const output = formatDiagnostic('Type', 'sample.wbf', 'print(total)', 1, 7, "undefined variable 'total'.");
  assert.match(output, /Help: Check the spelling/);
});

test('diagnostics safely clamp invalid source positions', () => {
  const output = formatDiagnostic('Lexer', 'sample.wbf', 'x', 99, 99, 'Unexpected character.');
  assert.match(output, /sample\.wbf:1:2/);
  assert.match(output, /1 \| x/);
});

test('diagnostics omit help when no reliable suggestion is available', () => {
  const output = formatDiagnostic('Runtime', 'sample.wbf', 'print(1)', 1, 1, 'Unexpected host failure.');
  assert.doesNotMatch(output, /Help:/);
});

test('type diagnostics hide internal module-loader identifier prefixes', () => {
  const source = 'let __m0_score: number = \"bad\"';
  const program = new Parser(new Lexer(source, 'sample.wbf').scan(), source, 'sample.wbf').parse();
  assert.throws(() => new TypeChecker('sample.wbf', source).check(program), error => {
    assert.match(error.message, /variable 'score'/);
    assert.doesNotMatch(error.message, /__m0_/);
    return true;
  });
});
