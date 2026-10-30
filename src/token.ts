export type TokenType =
  | "number" | "string" | "identifier"
  | "let" | "const" | "fn" | "return" | "print" | "if" | "else" | "while"
  | "true" | "false" | "null"
  | "typeNumber" | "typeString" | "typeBoolean" | "typeVoid"
  | "leftParen" | "rightParen" | "leftBrace" | "rightBrace"
  | "colon" | "comma" | "semicolon" | "newline" | "arrow" | "pipe"
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
