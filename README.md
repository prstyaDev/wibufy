# Wibufy

<p align="center">
  <img src="https://img.shields.io/badge/version-0.8.0--dev.8.1-blue" alt="Version 0.8.0-dev.8.1">
  <img src="https://img.shields.io/badge/status-v0.8%20complete-brightgreen" alt="v0.8 complete">
  <img src="https://img.shields.io/badge/language-TypeScript-3178C6" alt="Implemented in TypeScript">
  <img src="https://img.shields.io/badge/runtime-Node.js%2020%2B-339933" alt="Node.js 20 or newer">
  <img src="https://img.shields.io/badge/source-.wbf-informational" alt="Wibufy source files use .wbf">
</p>

**Modern. Expressive. General-purpose.**

Wibufy is an experimental, statically typed general-purpose programming language implemented in TypeScript. It combines a tree-walk interpreter, a JavaScript compiler, a module system, developer tools, and a local-first package ecosystem.

The project explores a language design that feels familiar to programmers while keeping a subtle anime/Japanese-inspired identity through a small set of syntax aliases.

> **Project status:** v0.8 Package Ecosystem is complete. The next planned milestone is v0.9 Optimization & Stabilization. Wibufy is experimental and is not yet a stable, production-ready language.

## Highlights

- Static type checking with local type inference.
- Union types, generic functions, generic type aliases, and structural constraints.
- Arrays, structural objects, indexing, mutation, and iteration.
- Relative modules with named and namespace imports.
- Built-in standard-library modules for math, strings, JSON, date/time, file system, and I/O.
- Tree-walk interpreter and Node.js JavaScript compiler.
- VS Code extension, syntax highlighting, custom `.wbf` icon, formatter, REPL, and initial Language Server Protocol diagnostics.
- Local-first package manager with semantic versioning, dependency resolution, strict lockfiles, archive integrity checks, and a local registry.

## Quick start

### Requirements

- Node.js 20 or newer
- npm

### Get the source and install dependencies

```bash
git clone https://github.com/prstyaDev/wibufy.git
cd wibufy
npm install
```

### Run a Wibufy program

```bash
npm run dev -- run examples/hello.wbf
```

### Start the REPL

```bash
npm run dev -- repl
```

The REPL keeps successful declarations between submissions, evaluates standalone expressions, and supports multiline blocks. Enter `.help` for available commands and `.exit` to quit. Imports and exports are not available in the REPL.

### Build and run compiled JavaScript

```bash
npm run dev -- build examples/compiler.wbf
node dist/build/compiler.js
```

The compiler performs module loading and static type checking before generating JavaScript. The initial compiler target is Node.js.

## A small example

```wbf
fn greet(name: string) -> string {
    return "Konnichiwa, " + name
}

let language = "Wibufy"
print(greet(language))
```

Wibufy also supports a small set of optional language aliases:

| Standard keyword | Wibufy alias | Meaning |
|---|---|---|
| `fn` | `koto` | Function declaration |
| `const` | `senpai` | Immutable binding |
| `true` | `sugoi` | Boolean true |
| `false` | `muri` | Boolean false |

The standard keywords remain fully supported. Aliases have identical language semantics.

## Language features

### Types and functions

- Primitive types: `number`, `string`, `boolean`, `null`, and `void`.
- Type annotations and local type inference.
- Union types and direct-variable narrowing with `is`, `== null`, and `!= null`.
- Generic functions with inferred or explicit type arguments.
- Type aliases and generic type aliases.
- Structural generic constraints using `extends`.
- Function argument and return-type checking before execution.

### Data structures and control flow

- Mutable `let` and immutable `const` bindings.
- Arrays using `Array<T>`, with indexing, assignment, and `.length`.
- Structural objects with property access and mutation.
- `for ... in` iteration over arrays.
- Mutable array `push(value)`.
- String methods including `trim`, `toUpperCase`, `toLowerCase`, `includes`, `startsWith`, `endsWith`, `indexOf`, and `replace`.
- Function values stored in object properties can be called through property access.

### Modules and standard library

Wibufy supports relative `.wbf` modules, named imports, namespace imports, and exported functions, values, and type aliases.

```wbf
// math.wbf
export fn add(a: number, b: number) -> number {
    return a + b
}
```

```wbf
// main.wbf
import { add } from "./math.wbf"

print(add(20, 22))
```

Modules are initialized once, dependencies initialize before the entry module, and circular dependencies are rejected. Imported bindings cannot be reassigned by the importing module.

Available standard-library modules:

| Module | Examples of available APIs |
|---|---|
| `wibufy/math` | `abs`, `sqrt`, `floor`, `ceil`, `round`, `pow` |
| `wibufy/string` | `trim`, `split`, `join`, `replace` |
| `wibufy/json` | `parse`, `stringify` |
| `wibufy/datetime` | `now`, `parse`, `toISOString` |
| `wibufy/fs` | `readText`, `writeText`, `exists`, `listDir` |
| `wibufy/io` | `readLine`, `write`, `writeLine` |

The current standard library is synchronous.

## Package ecosystem

Wibufy's package manager is local-first. It does not use a public package registry or contact a remote package server.

A project uses `wibufy.json` as its manifest and `wibufy-lock.json` as its strict lockfile. Installed dependencies are placed in `packages/`.

Common commands (run from a Wibufy project directory):

```bash
wibufy init my-project
wibufy validate
wibufy add <name> <version-range> --archive <package.tar.gz>
wibufy install --archive <package.tar.gz>
wibufy list
wibufy remove <name>
wibufy update --archive <package.tar.gz>
```

Create and publish a package to the local registry:

```bash
wibufy pack
wibufy publish
wibufy search
wibufy search <query>
```

Package archives use `.tar.gz`. The local registry is stored under `~/.wibufy/registry/`; its package cache and configuration are also maintained under `~/.wibufy/`. Package resolution supports direct and transitive dependencies, semantic version ranges, and one selected version per package name in a dependency graph.

The lockfile records exact package versions and SHA-256 archive integrity. Installation validates archive structure and package paths, rejects unsafe links and traversal paths, and stages extraction before replacing installed packages.

## Developer tools

The repository includes a VS Code extension under [`editor/vscode`](editor/vscode). It registers `.wbf` files and provides:

- Syntax highlighting and a custom file icon.
- Bracket, quote, comment, and indentation configuration.
- Starter snippets.
- Language Server Protocol diagnostics for lexer, parser, and type errors.

The CLI also provides a source formatter:

```bash
npm run dev -- format examples/hello.wbf
npm run dev -- format examples/hello.wbf --write
```

Without `--write`, formatted source is printed to standard output. With `--write`, the file is updated only if the formatted result passes lexing and parsing.

## CLI reference

Show available commands:

```bash
npm run dev -- --help
```

Show the current development version:

```bash
npm run dev -- --version
```

The built CLI can also be invoked with `node dist/cli.js` after running `npm run build`.

## Development and tests

```bash
npm install
npm run check
npm test
npm run build
```

- `npm run check` runs the TypeScript type check without emitting build output.
- `npm test` builds the TypeScript project and runs the Node.js regression suite.
- `npm run build` compiles the TypeScript source into `dist/`.

## Current limitations

Wibufy is actively evolving. Some current boundaries include:

- The JavaScript compiler currently targets Node.js; browser, Deno, and Bun targets are not guaranteed.
- The compiler does not yet provide source maps or advanced optimization.
- The language server provides initial diagnostics; workspace-aware import analysis, completion, hover, code actions, rename, and debugging are not yet implemented.
- The REPL does not support module imports or exports.
- The standard library is synchronous; `async`/`await` is not implemented.
- Circular module dependencies are rejected.
- Default exports and dynamic imports are not supported.
- Recursive type aliases, classes, inheritance, interfaces, conditional types, and mapped types are not supported.
- Array iteration is supported, but `break` and `continue` are not yet implemented.
- The local package ecosystem does not include a public registry, remote URL/Git dependencies, install scripts, or multiple selected versions of the same package in one dependency graph.

These limitations describe the current implementation, not necessarily the long-term direction of the language.

## Roadmap

| Version | Milestone | Status |
|---|---|---|
| v0.1 | Foundation | Complete |
| v0.2 | Core Language | Complete |
| v0.3 | Data Structures | Complete |
| v0.4 | Advanced Type System | Complete |
| v0.5 | Modules & Standard Library | Complete |
| v0.6 | JavaScript Compiler | Complete |
| v0.7 | Developer Tools | Complete |
| v0.8 | Package Ecosystem | Complete |
| v0.9 | Optimization & Stabilization | Planned |
| v1.0 | Stable Release | Future goal |

## Documentation

- [Language specification](SPEC.md)
- [Testing guide](TESTING.md)
- [VS Code extension](editor/vscode)

## Contributing

Wibufy is an experimental project and welcomes thoughtful feedback, bug reports, and discussions. Before proposing a language feature, please check the current specification and roadmap so that new work remains consistent with the project's design.

## License

No license file is currently referenced here. Check the repository for the latest licensing information before reusing or distributing the project.
