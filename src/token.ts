export type TokenType =
  | "number" | "string" | "identifier"
  | "let" | "const" | "print" | "if" | "else" | "while"
  | "true" | "false" | "null"
  | "leftParen" | "rightParen" | "leftBrace" | "rightBrace"
  | "semicolon" | "comma"
  | "plus" | "minus" | "star" | "slash" | "percent"
  | "bang" | "bangEqual" | "equal" | "equalEqual"
  | "greater" | "greaterEqual" | "less" | "lessEqual"
  | "and" | "or" | "eof";

export interface Token {
  type: TokenType;
  lexeme: string;
  literal: string | number | boolean | null;
  line: number;
  column: number;
}
