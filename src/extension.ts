// keep-sorted start
import * as vscode from "vscode";
import * as workspace from "./workspace";
import { ActionProvider } from "./actions";
import { KeepSorted } from "./keepsorted";
import { KeepSortedCompletionProvider } from "./completion";
import { KeepSortedHoverProvider } from "./hover";
import { LintScheduler } from "./scheduler";
import { SortFileCommandHandler, SortWorkspaceCommandHandler } from "./commands";
import { logger, EXT_NAME, contextualizeLogger, setFileLogging } from "./instrumentation";
import {
  getConfig,
  handleConfigurationChange,
  onAutoCompleteChange,
  onEnabledChange,
  onExcludeChange,
  onLogFilepathChange,
} from "./configuration";
// keep-sorted end

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel
  logger.info(`Activating extension ${EXT_NAME}...`);

  const linter = new KeepSorted(context.extensionPath);
  const diagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);
  context.subscriptions.push(diagnostics);
  const editFactory = new workspace.EditFactory(linter, diagnostics);
  const editCommandHandlers = {
    sortFile: new SortFileCommandHandler(diagnostics, editFactory),
    sortWorkspace: new SortWorkspaceCommandHandler(diagnostics, editFactory),
  };
  const lintScheduler = new LintScheduler(lint);
  context.subscriptions.push(lintScheduler);
  const actionProvider = new ActionProvider(diagnostics, editCommandHandlers, (document) =>
    lintScheduler.flush(document)
  );
  const completionProvider = new KeepSortedCompletionProvider();
  const hoverProvider = new KeepSortedHoverProvider();

  const extSubsHandler = new workspace.ExtensionSubscriptionsHandler(context.subscriptions);

  function maybeLint(document: vscode.TextDocument): void {
    if (workspace.isInScope(document.uri)) {
      contextualizeLogger(document.uri).debug(`Document updated.`);
      lintScheduler.now(document);
    }
  }

  function maybeLintAfterEdits(event: vscode.TextDocumentChangeEvent): void {
    // Events without content changes only report dirty-state or language changes.
    if (event.contentChanges.length > 0 && workspace.isInScope(event.document.uri)) {
      lintScheduler.schedule(event.document);
    }
  }

  function lint(document: vscode.TextDocument): void {
    try {
      editFactory.refreshDiagnostics(document);
    } catch (err: Error | unknown) {
      const errorMessage = err instanceof Error ? err.message : workspace.toJson(err);
      contextualizeLogger(document.uri).error(`Linting failed with:\n${errorMessage}`);
    }
  }

  // Register code action provider
  extSubsHandler.addRegistrant(actionProvider);

  // Register completion provider for keep-sorted options autocomplete
  extSubsHandler.addRegistrant(completionProvider, getConfig().autoComplete);

  // Register hover provider for keep-sorted option documentation
  extSubsHandler.addRegistrant(hoverProvider);

  // Register command handlers
  Object.values(editCommandHandlers).forEach((handler) => {
    extSubsHandler.addRegistrant(handler);
  });

  // Document listeners
  [
    {
      id: vscode.workspace.onDidOpenTextDocument.name,
      register: async () => vscode.workspace.onDidOpenTextDocument(maybeLint),
    },
    {
      id: vscode.workspace.onDidSaveTextDocument.name,
      register: async () => vscode.workspace.onDidSaveTextDocument(maybeLint),
    },
    {
      id: vscode.workspace.onDidChangeTextDocument.name,
      register: async () => vscode.workspace.onDidChangeTextDocument(maybeLintAfterEdits),
    },
  ].forEach((event) => {
    extSubsHandler.addRegistrant(event);
  });

  // Configuration change, handle enabling/disabling extension and logging filepath changes
  // Not added to handler because it controls the handler behavior itself; should always be active
  // and listening
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(handleConfigurationChange));
  context.subscriptions.push(
    onEnabledChange(async (enabled: boolean) => {
      logger.info(`Extension enabled state is now: ${enabled}`);
      if (enabled) {
        logger.debug(`Extension enabled - registering event subscriptions.`);
        await extSubsHandler.registerAllEnabled();
        // Open documents were not linted while disabled
        vscode.workspace.textDocuments.forEach(maybeLint);
      } else {
        logger.debug(`Extension disabled - disposing event subscriptions.`);
        extSubsHandler.unregisterAll();
        lintScheduler.dispose();
        diagnostics.clear();
      }
    })
  );
  context.subscriptions.push(
    onExcludeChange(async (exclude: string[]) => {
      logger.info(`Exclusion patterns are now: ${workspace.toJson(exclude)}`);
      if (!getConfig().enabled) {
        return;
      }
      // Drop diagnostics and pending lints for files that are now excluded
      diagnostics.forEach((uri) => {
        if (!workspace.isInScope(uri)) {
          diagnostics.delete(uri);
        }
      });
      vscode.workspace.textDocuments
        .filter((document) => !workspace.isInScope(document.uri))
        .forEach((document) => lintScheduler.cancel(document));
      // Lint files that are no longer excluded, as on activation
      const documents = await workspace.inScopeDocuments();
      documents.forEach(lint);
    })
  );

  context.subscriptions.push(onLogFilepathChange(setFileLogging));
  setFileLogging(getConfig().logFilepath);

  context.subscriptions.push(
    onAutoCompleteChange((enabled: boolean) => {
      logger.info(`Autocomplete enabled state is now: ${enabled}`);
      extSubsHandler.setEnabled(completionProvider.id, enabled);
    })
  );

  if (!getConfig().enabled) {
    logger.info(`Extension ${EXT_NAME} activated in disabled state.`);
    return;
  }
  await extSubsHandler.registerAllEnabled();

  // Initial linting of all documents upon activation
  const documents = await workspace.inScopeDocuments();
  logger.info(`Found ${documents.length} workspace documents for possible linting on activation`);
  // Don't block activation on linting
  const lintResults = await Promise.allSettled(documents.map(lint));
  const lintFailures = lintResults.filter((r) => r.status === "rejected");
  if (lintFailures.length > 0) {
    logger.warn(`${lintFailures.length} document(s) failed linting on activation`);
  }

  logger.info(`Extension ${EXT_NAME} activated.`);
}
