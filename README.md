# Wibufy v0.3.0

Modern. Expressive. General-purpose.

Wibufy is an experimental, statically typed general-purpose programming language implemented in TypeScript. Version 0.3 builds on the v0.2 core with arrays, structural objects, indexing, property access, and array iteration while preserving static typing and type inference.

## Requirements

- Node.js 20 or newer
- npm

## Install

```bash
npm install
```

## Check and test

```bash
npm run check
npm test
npm run build
```

## Run a program

```bash
npm run dev -- run examples/hello.wbf
```

Or after building:

```bash
node dist/cli.js run examples/hello.wbf
```

## v0.3 language features

- Lexer, parser, AST, and tree-walk interpreter
- `let` and `const` with mutability checks
- Static types: `number`, `string`, `boolean`, `void`, and `null`
- Type annotations and local type inference
- Assignment and reassignment validation
- Nullable types written as `T | null`
- Null-check narrowing for direct `value != null` conditions
- Top-level function declarations with typed parameters and explicit return types
- Function calls, recursion, forward function references, and `return`
- Compile-time validation of argument types, argument counts, and return types
- Non-void functions must return on every statically recognized path
- `if`, `else`, `while`, `for ... in`, `print(...)`, arithmetic, comparison, and logical operators
- Array literals, `Array<T>` annotations, homogeneous element validation, indexing, indexed assignment, and `.length`
- Mutable arrays use invariant element types (including nested arrays), while object values retain structural compatibility
- Object literals, structural type inference, inline object type annotations, property access, and property assignment
- Nested arrays and objects
- Array iteration with scoped, immutable iteration variables
- Optional semicolons with newline-based statement termination
- Wibufy aliases: `koto`, `senpai`, `sugoi`, and `muri`
- Automated language regression tests

## Wibufy aliases

| Standard keyword | Wibufy alias | Meaning |
|---|---|---|
| `fn` | `koto` | Function declaration |
| `const` | `senpai` | Immutable binding |
| `true` | `sugoi` | Boolean true |
| `false` | `muri` | Boolean false |

Aliases are reserved keywords and normalize to the same token and AST behavior as their standard counterparts.

## Example

```wbf
koto greet(name: string) -> string {
    return "Konnichiwa, " + name
}

senpai language = "Wibufy"
let message = greet("Developer")
print(language)
print(message)
```

## Diagnostics

Wibufy reports structured errors for four phases:

- **Lexer errors:** unexpected characters and invalid lexical input.
- **Parser errors:** invalid syntax and unexpected tokens.
- **Type errors:** incompatible types, invalid declarations, and other semantic checks.
- **Runtime errors:** execution failures such as division by zero.

Diagnostics include the source filename, line, column, source line, and a code-frame pointer when location information is available.

Lexer and parser diagnostics use token locations. Type and runtime diagnostics currently point to the containing statement rather than the exact expression or operator. Runtime errors inside functions point to the failing function statement.

## Current v0.3 limitations

- Function declarations are top-level only.
- Nullable narrowing currently recognizes direct `value != null` checks in the `if` true branch.
- Union types other than `T | null` are not supported yet.
- Generic functions, advanced generic constraints, modules, imports/exports, and a standard library remain planned for later milestones.
- `for ... in` currently iterates arrays only.
- Empty arrays require an explicit `Array<T>` annotation.
- Array indexing is zero-based and checked at runtime for integer bounds.
- Arrays expose `.length`; broader collection methods such as `push` and `pop` are not implemented yet.
- The JavaScript compiler is planned for v0.6; v0.3 runs through the tree-walk interpreter.

See [SPEC.md](SPEC.md) for the language specification and roadmap.
