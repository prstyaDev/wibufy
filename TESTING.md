# Wibufy v0.7.0-dev.9 — Testing Guide

## Requirements and setup

- Node.js 20 or newer
- npm

```bash
npm install
npm run check
npm test
git diff --check
```

`npm test` builds TypeScript first, then runs the full Node.js regression suite.

## CLI smoke tests

```bash
npm run dev -- run examples/hello.wbf
npm run dev -- run examples/developer_tools.wbf
npm run dev -- build examples/developer_tools.wbf --out /tmp/developer-tools.mjs
node /tmp/developer-tools.mjs
npm run dev -- format examples/hello.wbf
npm run dev -- format examples/hello.wbf --write
npm run dev -- repl
```

The integrated developer-tools example exercises array append, string method chaining, array length, and iteration. Interpreter and compiler output should match exactly.

## Interactive REPL

```bash
npm run dev -- repl
```

Try `let answer = 40`, then `answer + 2`, then `.help` and `.exit`. The expression should print `42`. Successful declarations persist between submissions. Multiline blocks are supported; imports and exports are not available in the REPL.

## Formatter

- Verify operator spacing, indentation, aliases, and string contents.
- Verify inline and standalone comments remain present.
- Verify a comment-only file remains unchanged except for a normalized final newline.
- Verify invalid formatted source is not written when using `--write`.
- Formatting an already formatted file should be stable.

## Language server and VS Code extension

1. From the repository root, run `npm install` and `npm run build`.
2. Open `editor/vscode` in VS Code and press F5.
3. Open a `.wbf` file and introduce lexer, parser, and type errors.
4. Verify diagnostics update as the document changes and clear when the document closes.

The current language server skips type checking for documents containing imports because workspace-aware module analysis is not yet implemented. Completion, hover, code actions, rename, and debugging are not part of this milestone.

## Method and collection semantics
- Object function properties can be called with `object.method(arguments)`; callability, arity, argument types, and return types are checked.
- Interpreter and compiler both invoke object-stored functions with matching output.

- String methods: `toUpperCase`, `toLowerCase`, `trim`, `includes`, `startsWith`, `endsWith`, `indexOf`, and `replace`.
- Chained string method calls work and evaluate each receiver once.
- Array `push(value)` appends one element, validates its element type, mutates the original array, and returns its new length.
- Array `length` reflects the appended elements.
- Invalid element types and invalid method calls produce type diagnostics.
- Indexed reads and writes remain bounds-checked; out-of-range writes do not append.

## Regression coverage

The test suite covers earlier language, type-system, module, standard-library, interpreter, compiler, diagnostics, formatter, REPL, editor-extension, and LSP diagnostic behavior. v0.7 integration tests also compare the output of the combined developer-tools example between interpreter and compiled JavaScript.
