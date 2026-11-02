# Testing Wibufy v0.4.0-dev.2

This is a development snapshot intended for local testing. It does not modify or replace your existing Git repository.

## Termux

After downloading and extracting the ZIP:

```bash
cd ~/wibufy-v0.4.0-dev.2
npm install
npm run check
npm test
npm run dev -- run examples/advanced_types.wbf
```

Expected test summary:

```text
tests 83
pass 83
fail 0
```

The advanced-types example should print:

```text
42
42
100
11
Wibufy!
empty
```

## Features to test

- General union types such as `number | string | null`.
- Primitive type guards using `is`.
- True-branch and false-branch narrowing.
- Generic functions with inferred and explicit type arguments.
- Generic type aliases.
- Type aliases and forward references.
- Structural and dependent generic constraints using `extends`.
- Contextual typing for empty arrays in function calls and explicitly typed arrays.

## Notes

- Node.js 20+ and npm are required.
- `npm install` is required before running the project scripts.
- The JavaScript compiler is not part of v0.4; execution still uses the tree-walk interpreter.
- This is a development build. Review `SPEC.md` for the exact language boundaries and current implementation scope.
