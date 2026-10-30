# Wibufy

**Modern. Expressive. General-purpose.**

Wibufy is an experimental general-purpose programming language. This repository contains the first tree-walk interpreter prototype, implemented in TypeScript.

## Requirements

- Node.js 20 or newer
- npm

## Run

```bash
npm install
npm run dev -- examples/hello.wbf
```

Type-check:

```bash
npm run check
```

Build:

```bash
npm run build
npm start -- examples/hello.wbf
```

## Current prototype (0.1.0)

Implemented:
- `let` and `const` declarations
- number, string, boolean and null literals
- arithmetic and comparison operators
- `and`, `or`, `!`
- `print`
- lexical block scope
- `if` / `else`
- `while`
- `//` comments

Not implemented yet:
- assignment after declaration
- functions and return
- arrays and objects
- static type checker
- imports/modules
- compiler/bytecode/VM
- standard library and package manager

The prototype intentionally starts small. The syntax examples in `SPEC.md` describe the intended direction and may include features that are not implemented yet.

## Project structure

```text
src/
  token.ts        Token model
  lexer.ts        Source code -> tokens
  ast.ts          AST node definitions
  parser.ts       Tokens -> AST
  interpreter.ts  AST -> execution
  cli.ts          Command-line entry point
examples/
  hello.wbf
  math.wbf
```

## Design principles

1. Readability over clever syntax.
2. Explicit, predictable behavior.
3. Helpful diagnostics with source locations.
4. A small core language with a useful standard library.
5. Keep the language implementation independent from its eventual runtime.

## License

MIT (proposed; add a LICENSE file before publishing).
