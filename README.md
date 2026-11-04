# Wibufy v0.5.0-dev.1

Modern. Expressive. General-purpose.

Wibufy is an experimental, statically typed general-purpose programming language implemented in TypeScript. Version 0.5 adds a module system and built-in standard-library modules on top of the statically typed interpreter and advanced type system.

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

## v0.5 language features

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

The interpreter is synchronous. `datetime.now()` returns a Unix timestamp in milliseconds; `datetime.parse()` accepts a date/time string and returns a timestamp in milliseconds; `datetime.toISOString()` converts a timestamp to ISO 8601. `wibufy/json` exposes a safe `JsonValue` alias without using `any`; in this development release its static alias covers primitives, primitive arrays, and opaque object values. Dynamic property access on parsed JSON objects is not yet supported by the static type system.

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

## Current v0.5 development boundaries

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
- The JavaScript compiler is planned for v0.6; v0.4 runs through the tree-walk interpreter.
- Type syntax and semantic types both use recursive structured representations. Canonical type keys are used only for identity and union deduplication; assignability, inference, substitution, and narrowing operate on structured nodes.

See [SPEC.md](SPEC.md) for the detailed language specification and roadmap.
