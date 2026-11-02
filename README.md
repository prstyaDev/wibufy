# Wibufy v0.4.0-dev.2

Modern. Expressive. General-purpose.

Wibufy is an experimental, statically typed general-purpose programming language implemented in TypeScript. Version 0.4 advances the type system with general unions, primitive type narrowing, generic functions, type aliases, generic aliases, and structural constraints while preserving the interpreter and data structures introduced in earlier milestones.

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

## v0.4 language features

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
- Automated regression tests preserving v0.2/v0.3 behavior

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

## Current v0.4 development boundaries

- Function and type-alias declarations are top-level only.
- Primitive type guards support only `number`, `string`, `boolean`, and `null`.
- Narrowing is limited to direct variable checks; compound conditions and structural object guards are not supported.
- Recursive type aliases, classes, inheritance, interfaces, conditional/mapped types, and variadic generics are not supported.
- `for ... in` iterates arrays only.
- Empty arrays require an explicit `Array<T>` annotation.
- Array methods such as `push` and `pop`, `break`, and `continue` are not implemented.
- The JavaScript compiler is planned for v0.6; v0.4 runs through the tree-walk interpreter.
- Type syntax and semantic types both use recursive structured representations. Canonical type keys are used only for identity and union deduplication; assignability, inference, substitution, and narrowing operate on structured nodes.

See [SPEC.md](SPEC.md) for the detailed language specification and roadmap.
