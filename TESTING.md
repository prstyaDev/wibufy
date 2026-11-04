# Testing Wibufy v0.5.0-dev.1

This development snapshot contains the v0.5 module system and standard-library modules. It does not modify or replace an existing Git repository.

## Termux

After downloading and extracting the ZIP:

```bash
cd ~/wibufy-v0.5.0-dev.1
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
- The JavaScript compiler remains planned for v0.6; execution uses the tree-walk interpreter.
- JSON values use a safe, non-recursive `JsonValue` alias in this milestone.
