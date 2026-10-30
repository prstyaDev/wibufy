export type Expr =
  | { kind: "literal"; value: unknown }
  | { kind: "variable"; name: string }
  | { kind: "grouping"; expression: Expr }
  | { kind: "unary"; operator: string; right: Expr }
  | { kind: "binary"; left: Expr; operator: string; right: Expr };

export type Stmt =
  | { kind: "var"; name: string; initializer: Expr; mutable: boolean }
  | { kind: "print"; expression: Expr }
  | { kind: "expression"; expression: Expr }
  | { kind: "block"; statements: Stmt[] }
  | { kind: "if"; condition: Expr; thenBranch: Stmt; elseBranch?: Stmt }
  | { kind: "while"; condition: Expr; body: Stmt };
