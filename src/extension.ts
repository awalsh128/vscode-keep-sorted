import * as vscode from "vscode";
import { KeepSortedDiagnostics, logger, ErrorTracker } from "./instrumentation";
import { KeepSorted } from "./keepSorted";
import { executeFixAction, FIX_COMMAND, KeepSortedActionProvider } from "./actions";
import { excluded, getConfig, onConfigurationChange } from "./configuration";
import { delayAndExecute } from "./shared";

const eventSubscriptions: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  logger.show();

  eventSubscriptions.push(vscode.workspace.onDidChangeConfiguration(onConfigurationChange));

  const errorTracker = new ErrorTracker();
  const linter = new KeepSorted(context.extensionPath, errorTracker);
  const diagnostics = new KeepSortedDiagnostics();
  context.subscriptions.push(diagnostics);

  // Register fix command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      FIX_COMMAND.command,
      async (document: vscode.TextDocument, range: vscode.Range) => {
        await executeFixAction({
          linter,
          diagnostics,
          document,
          range,
        });
      }
    )
  );

  // Register code action provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      "*",
      new KeepSortedActionProvider(linter, diagnostics),
      {
        providedCodeActionKinds: KeepSortedActionProvider.actionKinds,
      }
    )
  );

  // Conditionally lint and update diagnostics for a document if not excluded by the configuration
  async function maybeLintAndUpdateDiagnostics(document: vscode.TextDocument) {
    if (excluded(document.uri)) {
      logger.info(`Document is excluded from processing: ${document.uri.fsPath}`);
      return;
    }
    const results = await linter.lintDocument(document);
    if (results) {
      diagnostics.set(document, results);
    }
  }

  // Document event listeners
  eventSubscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (getConfig().enabled) {
        logger.debug(`Document saved: ${document.uri.fsPath}`);
        delayAndExecute(
          "linting on save",
          async () => await maybeLintAndUpdateDiagnostics(document)
        );
      }
    })
  );
  eventSubscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (getConfig().enabled) {
        logger.debug(`Document changed: ${event.document.uri.fsPath}`);
        delayAndExecute("linting", async () => await maybeLintAndUpdateDiagnostics(event.document));
      }
    })
  );
  logger.info(
    `Found ${vscode.workspace.textDocuments.length} open documents for possible linting on activation`
  );
  vscode.workspace.textDocuments.forEach(async (document) => {
    if (getConfig().enabled) {
      await maybeLintAndUpdateDiagnostics(document);
    }
  });
}
