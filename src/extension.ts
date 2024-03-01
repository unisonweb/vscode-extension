import { workspace, window, OutputChannel } from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { connect } from "node:net";

const outputChannel: OutputChannel = window.createOutputChannel("Unison");
let client: LanguageClient;
// This is global mutable state so that when the extension host gets restarted after
// the terminal is closed, we don't immediately open another one.
let shouldOpenTerminal = true;

function log(msg: string) {
  outputChannel.appendLine(msg);
}

exports.activate = function () {
  client = new LanguageClient("unison", "Unison", connectToServer, {
    outputChannel,
    documentSelector: [{ language: "unison" }],
  });

  log("Activating unison language server.");
  client.start();
};

exports.deactivate = async function () {
  if (!client) {
    return undefined;
  }
  return client.stop();
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectToServer() {
  let haveShownError = false;

  while (true) {
    try {
      const host = "127.0.0.1";
      const port = workspace.getConfiguration("unison").lspPort;

      log(`Trying to connect to ucm lsp server at ${host}:${port}`);
      let socket = connect({ port, host: "127.0.0.1" });
      await new Promise((resolve, reject) =>
        socket.once("connect", resolve).once("error", reject)
      );

      shouldOpenTerminal = false;
      // Show a success message, but only if we were in an error state
      const okMsg = `Unison: Connected to Language Server at ${host}:${port}.`;
      log(okMsg);
      if (haveShownError) {
        window.showInformationMessage(okMsg);
      }
      return { reader: socket, writer: socket };
    } catch (e) {
      const errMsg = "Language server failed to connect";
      log(`${errMsg}, cause: ${e}`);

      // Only ever try to open the terminal once, so we don't get stuck in weird loops
      // or in a strange state if the user tries to quit UCM or close the terminal.
      if (
        shouldOpenTerminal &&
        workspace.getConfiguration("unison").automaticallyOpenUCM
      ) {
        let ucmCommand = workspace.getConfiguration("unison").ucmCommand;
        shouldOpenTerminal = false;
        log("Opening ucm terminal");
        // Start up a new terminal in the IDE, tell it to run UCM, and then show it.
        const terminal = window.createTerminal();
        terminal.sendText(ucmCommand);
        terminal.show();
      } else if (!haveShownError) {
        haveShownError = true;
        window.showErrorMessage(
          `Unison: ${errMsg}, is there a UCM running? (version M4a or later)`
        );
      }
      await sleep(2000);
      continue;
    }
  }
}
