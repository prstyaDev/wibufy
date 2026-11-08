import { createInterface } from "node:readline";
import type { Stmt } from "./ast.js";
import { Interpreter } from "./interpreter.js";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { TypeChecker } from "./typechecker.js";

function needsMoreInput(source: string, error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/Unterminated string|Unterminated escape sequence/.test(message)) return true;

  try {
    const tokens = new Lexer(source).scan();
    let parentheses = 0;
    let braces = 0;
    let brackets = 0;
    for (const token of tokens) {
      if (token.type === "leftParen") parentheses++;
      else if (token.type === "rightParen") parentheses--;
      else if (token.type === "leftBrace") braces++;
      else if (token.type === "rightBrace") braces--;
      else if (token.type === "leftBracket") brackets++;
      else if (token.type === "rightBracket") brackets--;
    }
    if (parentheses > 0 || braces > 0 || brackets > 0) return true;
  } catch {
    return /Unterminated string|Unterminated escape sequence/.test(message);
  }

  if (message.includes("Expected '{' before function body.")) return true;
  return /Expected expression\.|Expected .+ after|Expected .+ before|Expected a type name/.test(message)
    && /(?:=|\+|-|\*|\/|,|:|->|\bis\b|\breturn\b|\bfrom\b)\s*$/.test(source.trim());
}

function printable(statements: Stmt[]): Stmt[] {
  return statements.map(statement => statement.kind === "expression"
    ? { ...statement, kind: "print" as const, expression: statement.expression }
    : statement);
}

export async function runRepl(): Promise<void> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  const interpreter = new Interpreter(value => console.log(value));
  let history = "";
  let pending = "";
  let historyStatements: Stmt[] = [];

  console.log("Wibufy Interactive REPL v0.7.0-dev.4");
  console.log("Type Wibufy code, .help for commands, or .exit to quit.");
  terminal.setPrompt("wibufy> ");
  terminal.prompt();

  for await (const line of terminal) {
    if (!pending && line.trim() === ".exit") break;
    if (!pending && line.trim() === ".help") {
      console.log("Commands: .help, .exit\nEnter expressions, declarations, and functions. Use braces for multiline blocks.");
      terminal.prompt();
      continue;
    }
    if (!pending && line.trim() === ".clear") {
      console.clear();
      terminal.prompt();
      continue;
    }

    pending += `${line}\n`;
    let program: Stmt[];
    try {
      program = new Parser(new Lexer(pending, "<repl>").scan(), pending, "<repl>").parse();
    } catch (error) {
      if (needsMoreInput(pending, error)) {
        terminal.setPrompt("...     ");
        terminal.prompt();
        continue;
      }
      console.error(error instanceof Error ? error.message : String(error));
      pending = "";
      terminal.setPrompt("wibufy> ");
      terminal.prompt();
      continue;
    }

    try {
      if (program.some(statement => statement.kind === "import" || statement.exported)) {
        throw new Error("Imports and exports are not available in the interactive REPL.");
      }
      const combinedSource = history + pending;
      const combinedProgram = [...historyStatements, ...program];
      new TypeChecker("<repl>", combinedSource).check(combinedProgram);
      interpreter.interpret(printable(program));
      history = combinedSource;
      historyStatements = combinedProgram;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
    pending = "";
    terminal.setPrompt("wibufy> ");
    terminal.prompt();
  }

  terminal.close();
  console.log("Goodbye from Wibufy.");
}
