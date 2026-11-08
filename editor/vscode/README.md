# Wibufy Language Support for VS Code

Development extension for Wibufy `.wbf` source files.

Features:
- Wibufy language identifier and custom file icon
- Syntax highlighting
- Bracket and quote matching
- Automatic indentation
- Starter snippets
- Language Server Protocol integration
- Real-time lexer, parser, and type diagnostics

## Run locally

1. Open the `editor/vscode` folder in VS Code.
2. From the repository root, run `npm install` and `npm run build`.
3. Press F5 to launch the Extension Development Host.
4. Open a `.wbf` file and introduce a syntax or type error to test diagnostics.

The language server currently skips type checking for documents containing imports. Lexer and parser diagnostics remain enabled for those documents. Multi-file workspace analysis, completion, hover, and code actions are not part of this development milestone.
