import * as vscode from "vscode";
import { logger, ErrorTracker, getLogPrefix, EXT_NAME } from "./instrumentation";
import { KeepSorted } from "./keepSorted";
import { executeFixAction, FIX_COMMAND, KeepSortedActionProvider } from "./actions";
import { excluded, getConfig, onConfigurationChange } from "./configuration";

const eventSubscriptions: vscode.Disposable[] = [];
const EXECUTE_DELAY_MS = 3000;

export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  logger.show();

  eventSubscriptions.push(vscode.workspace.onDidChangeConfiguration(onConfigurationChange));

  const errorTracker = new ErrorTracker();
  const linter = new KeepSorted(context.extensionPath, errorTracker);
  const diagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);
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

  const maybeExecute = (fn: () => void) => {
    let timeoutId: NodeJS.Timeout | null = null;
    return () => {
      if (!timeoutId) {
        fn();
        timeoutId = setTimeout(() => {
          timeoutId = null;
        }, EXECUTE_DELAY_MS);
      }
    };
  };

  // Conditionally lint and update diagnostics for a document if not excluded by the configuration
  // and behaves, respecting the throttle
  async function maybeLintAndUpdateDiagnostics(document: vscode.TextDocument): Promise<void> {
    const regexp = excluded(document.uri);
    if (regexp) {
      logger.info(`${getLogPrefix(document)} Document is excluded with regex ${regexp.source}.`);
      return;
    }
    const results = await linter.lintDocument(document);
    if (results) {
      diagnostics.set(document.uri, results);
    }
  }

  // Only accept file scheme documents and when the extension is enabled
  function shouldProcessDocument(document: vscode.TextDocument) {
    return getConfig().enabled && document.uri.scheme === "file";
  }

  // Document event listeners
  eventSubscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
      if (shouldProcessDocument(document)) {
        logger.debug(`${getLogPrefix(document)} Document saved.`);
        await maybeLintAndUpdateDiagnostics(document);
      }
    })
  );
  eventSubscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
      if (!shouldProcessDocument(event.document)) {
        return;
      }
      event.contentChanges.forEach((change) => {
        logger.debug(`${getLogPrefix(event.document, change.range)} Document change detected.`);
      });
      maybeExecute(() => maybeLintAndUpdateDiagnostics(event.document));
    })
  );

  // Initial linting of all open documents upon activation
  logger.info(
    `Found ${vscode.workspace.textDocuments.length} open documents for possible linting on activation`
  );
  vscode.workspace.textDocuments.forEach(async (document) => {
    if (shouldProcessDocument(document)) {
      await maybeLintAndUpdateDiagnostics(document);
    }
  });
}
