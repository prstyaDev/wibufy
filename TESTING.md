# Testing Wibufy v0.7.0-dev.4

This development snapshot contains the v0.6 JavaScript compiler on top of the v0.5 module system and standard library. It does not modify or replace an existing Git repository.

## Termux

After downloading and extracting the ZIP:

```bash
cd ~/wibufy
npm install
npm run check
npm test
npm run dev -- run examples/modules/main.wbf
npm run dev -- run examples/standard_library.wbf
```

The test suite preserves the v0.2-v0.4 regression coverage and adds module, import/export, circular-dependency, standard-library, and escaped-string tests.

## Module behavior to test

- Named imports, renamed imports, and namespace imports.
- Exported functions, variables/constants, and type aliases.
- Private declarations cannot be imported.
- Relative module resolution and `.wbf` extension checks.
- Modules initialize once and dependencies initialize before the entry module.
- Circular dependencies are rejected.
- Imported bindings are read-only.
- All modules are type-checked before execution.

## Standard library

- `wibufy/fs`: `readText`, `writeText`, `exists`, `listDir`.
- `wibufy/json`: `parse`, `stringify`.
- `wibufy/string`: `trim`, `split`, `join`, `replace`.
- `wibufy/math`: `abs`, `sqrt`, `floor`, `ceil`, `round`, `pow`.
- `wibufy/datetime`: `now`, `parse`, `toISOString`.
- `wibufy/io`: `readLine`, `write`, `writeLine`.

## Notes

- Node.js 20+ and npm are required.
- `npm install` is required before running the project scripts.
- The tree-walk interpreter remains available alongside the JavaScript compiler.
- JSON values use a safe, non-recursive `JsonValue` alias in this milestone.


## v0.6 JavaScript compiler

Run the compiler regression suite with `npm test`. Compiler tests cover JavaScript generation and execution for functions, expressions, arrays, objects, loops, array bounds, primitive type guards (including single evaluation of their input), JavaScript-reserved/source-helper identifier isolation, standard-library native functions, and dependency-flattened local modules.

Build an example with `npm run dev -- build examples/compiler.wbf`, then execute the generated file with `node dist/build/compiler.js`. Use `--out <file.js>` to select another destination. The module example can also be compiled with `npm run dev -- build examples/modules/main.wbf`.


## VS Code extension smoke test

- Open `editor/vscode` as a folder in VS Code and launch an Extension Development Host with `F5`.
- Open an `.wbf` file and verify Wibufy syntax highlighting, the custom file icon, comment toggling, bracket/quote matching, indentation, and snippets.
- The extension is an early development build; formatter, REPL, language-server diagnostics, and debugging are not yet implemented.

## Interactive REPL smoke test

```bash
npm run dev -- repl
```

Try `let answer = 40`, then `answer + 2`, then `.exit`. The expression should print `42`.


## v0.7.0-dev.4 — Better diagnostics

- `npm run check` validates TypeScript types.
- `npm test` includes diagnostic formatting and suggestion regression tests.
- Check a parser hint with `printf 'print(1 + )\n' > /tmp/bad.wbf` then `npm run dev -- run /tmp/bad.wbf`.
- Check a type hint with `npm run dev -- run examples/type_error.wbf`.
- Diagnostics should show adjacent source lines, a caret, and a Help suggestion when a reliable suggestion exists.
