import type { Stmt } from "./ast.js";
import { JavaScriptCodeGenerator } from "./codegen.js";

export interface CompileResult {
  code: string;
  target: "javascript";
}

/** Wibufy's JavaScript backend. Input must be the module-loader's resolved AST. */
export class Compiler {
  compile(program: Stmt[]): CompileResult {
    return { code: new JavaScriptCodeGenerator().generate(program), target: "javascript" };
  }
}
