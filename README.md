# Wibufy v0.7.0-dev.5

Modern. Expressive. General-purpose.

Wibufy is an experimental, statically typed general-purpose programming language implemented in TypeScript. Version 0.7 development begins the developer-tools milestone, building on the JavaScript compiler, tree-walk interpreter, module system, advanced type system, and standard library.

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

## Interactive REPL

Start an interactive Wibufy session:

```bash
npm run dev -- repl
```

Enter expressions, declarations, and functions directly. Declarations remain available between submissions, and standalone expressions print their result. Multiline blocks are supported. Use `.help` for commands and `.exit` to leave the session. Module imports and exports are not available inside the REPL yet.

## Language features through v0.5

- Lexer, parser, AST, static type checker, and tree-walk interpreter
- `let` and `const` with mutability checks
- Primitive types: `number`, `string`, `boolean`, `void`, and `null`
- General union types, including `number | string | null`
- Union normalization and union-aware assignability
- Primitive `is` guards for `number`, `string`, `boolean`, and `null`
- True- and false-branch narrowing for primitive guards and null comparisons
- Generic functions with inferred or explicit type arguments
- Multiple type parameters and nested generic inference
- Type aliases and generic type aliases
- Structural and dependent generic constraints using `extends`
- Contextual array typing for function parameters and explicitly typed union arrays
- Arrays, `Array<T>`, indexing, mutation, and `.length`
- Structural objects, property access, and property mutation
- `for ... in` iteration over arrays
- Optional semicolons with newline-based statement termination
- Wibufy aliases: `koto`, `senpai`, `sugoi`, and `muri`
- Named imports and namespace imports from relative `.wbf` modules
- `export fn`, `export let`/`export const`, and `export type` declarations
- Module caching, dependency-first initialization, and circular-dependency rejection
- Read-only imported bindings with live access to exported mutable values
- Standard library modules: `wibufy/fs`, `wibufy/json`, `wibufy/string`, `wibufy/math`, `wibufy/datetime`, and `wibufy/io`
- Escaped string literals (`\"`, `\\`, `\n`, `\r`, `\t`, `\0`, and `\uXXXX`)
- Automated regression tests preserving v0.2-v0.4 behavior


## Modules

A module is a `.wbf` file. Local imports use paths relative to the importing file:

```wbf
// math.wbf
export const PI: number = 3.14159

export fn add(a: number, b: number) -> number {
  return a + b
}
```

```wbf
// main.wbf
import { add, PI } from "./math.wbf"
import * as math from "wibufy/math"

print(add(20, 22))
print(PI)
print(math.sqrt(81))
```

Only exported declarations can be imported. Imports and exports are top-level only. Local module paths must be relative and end in `.wbf`. Each module is loaded and initialized once; dependencies initialize before the entry module. Circular dependencies are rejected. Imported bindings cannot be reassigned by the importing module.

## Standard library

| Module | Functions |
|---|---|
| `wibufy/fs` | `readText`, `writeText`, `exists`, `listDir` |
| `wibufy/json` | `parse`, `stringify` |
| `wibufy/string` | `trim`, `split`, `join`, `replace` |
| `wibufy/math` | `abs`, `sqrt`, `floor`, `ceil`, `round`, `pow` |
| `wibufy/datetime` | `now`, `parse`, `toISOString` |
| `wibufy/io` | `readLine`, `write`, `writeLine` |

The interpreter and initial compiler runtime are synchronous. `datetime.now()` returns a Unix timestamp in milliseconds; `datetime.parse()` accepts a date/time string and returns a timestamp in milliseconds; `datetime.toISOString()` converts a timestamp to ISO 8601. `wibufy/json` exposes a safe `JsonValue` alias without using `any`; in this development release its static alias covers primitives, primitive arrays, and opaque object values. Dynamic property access on parsed JSON objects is not yet supported by the static type system.

## Generic function example

```wbf
fn identity<T>(value: T) -> T {
    return value
}

print(identity(42))
print(identity<string>("Wibufy"))
```

## Type alias and constraint example

```wbf
type Box<T> = { value: T }

fn readValue<T extends { value: number }>(item: T) -> number {
    return item.value
}

let box: Box<number> = { value: 100 }
print(readValue(box))
```

## Union and narrowing example

```wbf
fn show(value: number | string) -> void {
    if value is number {
        print(value + 1)
    } else {
        print(value + "!")
    }
}

show(10)
show("Wibufy")
```

## Wibufy aliases

| Standard keyword | Wibufy alias | Meaning |
|---|---|---|
| `fn` | `koto` | Function declaration |
| `const` | `senpai` | Immutable binding |
| `true` | `sugoi` | Boolean true |
| `false` | `muri` | Boolean false |

Aliases are reserved keywords and normalize to the same token and AST behavior as their standard counterparts.

## Diagnostics

Wibufy reports lexer, parser, type, and runtime errors. Diagnostics include source location and a code-frame pointer when location information is available. Type errors are detected before interpreter execution.

## Current language boundaries

- Function and type-alias declarations are top-level only.
- Imports and exports are top-level only; default exports are not supported.
- Local imports must use relative `.wbf` paths; package resolution is deferred to v0.8.
- Circular module dependencies are rejected.
- Imported bindings are read-only; module exports remain live references.
- The JSON type alias is intentionally non-recursive until recursive type aliases are designed.
- Primitive type guards support only `number`, `string`, `boolean`, and `null`.
- Narrowing is limited to direct variable checks; compound conditions and structural object guards are not supported.
- Recursive type aliases, classes, inheritance, interfaces, conditional/mapped types, and variadic generics are not supported.
- `for ... in` iterates arrays only.
- Empty arrays require an explicit `Array<T>` annotation.
- Array methods such as `push` and `pop`, `break`, and `continue` are not implemented.
- The initial JavaScript compiler targets Node.js. Source maps, browser/Deno/Bun targets, advanced optimization, and full JavaScript interoperability remain future work.
- Type syntax and semantic types both use recursive structured representations. Canonical type keys are used only for identity and union deduplication; assignability, inference, substitution, and narrowing operate on structured nodes.

See [SPEC.md](SPEC.md) for the detailed language specification and roadmap.

## JavaScript Compiler (v0.6)

Wibufy can compile a checked `.wbf` entry module and its dependencies to executable JavaScript for Node.js:

```bash
npm run dev -- build examples/compiler.wbf
node dist/build/compiler.js
```

Use `--out <file.js>` (or `-o`) to choose a different output path. The compiler reuses the existing lexer, parser, module loader, and type checker; it emits JavaScript from the resolved AST. The tree-walk interpreter remains available with `wibufy run <file.wbf>`.

The first compiler release targets Node.js. Browser, Deno, and Bun runtimes are future compatibility targets, not part of the current v0.6 guarantee. Source maps and full source-aware generated-code diagnostics are still under development.


## Developer tools (v0.7 dev.5)

The VS Code extension in [`editor/vscode`](editor/vscode) registers `.wbf` files as Wibufy and provides syntax highlighting, a custom file icon, bracket/quote matching, indentation rules, starter snippets, and real-time diagnostics through the Wibufy Language Server.

A first source formatter is available through the CLI:

```bash
npm run dev -- format examples/hello.wbf
npm run dev -- format examples/hello.wbf --write
```

Without `--write`, formatted source is printed to standard output. With `--write`, the file is updated only after the formatted result passes the Wibufy lexer and parser. The formatter preserves keyword aliases and string literal contents. This is an initial formatter; comment-only lines and advanced formatting preferences remain future refinements. The interactive REPL, richer diagnostics, and initial Language Server Protocol integration are now available. The current language server validates open documents after edits and reports lexer, parser, and type errors. Type checking is skipped for files containing imports until workspace-aware module analysis is implemented.
