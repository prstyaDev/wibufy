import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../editor/vscode/', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

test('VS Code extension registers Wibufy .wbf language support', () => {
  const manifest = readJson('package.json');
  const language = manifest.contributes.languages.find((item) => item.id === 'wibufy');
  assert.ok(language);
  assert.ok(language.extensions.includes('.wbf'));
  assert.equal(manifest.version, '0.7.0-dev.6');
  assert.equal(manifest.main, './extension.cjs');
  assert.ok(manifest.activationEvents.includes('onLanguage:wibufy'));
});

test('VS Code extension assets and editor configuration exist', () => {
  const manifest = readJson('package.json');
  const grammar = manifest.contributes.grammars.find((item) => item.language === 'wibufy');
  assert.ok(grammar);
  assert.ok(existsSync(new URL(grammar.path, root)));
  assert.ok(existsSync(new URL('language-configuration.json', root)));
  assert.ok(existsSync(new URL('snippets/wibufy.json', root)));
  assert.ok(existsSync(new URL('icons/wibufy.svg', root)));
});

test('Wibufy grammar highlights core language constructs and aliases', () => {
  const grammar = readJson('syntaxes/wibufy.tmLanguage.json');
  const source = JSON.stringify(grammar);
  for (const keyword of ['fn', 'koto', 'let', 'senpai', 'return', 'if', 'else', 'import', 'export']) {
    assert.ok(source.includes(keyword));
  }
});

test('LSP server uses the explicit Node.js package entrypoint', () => {
  const source = readFileSync(new URL('../../src/lsp.ts', root), 'utf8');
  assert.match(source, /from \"vscode-languageserver\/node\.js\"/);
});

test('VS Code extension starts the Wibufy language client', () => {
  const extension = readFileSync(new URL('extension.cjs', root), 'utf8');
  assert.ok(extension.includes('vscode-languageclient/node'));
  assert.ok(extension.includes('dist/lsp.js'));
  assert.ok(extension.includes('new LanguageClient'));
  assert.ok(existsSync(new URL('.vscode/launch.json', root)));
});
