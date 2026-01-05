import * as vscode from "vscode";
import * as workspace from "./workspace";
import {
  SortBlockCommandHandler,
  SortFileCommandHandler,
  ShowDocsCommandHandler,
} from "./commands";
import { logger, EXT_NAME, contextualizeLogger, setFileLogging } from "./instrumentation";
import { KeepSorted } from "./keepsorted";
import { ActionProvider } from "./actions";
import { KeepSortedCompletionProvider } from "./completion";
import {
  getConfig,
  handleConfigurationChange,
  onAutoCompleteChange,
  onEnabledChange,
  onLogFilepathChange,
} from "./configuration";

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel
  logger.info(`Activating extension ${EXT_NAME}...`);

  const linter = new KeepSorted(context.extensionPath);
  const diagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);
  context.subscriptions.push(diagnostics);
  const editFactory = new workspace.EditFactory(linter, diagnostics);
  const editCommandHandlers = {
    sortBlock: new SortBlockCommandHandler(diagnostics, editFactory),
    sortFile: new SortFileCommandHandler(diagnostics, editFactory),
  };
  const showDocsCommandHandler = new ShowDocsCommandHandler();
  const actionProvider = new ActionProvider(diagnostics, editCommandHandlers);
  const completionProvider = new KeepSortedCompletionProvider();

  const extSubsHandler = new workspace.ExtensionSubscriptionsHandler(context.subscriptions);

  function maybeLint(document: vscode.TextDocument): void {
    if (workspace.isInScope(document.uri)) {
      contextualizeLogger(document.uri).debug(`Document updated.`);
      lint(document);
    }
  }

  function lint(document: vscode.TextDocument): void {
    try {
      const results = linter.lintDocument(document);
      if (results) {
        diagnostics.set(document.uri, results);
      }
    } catch (err: Error | unknown) {
      const errorMessage = err instanceof Error ? err.message : workspace.toJson(err);
      contextualizeLogger(document.uri).error(`Linting failed with:\n${errorMessage}`);
    }
  }

  // Register code action provider
  extSubsHandler.addRegistrant(actionProvider);

  // Register completion provider for keep-sorted options autocomplete
  extSubsHandler.addRegistrant(completionProvider);

  // Register command handlers
  Object.values(editCommandHandlers).forEach((handler) => {
    extSubsHandler.addRegistrant(handler);
  });
  context.subscriptions.push(await showDocsCommandHandler.register());

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
      register: async () => vscode.workspace.onDidChangeTextDocument((e) => maybeLint(e.document)),
    },
  ].forEach((event) => {
    extSubsHandler.addRegistrant(event);
  });

  // Configuration change, handle enabling/disabling extension and logging filepath changes
  // Not added to handler because it controls the handler behavior itself; should always be active
  // and listening
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(handleConfigurationChange));
  context.subscriptions.push(
    onEnabledChange((enabled: boolean) => {
      logger.info(`Extension enabled state is now: ${enabled}`);
      if (enabled) {
        logger.debug(`Extension enabled - registering event subscriptions.`);
        extSubsHandler.registerAllEnabled();
      } else {
        logger.debug(`Extension disabled - disposing event subscriptions.`);
        extSubsHandler.unregisterAll();
      }
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

  extSubsHandler.registerAllEnabled();

  // Initial linting of all documents upon activation
  const documents = await workspace.inScopeDocuments();
  logger.info(`Found ${documents.length} workspace documents for possible linting on activation`);
  // Don't block activation on linting
  await Promise.all(documents.map(lint));

  logger.info(`Extension ${EXT_NAME} activated.`);
}
