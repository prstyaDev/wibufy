# Wibufy Language Specification — Draft 0.1

Status: design draft, not a frozen specification.

## 1. Goals

Wibufy is a modern, general-purpose, multi-paradigm language intended for scripting, application development, tooling and (eventually) compiled programs.

Non-goals for the first milestone:
- matching the performance of C, Rust or Go
- guaranteeing memory safety before a type/runtime model is specified
- shipping a stable package ecosystem in v0.1

## 2. Source files

- Extension: `.wbf`
- UTF-8 source text
- `//` line comments
- Statements may end with a semicolon; semicolons are optional at line/block boundaries in the planned grammar. The prototype currently accepts optional semicolons.

## 3. Syntax direction

```wbf
let username = "prstyaDev";
const language = "Wibufy";

fn greet(name: string) -> string {
    return "Hello, " + name;
}

if true {
    print(greet(username));
}
```

The function/type examples above are planned syntax, not yet implemented.

## 4. Core types (planned)

- `number` — initially IEEE-754 double
- `string` — immutable UTF-8 text
- `boolean` — `true` / `false`
- `null` — absence of a value
- `array<T>` — ordered collection
- `object` — key/value structure
- function types

## 5. Variables

- `let` declares a mutable binding.
- `const` declares an immutable binding.
- Shadowing is allowed in nested scopes; duplicate names in the same scope are errors.
- Type annotations are optional initially; static type checking is a later milestone.

## 6. Operators

Planned precedence, high to low:
1. grouping and calls
2. unary `!`, `-`
3. `*`, `/`, `%`
4. `+`, `-`
5. comparisons `<`, `<=`, `>`, `>=`
6. equality `==`, `!=`
7. logical `and` / `or` (or symbolic `&&` / `||`; final choice pending)

The prototype supports this precedence for the operators listed in README.

## 7. Control flow

Planned: `if` / `else`, `while`, `for ... in`, `break`, `continue`.

Prototype: `if` / `else`, `while`.

## 8. Functions and modules (planned)

- `fn name(parameters) -> ReturnType { ... }`
- lexical closures
- explicit `return`
- module imports with a future `use` or `import` decision

## 9. Errors

Errors should identify the phase (lexer/parser/runtime) and source line/column. Runtime errors should not silently coerce incompatible values.

## 10. Implementation roadmap

- 0.1: lexer, parser, AST, interpreter, declarations, expressions, conditions, loops
- 0.2: assignment, functions, return, call expressions
- 0.3: arrays, objects, `for ... in`, built-in collection operations
- 0.4: static type checker and improved diagnostics
- 0.5: modules, standard library, file and JSON APIs
- 0.6: bytecode format and virtual machine exploration
- 0.7: formatter, language server, VS Code syntax support
- 1.0: stable language specification, compatibility policy and release tooling

## 11. Open design decisions

Before v1.0, decide:
- static vs gradual typing
- semicolon policy and newline grammar
- symbolic vs word-based logical operators
- error/result model
- memory management strategy
- module/package format
- bytecode VM vs native compilation target
