export type TypeName = "number" | "string" | "boolean" | "void" | "null";
export type TypeRef = TypeName | { kind: "union"; types: TypeName[] };

export type Expr =
  | { kind: "literal"; value: unknown }
  | { kind: "variable"; name: string }
  | { kind: "grouping"; expression: Expr }
  | { kind: "unary"; operator: string; right: Expr }
  | { kind: "binary"; left: Expr; operator: string; right: Expr }
  | { kind: "assign"; name: string; value: Expr }
  | { kind: "call"; callee: Expr; args: Expr[] };

export type Stmt =
  | { kind: "var"; name: string; annotation?: TypeRef; initializer: Expr; mutable: boolean }
  | { kind: "function"; name: string; params: { name: string; type: TypeRef }[]; returnType: TypeRef; body: Stmt[] }
  | { kind: "return"; value?: Expr }
  | { kind: "print"; expression: Expr }
  | { kind: "expression"; expression: Expr }
  | { kind: "block"; statements: Stmt[] }
  | { kind: "if"; condition: Expr; thenBranch: Stmt; elseBranch?: Stmt }
  | { kind: "while"; condition: Expr; body: Stmt };
