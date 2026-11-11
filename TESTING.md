# Wibufy v0.8.0-dev.4 — Testing Guide

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


## v0.8 dev.2 — Manifest validation and dev.2.1 nullable hotfix

- Run `npm run dev -- validate <project-directory>` to validate `wibufy.json` and its entry file.
- Confirm malformed JSON, invalid SemVer, invalid package/dependency names, unsupported dependency ranges, unknown fields, unsafe entry paths, and missing/non-file entry paths are rejected.
- Confirm a valid manifest and existing `.wbf` entry are accepted.

## v0.8 dev.3 — SemVer and dependency resolver

- Verify SemVer parsing, numeric/prerelease ordering, and build-metadata-insensitive precedence.
- Verify exact, caret, tilde, comparator, wildcard, comparator-intersection, and OR version ranges.
- Verify prerelease admission follows SemVer range rules.
- Resolve direct and transitive dependencies and prefer the highest compatible releases.
- Confirm backtracking selects a lower release when a transitive constraint requires it.
- Confirm one-version-per-package conflicts and missing packages are reported.
- Reject invalid catalog metadata and duplicate package releases.
- Confirm dependency cycles terminate without infinite resolution.


## v0.8 dev.4 — package installation and strict lockfile

- Create valid `.tar.gz` archives containing `wibufy.json` and the declared entry `.wbf` file.
- Install direct and transitive dependencies with repeated `--archive` options.
- Verify extracted packages appear under `packages/<name>/`.
- Verify `wibufy-lock.json` records exact versions, dependency ranges, and SHA-256 integrity.
- Repeat installation and confirm the strict lockfile selects the same exact versions.
- Modify an archive without changing its package version and confirm integrity mismatch rejection.
- Change project dependencies after lock creation and confirm strict lockfile rejection.
- Confirm missing direct/transitive archives do not modify project packages or create a lockfile.
- Reject archive path traversal, links, special tar entries, malformed checksums, and oversized content.
- Verify an empty dependency map creates an empty lockfile.


## v0.8 dev.7 — package import integration

- Build a local package archive and install it into a separate consumer project.
- Verify named imports with both `wibufy run` and `wibufy build` output.
- Verify namespace imports with both `wibufy run` and `wibufy build` output.
- Verify missing package imports report an actionable installation message.

## v0.8 dev.8 — integration hardening and security

- Verify the full regression suite and TypeScript check.
- Reject archives without a complete two-block tar end marker.
- Reject non-zero data after the tar end marker and invalid tar block alignment.
- Reject duplicate normalized archive paths and file/directory path collisions.
- Reject archive input paths that are symbolic links.
- Reject installed package directory, manifest, or entry-file symbolic links.
- Verify named and namespace package imports continue to work in the interpreter and JavaScript compiler.
- Verify strict reinstall preserves exact versions and SHA-256 integrity.
- Run the complete CLI package workflow: init, validate, pack, publish, search, install, run, and build.
