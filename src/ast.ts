export type TypeName = "number" | "string" | "boolean" | "void" | "null";
export type TypeRef =
  | TypeName
  | { kind: "namedType"; name: string; arguments: TypeRef[] }
  | { kind: "union"; types: TypeRef[] }
  | { kind: "arrayType"; element: TypeRef }
  | { kind: "objectType"; properties: { name: string; type: TypeRef }[] };
export interface TypeParameter { name: string; constraint?: TypeRef }
export type Expr =
  | { kind: "literal"; value: unknown }
  | { kind: "typeTest"; value: Expr; type: TypeRef }
  | { kind: "variable"; name: string }
  | { kind: "grouping"; expression: Expr }
  | { kind: "unary"; operator: string; right: Expr }
  | { kind: "binary"; left: Expr; operator: string; right: Expr }
  | { kind: "assign"; name: string; value: Expr }
  | { kind: "index"; object: Expr; index: Expr }
  | { kind: "indexAssign"; object: Expr; index: Expr; value: Expr }
  | { kind: "property"; object: Expr; name: string }
  | { kind: "propertyAssign"; object: Expr; name: string; value: Expr }
  | { kind: "array"; elements: Expr[] }
  | { kind: "object"; properties: { name: string; value: Expr }[] }
  | { kind: "call"; callee: Expr; args: Expr[]; typeArguments?: TypeRef[] };
export interface SourceLocation { line: number; column: number }
export type Stmt = (
  | { kind: "var"; name: string; annotation?: TypeRef; initializer: Expr; mutable: boolean }
  | { kind: "function"; name: string; typeParameters: TypeParameter[]; params: { name: string; type: TypeRef }[]; returnType: TypeRef; body: Stmt[]; native?: string }
  | { kind: "typeAlias"; name: string; typeParameters: TypeParameter[]; target: TypeRef }
  | { kind: "return"; value?: Expr }
  | { kind: "print"; expression: Expr }
  | { kind: "expression"; expression: Expr }
  | { kind: "block"; statements: Stmt[] }
  | { kind: "if"; condition: Expr; thenBranch: Stmt; elseBranch?: Stmt }
  | { kind: "while"; condition: Expr; body: Stmt }
  | { kind: "forIn"; name: string; iterable: Expr; body: Stmt }
  | { kind: "import"; source: string; specifiers: { imported: string; local: string }[]; namespace?: string }
) & { loc?: SourceLocation; exported?: boolean };
