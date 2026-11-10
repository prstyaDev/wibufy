import { fileURLToPath } from "node:url";
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type Diagnostic,
  type InitializeParams,
  type InitializeResult,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { TypeChecker } from "./typechecker.js";
import { parseWibufyDiagnostic } from "./lsp-diagnostics.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
  },
  serverInfo: {
    name: "Wibufy Language Server",
    version: "0.7.0-dev.9",
  },
}));

function validateDocument(document: TextDocument): void {
  const source = document.getText();
  const diagnostics: Diagnostic[] = [];
  let sourceName = document.uri;

  if (document.uri.startsWith("file:")) {
    try {
      sourceName = fileURLToPath(document.uri);
    } catch {
      // Keep the URI as a readable fallback.
    }
  }

  try {
    const tokens = new Lexer(source, sourceName).scan();
    const program = new Parser(tokens, source, sourceName).parse();

    // TypeChecker expects imports to have been resolved and flattened by
    // ModuleLoader. Avoid false errors until LSP has workspace module analysis.
    const containsImports = program.some((statement) => statement.kind === "import");
    if (!containsImports) {
      new TypeChecker(sourceName, source).check(program);
    }
  } catch (error) {
    diagnostics.push(parseWibufyDiagnostic(error, source) as Diagnostic);
  }

  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics,
  });
}

documents.onDidOpen(({ document }) => validateDocument(document));
documents.onDidChangeContent(({ document }) => validateDocument(document));
documents.onDidClose(({ document }) => {
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();
