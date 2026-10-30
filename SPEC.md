# Wibufy Language Specification
## Draft 0.2

**Status:** Active development specification  
**Language:** Wibufy  
**File extension:** `.wbf`  
**Implementation language:** TypeScript

## 1. Language Overview

Wibufy is a modern, statically typed, general-purpose programming language.

It is designed for scripting, application development, automation, tooling, and general software development.

Wibufy aims to provide:
- Modern and expressive syntax.
- Static typing with type inference.
- A tree-walk interpreter.
- A JavaScript compilation target.
- A consistent runtime model.
- A standard library and package ecosystem.
- A subtle anime/Japanese-inspired syntax identity without sacrificing readability.

## 2. Design Principles

1. **Readability:** syntax should be easy to understand.
2. **Safety:** type errors should be detected before execution whenever possible.
3. **Consistency:** interpreter and compiled execution must follow the same language semantics.
4. **Predictability:** implicit conversions should be limited and documented.
5. **Extensibility:** language architecture should support future backends.
6. **Developer experience:** diagnostics and tooling are first-class concerns.
7. **Subtle identity:** Wibufy may offer a small set of anime/Japanese-inspired aliases, while keeping familiar keywords as the primary syntax.

## 3. Syntax Identity: Subtle Weeb + Mixed Keywords

Wibufy uses familiar programming-language keywords as its primary syntax, with a limited set of official Wibufy aliases.

The goal is to give Wibufy a recognizable identity without making programs difficult to read or learn.

### 3.1 Core keywords

The standard keywords remain supported:

| Keyword | Meaning |
|---|---|
| `let` | Mutable variable binding |
| `const` | Immutable variable binding |
| `fn` | Function declaration |
| `return` | Return from a function |
| `if`, `else` | Conditional execution |
| `while` | While loop |
| `true`, `false` | Boolean literals |
| `null` | Absence of a value |
| `void` | Function with no return value |
| `and`, `or`, `!` | Logical operators |

### 3.2 Official Wibufy aliases

The following aliases are approved for Draft 0.2:

| Standard keyword | Wibufy alias | Meaning |
|---|---|---|
| `fn` | `koto` | Function declaration |
| `const` | `senpai` | Immutable variable binding |
| `true` | `sugoi` | Boolean true |
| `false` | `muri` | Boolean false |

Aliases and their standard counterparts have identical semantics. They do not introduce separate AST node kinds, runtime behavior, type rules, or performance characteristics.

Examples:

```wbf
fn greet(name: string) -> void {
    print("Konnichiwa, " + name);
}

koto welcome(name: string) -> void {
    print("Yokoso, " + name);
}

const language: string = "Wibufy";
senpai edition: string = "0.2";

let enabled: boolean = true;
let awesome: boolean = sugoi;

let disabled: boolean = false;
let impossible: boolean = muri;
```

### 3.3 Reserved-word policy

All four Wibufy aliases—`koto`, `senpai`, `sugoi`, and `muri`—are reserved keywords.

They cannot be used as ordinary identifiers, including variable names, function names, parameter names, or user-defined type names.

The corresponding standard keywords remain reserved as well.

### 3.4 Mixed usage

A source file may freely mix standard keywords and Wibufy aliases.

```wbf
fn add(a: number, b: number) -> number {
    return a + b;
}

koto multiply(a: number, b: number) -> number {
    return a * b;
}

const title = "Wibufy";
senpai version = "0.2";

print(add(10, 20));
print(multiply(10, 20));
```

The choice of spelling does not change the program's meaning.

### 3.5 Built-ins and library naming

Anime/Japanese-inspired names are encouraged for selected standard-library APIs where they improve Wibufy's identity without changing core language grammar.

Such names are ordinary library identifiers, not reserved keywords. For example, a future greetings module might expose:

```wbf
import { konnichiwa } from "wibufy/greetings";

konnichiwa("Developer");
```

The names `kawaii()` and `nani()` are not reserved or assigned built-in semantics in Draft 0.2. They may be considered for future libraries after their behavior is specified.

## 4. Source Files and Statement Termination

- File extension: `.wbf`
- Encoding: UTF-8
- Comments: `//` line comments.
- Semicolons are optional.
- Newlines may terminate statements when the grammar permits.

The parser must distinguish statement termination from line breaks inside expressions and function calls.

Newline rules implemented in v0.2:
- A newline terminates a complete statement.
- A semicolon may be used instead of a newline.
- A newline inside parentheses is ignored while parsing grouped expressions and function arguments.
- A newline immediately after a binary or unary operator continues the expression.
- A newline before an operator terminates the preceding statement; operators should be placed at the end of the previous line for continuation.
- A statement may end immediately before `}` or end-of-file.
- Two statements on the same line require a semicolon between them.
- Braces delimit blocks and scopes.

Both forms are valid:

```wbf
let name = "Wibufy"
print(name)
```

```wbf
let name = "Wibufy";
print(name);
```

Multiline expressions are valid when the grammar indicates continuation:

```wbf
let total = 10 +
    20 +
    30
```

## 5. Type System

Wibufy uses static typing.

The type checker analyzes a program before execution or compilation.

### 5.1 Built-in Types

| Type | Description |
|---|---|
| `number` | IEEE-754 double precision number |
| `string` | Text |
| `boolean` | True or false |
| `null` | Absence of a value |
| `void` | Function without a return value |

Future types include arrays, objects, function types, and generic types.

### 5.2 Type Annotations

Variables may declare an explicit type.

```wbf
let age: number = 21;
let username: string = "prstyaDev";
const enabled: boolean = true;
```

### 5.3 Type Inference

When an annotation is omitted, Wibufy infers the type from the initializer.

```wbf
let age = 21;
let username = "prstyaDev";
let enabled = sugoi;
```

The inferred type must be checked consistently when the variable is reassigned.

### 5.4 Nullable Types

Nullable types use union syntax with `null`.

```wbf
let username: string | null = null;

username = "prstyaDev";
username = null;
```

In v0.2, the only supported union form is a nullable type with exactly one non-null type and `null`, such as `string | null` or `number | null`. General union types are deferred to v0.4.

A nullable value must be narrowed before being used where a non-null value is required. The v0.2 type checker recognizes a direct `value != null` condition in the true branch of an `if` statement.

```wbf
let nickname: string | null = "Senpai";

if nickname != null {
    print("Konnichiwa, " + nickname);
}
```

Inside the conditional's true branch, the type checker recognizes `nickname` as `string`. More advanced narrowing, including compound conditions and false-branch narrowing, is deferred.

### 5.5 Type Compatibility

- Assignment must respect the declared or inferred type.
- Function arguments must match parameter types.
- Return values must match the declared return type.
- Arithmetic operators require compatible operands. In v0.2, `+` accepts two numbers or two strings.
- Logical operators require boolean operands.
- `if` and `while` conditions must be boolean.
- Non-void functions must return a compatible value on every statically recognized path.
- Invalid type combinations must produce compile-time diagnostics before interpretation.
- `sugoi` and `true` both have type `boolean`.
- `muri` and `false` both have type `boolean`.

Implicit conversion between unrelated types is not part of the initial specification.

## 6. Variables

Wibufy supports mutable and immutable variable declarations.

### Mutable variable

```wbf
let counter: number = 0;
counter = counter + 1;
```

### Immutable variable

```wbf
const language: string = "Wibufy";
senpai edition: string = "0.2";
```

Rules:
- `let` declares a mutable binding.
- `const` and `senpai` declare an immutable binding.
- Duplicate declarations in the same scope are errors.
- Nested scopes may shadow outer bindings.
- Reassignment of an immutable binding is an error.

## 7. Operators

### Arithmetic
`+`, `-`, `*`, `/`, `%`

### Comparison
`>`, `>=`, `<`, `<=`

### Equality
`==`, `!=`

### Logical
`and`, `or`, `!`

Symbolic alternatives `&&` and `||` are also accepted.

Operator precedence, associativity, and operand requirements must be defined consistently by the parser and type checker.

## 8. Control Flow

### Conditional

```wbf
if age >= 18 {
    print("Adult");
} else {
    print("Minor");
}
```

### While loop

```wbf
let count = 0;

while count < 5 {
    print(count);
    count = count + 1;
}
```

Future control-flow features:
- `for ... in`
- `break`
- `continue`

## 9. Functions

Functions use `fn` or its Wibufy alias `koto`.

```wbf
fn add(a: number, b: number) -> number {
    return a + b;
}

koto greet(name: string) -> string {
    return "Konnichiwa, " + name;
}

let result = add(10, 20);
print(greet("Wibufy"));
```

Rules:
- Parameters require type annotations.
- Return types are explicitly declared in the initial function specification.
- Functions may return values using `return`.
- Functions without a return value use `void`.
- Function calls validate argument count and types.
- Function declarations are top-level only in v0.2.
- Function bodies use lexical access to top-level bindings declared before the function.
- Top-level functions are available for recursive calls and forward function references.
- Non-void functions must return on every statically recognized path.
- `fn` and `koto` have identical semantics.

## 10. Naming Conventions

Recommended conventions:

| Element | Convention | Example |
|---|---|---|
| Variables | camelCase | `userName` |
| Functions | camelCase | `calculatePower()` |
| Constants | camelCase | `maxLevel` |
| Types | PascalCase | `UserProfile` |
| Modules | lowercase | `greetings` |
| Wibufy aliases | lowercase | `koto`, `senpai` |

These are style recommendations, not syntax requirements.

## 11. Error Handling

Wibufy distinguishes errors by phase:
- Lexer errors.
- Parser errors.
- Semantic errors.
- Type errors.
- Runtime errors.
- Compiler errors.

Lexer and parser diagnostics include source line and column. Current semantic and type diagnostics identify the error category and relevant symbol/type, but do not yet consistently include source spans.

Type errors are reported before interpreter execution. The v0.2 CLI does not generate JavaScript; that backend is planned for v0.6.

A future release will introduce a standardized error handling model.

## 12. Execution Model

Wibufy is designed for two execution paths, but v0.2 implements the interpreter only.

### Interpreter (v0.2)

The CLI lexes, parses, statically checks, and then evaluates the program using a tree-walk interpreter.

```bash
npm run dev -- run main.wbf
```

### JavaScript compiler (planned for v0.6)

The first compiler backend will target JavaScript. It must preserve Wibufy semantics, including type checking, variable behavior, function calls, and runtime behavior.

JavaScript is the first backend, not the definition of the Wibufy language itself.

## 13. Compiler Architecture

The intended architecture is:
1. Source code.
2. Lexer.
3. Parser.
4. AST.
5. Semantic analysis.
6. Static type checker.
7. Execution backend.

Execution backends:
- Tree-walk interpreter (implemented in v0.2).
- JavaScript compiler (planned for v0.6).

The frontend and semantic analysis are designed to be shared by both backends.

Alias normalization belongs in the frontend. For example, `koto` and `fn` should produce the same function-declaration representation in the AST. The interpreter and compiler should not need to distinguish which spelling the source code used.

## 14. Development Roadmap

### v0.1.0 — Foundation
- Lexer and tokenizer.
- Parser and AST.
- Tree-walk interpreter.
- Variables and expressions.
- Conditions and loops.
- Basic lexical scope.

### v0.2.0 — Core Language
- Variable reassignment.
- Type annotations and local type inference.
- Static type checker and type compatibility validation.
- Top-level function declarations, typed parameters, calls, recursion, and forward function references.
- Return statements and non-void return-path validation.
- Nullable types using `T | null` and direct `value != null` narrowing.
- Optional semicolons with newline statement termination.
- Wibufy syntax aliases: `koto`, `senpai`, `sugoi`, `muri`.
- Reserved-word handling and alias normalization.
- Tree-walk interpreter integration.
- Automated regression tests.

### v0.3.0 — Data Structures
- Arrays.
- Objects.
- Indexing and property access.
- `for ... in`.
- Generic collections groundwork.
- Collection operations.

### v0.4.0 — Advanced Type System
- Generic functions.
- Union types.
- Nullable type handling.
- Type narrowing.
- Type aliases.
- Improved inference.
- Advanced compile-time diagnostics.

### v0.5.0 — Modules and Standard Library
- Module system.
- Import and export.
- File system APIs.
- JSON support.
- String and math utilities.
- Date/time utilities.
- Basic I/O.

### v0.6.0 — JavaScript Compiler
- AST-to-JavaScript compiler.
- JavaScript runtime integration.
- Source maps.
- Build command.
- Compiler diagnostics.
- Interpreter/compiler compatibility tests.

### v0.7.0 — Developer Tools
- REPL.
- Formatter.
- Linter.
- Language Server Protocol.
- VS Code extension.
- Syntax highlighting.
- Debugging support.

### v0.8.0 — Package Ecosystem
- Package manager.
- Project initialization.
- Dependency management.
- Lockfile.
- Package registry design.
- Publishing workflow.

### v0.9.0 — Optimization and Stabilization
- Compiler optimization.
- Runtime performance improvements.
- Memory management review.
- Security review.
- Cross-platform testing.
- Compatibility testing.
- Documentation completion.

### v1.0.0 — Stable Release
- Stable language specification.
- Stable type system.
- Stable interpreter.
- JavaScript compiler.
- Standard library v1.
- CLI release.
- Documentation and tutorials.
- Compatibility policy.

## 15. v0.2 Implementation Boundaries

The current v0.2 implementation includes the lexer, parser, AST, static type checker, tree-walk interpreter, CLI, examples, and automated tests.

Known v0.2 limitations:
- Function declarations are top-level only.
- Nullable narrowing currently handles direct `value != null` checks in the true branch of an `if` statement.
- General union types, arrays, objects, generics, modules, and standard-library modules are not implemented.
- Semantic/type diagnostics do not yet consistently carry source spans.
- The JavaScript compiler is not part of v0.2 and is planned for v0.6.

## 16. Locked Design Decisions

| Area | Decision |
|---|---|
| Language category | General-purpose |
| Typing | Static typing |
| Type inference | Supported |
| Null handling | Nullable union: `T | null` |
| Statement terminator | Optional semicolon |
| Implementation language | TypeScript |
| Initial interpreter | Tree-walk |
| First compiler backend | JavaScript |
| v0.2 type checker | Included |
| Syntax style | Subtle Weeb + Mixed Keywords |
| Function alias | `koto` for `fn` |
| Constant alias | `senpai` for `const` |
| Boolean true alias | `sugoi` for `true` |
| Boolean false alias | `muri` for `false` |
| Alias policy | Official reserved keywords |

These decisions should not be changed casually. Changes require an explicit specification revision.

## 17. Compatibility Policy

During the 0.x development phase, syntax and semantics may evolve.

Each release should document:
- Added features.
- Changed behavior.
- Removed or deprecated syntax.
- Breaking changes.
- Known limitations.

The v1.0 release will establish the initial stable compatibility policy.

---

**End of Wibufy Specification Draft 0.2**
