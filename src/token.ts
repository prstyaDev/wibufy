export type TokenType =
  | "number" | "string" | "identifier"
  | "let" | "const" | "fn" | "type" | "extends" | "is" | "return" | "print" | "if" | "else" | "while" | "for" | "in"
  | "true" | "false" | "null"
  | "typeNumber" | "typeString" | "typeBoolean" | "typeVoid" | "typeArray" | "typeObject"
  | "leftParen" | "rightParen" | "leftBrace" | "rightBrace" | "leftBracket" | "rightBracket"
  | "colon" | "comma" | "dot" | "semicolon" | "newline" | "arrow" | "pipe"
  | "plus" | "minus" | "star" | "slash" | "percent"
  | "bang" | "bangEqual" | "equal" | "equalEqual"
  | "greater" | "greaterEqual" | "less" | "lessEqual"
  | "and" | "or" | "eof";
export interface Token { type: TokenType; lexeme: string; literal: string | number | boolean | null; line: number; column: number }
