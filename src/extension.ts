import * as vscode from "vscode";
import {
  KeepSortedDiagnostics,
  createLogger,
  ErrorTracker,
  ExtensionDisabledInfo,
  createGithubIssueAsUrl,
} from "./instrumentation";
import { KeepSorted } from "./keep_sorted";
import { displayName } from "./shared";
import { FixCommandHandler, KeepSortedActionProvider } from "./actions";

const debounceDelayMs = 1000;

export function activate(context: vscode.ExtensionContext) {
  const logger = createLogger(displayName);
  logger.show();

  const errorTracker = new ErrorTracker(logger);
  const linter = new KeepSorted(context.extensionPath, logger, errorTracker);

  let changeTimer: NodeJS.Timeout | undefined;

  // Store disposables that need to be cleaned up when extension is disabled
  const eventSubscriptions: vscode.Disposable[] = [];

  // Listen for the extension being disabled due to errors
  const extensionDisabledListener = errorTracker.onExtensionDisabled(
    async (info: ExtensionDisabledInfo) => {
      await handleExtensionDisabled(logger, info, eventSubscriptions, changeTimer);
    }
  );

  context.subscriptions.push(errorTracker, extensionDisabledListener);

  /**
   * Checks if a document should be linted.
   * Filters out git files, output channels, and other non-file documents.
   */
  function shouldLintDocument(document: vscode.TextDocument): boolean {
    // Skip untitled documents
    if (document.uri.scheme !== "file") {
      return false;
    }

    // Skip git-related files
    if (document.uri.fsPath.includes("/.git/")) {
      return false;
    }

    // Skip files with .git extension
    if (document.uri.fsPath.endsWith(".git")) {
      return false;
    }

    return true;
  }

  /**
   * Lints a document and updates diagnostics if results are found.
   */
  async function maybeLintAndUpdateDiagnostics(document: vscode.TextDocument): Promise<void> {
    if (!shouldLintDocument(document)) {
      logger.debug(`Skipping lint for document: ${document.uri.fsPath}`);
      return;
    }

    const lintResults = await linter.lintDocument(document);
    if (lintResults) {
      diagnostics.set(document, lintResults);
    }
  }

  logger.info(`Setting up KeepSortedDiagnostics...`);
  const diagnostics = new KeepSortedDiagnostics(logger);
  context.subscriptions.push(diagnostics);

  const fixCommandHandler = new FixCommandHandler(linter, logger, diagnostics);
  logger.info(`Registering fix command ${FixCommandHandler.command.title}...`);
  context.subscriptions.push(
    vscode.commands.registerCommand(FixCommandHandler.command.command, async () => {
      await fixCommandHandler.execute(vscode.window.activeTextEditor);
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      "*",
      new KeepSortedActionProvider(diagnostics, logger),
      {
        providedCodeActionKinds: KeepSortedActionProvider.actionKinds,
      }
    )
  );

  const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
    logger.debug(`Document saved: ${document.uri.fsPath}`);
    await maybeLintAndUpdateDiagnostics(document);
  });
  eventSubscriptions.push(saveListener);

  const changeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
    logger.debug(`Document changed to: ${event.document.uri.fsPath}`);
    logger.debug(`Scheduling linting execution in ${debounceDelayMs}ms`);
    clearTimeout(changeTimer);
    changeTimer = setTimeout(async () => {
      await maybeLintAndUpdateDiagnostics(event.document);
    }, debounceDelayMs);
  });
  eventSubscriptions.push(changeListener);

  const closeListener = vscode.workspace.onDidCloseTextDocument((document) => {
    logger.debug(`Document closed: ${document.uri.fsPath}`);
    diagnostics.clear(document);
  });
  eventSubscriptions.push(closeListener);

  // Lint open documents on activation
  logger.info(
    `Found ${vscode.workspace.textDocuments.length} open documents for possible linting on activation`
  );
  vscode.workspace.textDocuments.forEach(async (document) => {
    await maybeLintAndUpdateDiagnostics(document);
  });
}

async function handleExtensionDisabled(
  logger: vscode.LogOutputChannel,
  info: ExtensionDisabledInfo,
  eventSubscriptions: vscode.Disposable[],
  changeTimer: NodeJS.Timeout | undefined
) {
  logger.warn(
    "Extension disabled event received due to maximum errors reached. Disposing all event subscriptions."
  );
  logger.error(`Encountered ${info.errors.length} errors before disabling.`);

  // Show user notification with options
  const reportIssueLabel = "Report Issue";
  const copyLogsLabel = "Copy Logs";
  const viewLogsLabel = "View Logs";
  const result = await vscode.window.showErrorMessage(
    `Keep-sorted extension has encountered ${info.errors.length} consecutive errors and has been disabled. Please report this issue.`,
    reportIssueLabel,
    copyLogsLabel,
    viewLogsLabel
  );

  switch (result) {
    case reportIssueLabel: {
      const issueUrl = await createGithubIssueAsUrl(info);

      // Copy full logs to clipboard as backup
      await vscode.env.clipboard.writeText(info.logSummary);
      vscode.window.showInformationMessage(
        "Error logs copied to clipboard. Opening issue template..."
      );
      vscode.env.openExternal(vscode.Uri.parse(issueUrl));
      break;
    }
    case copyLogsLabel: {
      await vscode.env.clipboard.writeText(info.logSummary);
      vscode.window.showInformationMessage("Error logs copied to clipboard.");
      break;
    }
    case viewLogsLabel: {
      logger.show();
      break;
    }
  }

  const subscriptionCount = eventSubscriptions.length;
  logger.info(`Disposing ${subscriptionCount} event subscriptions...`);

  // Dispose all event listeners
  eventSubscriptions.forEach((subscription) => subscription.dispose());
  eventSubscriptions.length = 0;

  // Clear timer if running
  clearTimeout(changeTimer);

  logger.info(`All ${subscriptionCount} event subscriptions have been disposed.`);
}
