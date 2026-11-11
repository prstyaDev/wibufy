# Wibufy v0.8.0-dev.6

Modern. Expressive. General-purpose.

Wibufy is an experimental, statically typed general-purpose programming language implemented in TypeScript. The v0.7 developer-tools milestone is complete; the v0.8 development line is building a local-first package ecosystem on top of the interpreter, JavaScript compiler, module system, advanced type system, and standard library.

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

## Language features through v0.7

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
- Arrays, `Array<T>`, indexing, mutation, `.length`, and typed `push(value)`
- Structural objects, property access, and property mutation
- `for ... in` iteration over arrays
- String method calls and chaining: `trim`, `toUpperCase`, `includes`, and related operations
- Optional semicolons with newline-based statement termination
- Wibufy aliases: `koto`, `senpai`, `sugoi`, and `muri`
- Named imports and namespace imports from relative `.wbf` modules
- `export fn`, `export let`/`export const`, and `export type` declarations
- Module caching, dependency-first initialization, and circular-dependency rejection
- Read-only imported bindings with live access to exported mutable values
- Standard library modules: `wibufy/fs`, `wibufy/json`, `wibufy/string`, `wibufy/math`, `wibufy/datetime`, and `wibufy/io`
- Escaped string literals (`\"`, `\\`, `\n`, `\r`, `\t`, `\0`, and `\uXXXX`)
- Automated regression tests preserving earlier language behavior and interpreter/compiler parity


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
- Array `push(value)` is supported and returns the new array length. Other collection methods such as `pop`, `map`, and `filter` are not implemented.
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


## Package manager foundation (v0.8 dev.1–dev.6)

The first package-manager milestone adds project initialization. Create a project in a new directory, or initialize the current directory:

```bash
npm run dev -- init my-project
npm run dev -- init
```

Initialization writes `wibufy.json`, `src/main.wbf`, and a `.gitignore` when one does not already exist. Existing manifest or entry files are protected by default; pass `--force` to replace those generated files. An existing `.gitignore` is always preserved. The initial manifest uses version `0.1.0`, an empty dependency map, and `src/main.wbf` as its entry. No lockfile is created until dependencies are introduced.

Validate a project's manifest and configured entry file with:

```bash
npm run dev -- validate my-project
```

Manifest validation checks the package name, strict SemVer version, optional description and relative `.wbf` entry path, dependency names and supported version-range syntax. The entry must exist and be a file inside the project directory. Unknown fields and malformed JSON are rejected with actionable errors. Supported dependency ranges include exact versions, caret (`^`), tilde (`~`), comparison operators, wildcard (`*`/`x`), comparator intersections (space-separated), and OR alternatives (`||`). SemVer comparison follows prerelease precedence and ignores build metadata for ordering.

The SemVer engine is shared by manifest validation and dependency resolution. The resolver accepts a project dependency map and an available release catalog, resolves direct and transitive dependencies, prefers the highest compatible release, and backtracks when transitive constraints conflict. It enforces one selected version per package name and reports missing packages or incompatible constraints. It is exposed as a package-manager API in dev.3; registry discovery, installation, and lockfile writing are implemented in later milestones.

## Developer tools (v0.7 complete)

The VS Code extension in [`editor/vscode`](editor/vscode) registers `.wbf` files as Wibufy and provides syntax highlighting, a custom file icon, bracket/quote matching, indentation rules, starter snippets, and real-time diagnostics through the Wibufy Language Server.

A first source formatter is available through the CLI:

```bash
npm run dev -- format examples/hello.wbf
npm run dev -- format examples/hello.wbf --write
```

Without `--write`, formatted source is printed to standard output. With `--write`, the file is updated only after the formatted result passes the Wibufy lexer and parser. The formatter preserves keyword aliases and string literal contents. This is an initial formatter; advanced formatting preferences remain future refinements. The interactive REPL, richer diagnostics, and initial Language Server Protocol integration are now available. The current language server validates open documents after edits and reports lexer, parser, and type errors. Type checking is skipped for files containing imports until workspace-aware module analysis is implemented.

### Method calls

Wibufy supports function calls through object properties (`app.greet("Wibufy")`) as well as built-in string and array methods. Object function properties are checked for callability, argument count, and argument types. String method calls can also be chained:

```wbf
let text = "  Wibufy Language  "
print(text.trim().toUpperCase())
print(text.includes("Language"))
print(text.replace("Language", "Compiler"))
```

Available string methods are `toUpperCase()`, `toLowerCase()`, `trim()`, `includes(text)`, `startsWith(text)`, `endsWith(text)`, `indexOf(text)`, and `replace(search, replacement)`. Method calls are type-checked and work in both the interpreter and JavaScript compiler. Array `push(value)` is supported for mutable arrays, validates the element type, mutates the existing array, and returns its new length. The interpreter and JavaScript compiler share these semantics, including calls to functions stored in object properties.


### Array append

```wbf
let tasks: Array<string> = []
tasks.push("Learn Wibufy")
tasks.push("Build a program")

print(tasks.length)
print(tasks[0])
```

`push(value)` appends exactly one element and returns the updated array length. The value must be compatible with the array's invariant element type. Indexed assignment remains bounds-checked; assigning to an out-of-range index does not append.

## v0.7 development status

The v0.7 developer-tools milestone includes:
- VS Code language registration, icon, syntax highlighting, editor configuration, and snippets.
- CLI formatter, interactive REPL, and improved source diagnostics.
- Initial stdio Language Server Protocol diagnostics for open `.wbf` documents.
- String methods and array `push(value)` in both interpreter and JavaScript compiler.

The language server currently skips type checking for documents containing imports because workspace-aware module resolution is not implemented. Completion, hover, code actions, debugging, and a dedicated linter are not included in this milestone.

Run the combined interpreter/compiler smoke example with:

```bash
npm run dev -- run examples/developer_tools.wbf
npm run dev -- build examples/developer_tools.wbf -o /tmp/developer-tools.mjs
node /tmp/developer-tools.mjs
```

### SemVer and dependency resolution (v0.8 dev.3)

The package-manager API exports `parseSemVer`, `compareSemVer`, `satisfiesVersionRange`, and `resolveDependencies`. A release catalog is an array of `{ name, version, dependencies }` records. Resolution returns a deterministically sorted package list and dependency edges. If the catalog cannot satisfy all constraints with one version per package name, the resolver throws `DependencyResolutionError` with `PACKAGE_NOT_FOUND` or `VERSION_CONFLICT`. Package releases with invalid metadata or duplicate `name@version` entries are rejected.


## Package installation and strict lockfile (v0.8 dev.4)

The installer currently accepts local `.tar.gz` package archives directly. Each archive must contain a root `wibufy.json` and its declared `.wbf` entry file. Supply every direct and transitive package archive in one command:

```bash
# The package folder contains wibufy.json and its declared entry file.
tar -czf ../archives/alpha-1.2.0.tar.gz -C ../package-sources alpha

wibufy install --archive ../archives/alpha-1.2.0.tar.gz --archive ../archives/shared-2.1.4.tar.gz
```

The installer resolves the project dependency ranges using the dev.3 resolver, extracts packages into the project-local `packages/` directory, and writes `wibufy-lock.json`. The lockfile records the project identity, exact selected versions, dependency ranges, and SHA-256 archive integrity. Subsequent installs use the lockfile's exact package versions and reject changed project dependencies, missing archives, or integrity mismatches.

Archive extraction rejects absolute/traversal paths, symbolic and hard links, special tar entries, oversized archives/files, invalid checksums, and duplicate filesystem paths. Installation is staged before replacing the existing `packages/` directory. The CLI archive source was intentionally explicit in dev.4; dev.6 adds archive creation and a local registry without network access.


## Package management (v0.8 dev.5)

Package management is local-first. Run commands from the project directory.

- `wibufy add <name> <range> --archive <file.tar.gz> ...` adds a direct dependency and resolves the full graph. Supply archives for the new package and every required direct/transitive package.
- `wibufy remove <name>` removes a direct dependency and prunes packages that are no longer reachable from remaining direct dependencies.
- `wibufy update --archive <file.tar.gz> ...` re-resolves all dependencies against the supplied local archives, preferring the highest compatible versions.
- `wibufy list` displays direct and transitive packages from the strict lockfile.

`add` and `update` require all archives needed to resolve the resulting dependency graph. No network registry is contacted. `remove` uses the existing lockfile and does not need archives.


## Package archive and local registry (v0.8 dev.6)

Create a distributable archive from the current project:

```bash
wibufy pack
wibufy pack ./artifacts/my-package.tar.gz
```

The default output is `dist/packages/<name>-<version>.tar.gz`. Package creation validates `wibufy.json` and the declared entry file, then includes project files while excluding `.git/`, `node_modules/`, `packages/`, `dist/`, `.wibufy/`, `wibufy-lock.json`, and `.DS_Store`. Symbolic links and special filesystem entries are rejected. The archive uses the same size limits and validation rules as package installation. Existing output files are never overwritten.

Publish the current project to the local registry and search published releases:

```bash
wibufy publish
wibufy search
wibufy search json
```

The registry is stored under `~/.wibufy/registry/<name>/<version>/`, with `package.tar.gz` and `metadata.json` for each release. Publishing validates the generated archive, records its SHA-256 integrity, and refuses to replace an existing `name@version`. Search matches package names and descriptions and verifies archive identity, metadata, and integrity before displaying a release. The registry is local to the current user account; these commands do not contact a network service. Package imports are resolved from `packages/<name>/` and are supported by the module loader, type checker, interpreter, and JavaScript compiler. The dev.8 hardening rejects malformed tar endings, duplicate archive paths, file/directory path collisions, and symbolic links in installed package roots, manifests, or entry files.
