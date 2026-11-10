export type DiagnosticPhase = "Lexer" | "Parser" | "Type" | "Runtime";

function suggestionFor(message: string): string | undefined {
  if (/undefined variable '([^']+)'/.test(message)) {
    return "Check the spelling, or declare the variable before using it.";
  }
  if (/unknown function '([^']+)'/.test(message)) {
    return "Check the function name and make sure it is declared or imported.";
  }
  if (/unknown type '([^']+)'/.test(message)) {
    return "Use a built-in type or declare/import the type alias before referencing it.";
  }
  if (/Expected variable name/.test(message)) {
    return "Choose an identifier that is not a reserved Wibufy keyword or alias.";
  }
  if (/Expected expression/.test(message)) {
    return "Add a value, variable, function call, or parenthesized expression here.";
  }
  if (/Expected '\)'/.test(message)) return "Add the missing ')' to close this expression or argument list.";
  if (/Expected '\}'/.test(message)) return "Add the missing '}' to close this block.";
  if (/Expected '\]'/.test(message)) return "Add the missing ']' to close this array or index expression.";
  if (/Unterminated string/.test(message)) return "Add a closing double quote to finish the string literal.";
  if (/Unsupported escape sequence|Invalid Unicode escape/.test(message)) {
    return "Use a supported escape sequence such as an escaped quote, backslash, newline, tab, or Unicode \\uXXXX.";
  }
  if (/cannot assign to constant/.test(message)) return "Declare the binding with 'let' if it needs to be reassigned.";
  if (/expects .+, got /.test(message)) return "Make the value's type match the expected type, or adjust the annotation.";
  if (/division by zero/i.test(message)) return "Make sure the divisor is not zero before dividing.";
  return undefined;
}

export function formatDiagnostic(
  phase: DiagnosticPhase,
  sourceName: string,
  sourceText: string,
  line: number,
  column: number,
  message: string,
  spanLength = 1,
  suggestion = suggestionFor(message),
): string {
  const lines = sourceText.split(/\r?\n/);
  const safeLine = Math.max(1, Math.min(line, Math.max(1, lines.length)));
  const sourceLine = lines[safeLine - 1] ?? "";
  const safeColumn = Math.max(1, Math.min(column, sourceLine.length + 1));
  const width = String(Math.min(lines.length, safeLine + 1)).length;
  const pointerLength = Math.max(1, Math.min(spanLength, Math.max(1, sourceLine.length - safeColumn + 1)));
  const pointer = `${" ".repeat(safeColumn - 1)}${"^".repeat(pointerLength)}`;
  const firstContextLine = Math.max(1, safeLine - 1);
  const lastContextLine = Math.min(lines.length, safeLine + 1);
  const gutter = " ".repeat(width);
  const excerpt: string[] = [];

  for (let current = firstContextLine; current <= lastContextLine; current++) {
    const number = String(current).padStart(width);
    excerpt.push(`${number} | ${lines[current - 1] ?? ""}`);
    if (current === safeLine) excerpt.push(`${gutter} | ${pointer}`);
  }

  const output = [
    `[Wibufy ${phase} Error]`,
    `  --> ${sourceName}:${safeLine}:${safeColumn}`,
    "",
    ...excerpt,
    `  = ${message}`,
  ];
  if (suggestion) output.push(`  = Help: ${suggestion}`);
  return output.join("\n");
}
