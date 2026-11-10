const {
  LanguageClient,
  TransportKind,
} = require("vscode-languageclient/node");

let client;

function activate(context) {
  const serverModule = context.asAbsolutePath("../../dist/lsp.js");

  const serverOptions = {
    command: process.execPath,
    args: [serverModule],
    transport: TransportKind.stdio,
  };

  const clientOptions = {
    documentSelector: [{ scheme: "file", language: "wibufy" }],
    synchronize: {
      fileEvents: require("vscode").workspace.createFileSystemWatcher("**/*.wbf"),
    },
  };

  client = new LanguageClient(
    "wibufyLanguageServer",
    "Wibufy Language Server",
    serverOptions,
    clientOptions,
  );

  context.subscriptions.push(client);
  return client.start();
}

async function deactivate() {
  if (client) await client.stop();
}

module.exports = { activate, deactivate };
