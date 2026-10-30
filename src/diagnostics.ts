export type DiagnosticPhase = "Lexer" | "Parser" | "Type" | "Runtime";

export function formatDiagnostic(
  phase: DiagnosticPhase,
  sourceName: string,
  sourceText: string,
  line: number,
  column: number,
  message: string,
  spanLength = 1,
): string {
  const lines = sourceText.split(/\r?\n/);
  const sourceLine = lines[line - 1] ?? "";
  const width = String(line).length;
  const pointer = `${" ".repeat(Math.max(0, column - 1))}${"^".repeat(Math.max(1, Math.min(spanLength, Math.max(1, sourceLine.length - column + 2))))}`;
  return [
    `[Wibufy ${phase} Error]`,
    `  --> ${sourceName}:${line}:${column}`,
    "",
    `${String(line).padStart(width)} | ${sourceLine}`,
    `${" ".repeat(width)} | ${pointer}`,
    `  | ${message}`,
  ].join("\n");
}
