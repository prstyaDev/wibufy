export interface WibufyDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: 1;
  source: string;
  message: string;
}

/**
 * Convert the human-readable diagnostics produced by the compiler frontend
 * into an LSP diagnostic. Wibufy source positions are one-based; LSP
 * positions are zero-based.
 */
export function parseWibufyDiagnostic(
  error: unknown,
  sourceText: string,
): WibufyDiagnostic {
  const output = error instanceof Error ? error.message : String(error);
  const phaseMatch = output.match(/\[Wibufy (Lexer|Parser|Type|Runtime) Error\]/);
  const locationMatch = output.match(/^\s*--> .+:(\d+):(\d+)\s*$/m);
  const messageMatch = output.match(/^\s*= (?!Help:)(.+)$/m);
  const inlineTypeMatch = output.match(/^\[Wibufy Type Error\]\s*(.+)$/m);

  const lines = sourceText.split(/\r?\n/);
  const rawLine = Number(locationMatch?.[1] ?? 1);
  const line = Math.max(1, Math.min(Number.isFinite(rawLine) ? rawLine : 1, lines.length));
  const rawColumn = Number(locationMatch?.[2] ?? 1);
  const column = Math.max(1, Number.isFinite(rawColumn) ? rawColumn : 1);
  const lineText = lines[line - 1] ?? "";
  const character = Math.min(column - 1, lineText.length);
  const endCharacter = Math.min(character + 1, lineText.length);

  const fallbackMessage = output
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("[Wibufy") && !part.startsWith("-->") && !part.startsWith("=") && !/^\d+\s*\|/.test(part));

  return {
    range: {
      start: { line: line - 1, character },
      end: { line: line - 1, character: endCharacter },
    },
    severity: 1,
    source: phaseMatch ? `Wibufy ${phaseMatch[1]}` : "Wibufy",
    message: messageMatch?.[1] ?? inlineTypeMatch?.[1] ?? fallbackMessage ?? "Unknown Wibufy diagnostic.",
  };
}
