import * as vscode from "vscode";
import * as workspace from "./workspace";
import { FixFileCommandHandler, FixWorkspaceCommandHandler } from "./commands";
import { logger, EXT_NAME, contextualizeLogger, setFileLogging } from "./instrumentation";
import { KeepSorted } from "./keepsorted";
import { ActionProvider } from "./actions";
import {
  getConfig,
  handleConfigurationChange,
  onEnabledChange,
  onLogFilepathChange,
} from "./configuration";

const EXECUTE_DELAY_MS = 3000;

export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  logger.info(`Activating extension ${EXT_NAME}...`);

  const linter = new KeepSorted(context.extensionPath);
  const diagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);
  context.subscriptions.push(diagnostics);
  const editFactory = new workspace.EditFactory(linter, diagnostics);
  const actionProvider = new ActionProvider(editFactory);

  const extSubsHandler = new workspace.ExtensionSubscriptionsHandler(context.subscriptions);

  const maybeExecute = async (fn: () => void) => {
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

  const maybeLint = async (document: vscode.TextDocument) => {
    if (workspace.isInScope(document.uri)) {
      contextualizeLogger(document).debug(`Document updated.`);
      await maybeExecute(async () => await lint(document));
    }
  };

  async function lint(document: vscode.TextDocument): Promise<void> {
    try {
      const results = await linter.lintDocument(document);
      if (results) {
        diagnostics.set(document.uri, results);
      }
    } catch (err: Error | unknown) {
      const errorMessage = err instanceof Error ? err.message : workspace.toJson(err);
      contextualizeLogger(document).error(`Linting failed with:\n${errorMessage}`);
    }
  }

  // Register code action provider
  extSubsHandler.addRegister(async () => {
    const selector: vscode.DocumentSelector = workspace.IN_SCOPE_SCHEMAS.map((s: string) => ({
      scheme: s,
    }));
    return vscode.languages.registerCodeActionsProvider(selector, actionProvider, {
      providedCodeActionKinds: ActionProvider.kinds,
    });
  });
  [FixFileCommandHandler, FixWorkspaceCommandHandler].forEach((handler) => {
    extSubsHandler.addRegister(async () => {
      const commandHandler = new handler(diagnostics, editFactory);
      return vscode.commands.registerCommand(
        commandHandler.command.command,
        commandHandler.handle.bind(commandHandler)
      );
    });
  });

  // Document listeners
  [
    vscode.workspace.onDidOpenTextDocument(maybeLint),
    vscode.workspace.onDidSaveTextDocument(maybeLint),
    vscode.workspace.onDidChangeTextDocument((e) => maybeLint(e.document)),
  ].forEach((disposable) => {
    extSubsHandler.addRegister(async () => disposable);
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
        extSubsHandler.registerExtensionSubscriptions();
      } else {
        logger.debug(`Extension disabled - disposing event subscriptions.`);
        extSubsHandler.unregisterExtensionSubscriptions();
      }
    })
  );
  context.subscriptions.push(onLogFilepathChange(setFileLogging));
  setFileLogging(getConfig().logFilepath);

  extSubsHandler.registerExtensionSubscriptions();

  // Initial linting of all documents upon activation
  workspace.inScopeUris().then(async (uris) => {
    logger.info(`Found ${uris.length} workspace documents for possible linting on activation`);
    await Promise.all(
      uris.map(async (uri) => {
        const document = await vscode.workspace.openTextDocument(uri);
        if (document) {
          lint(document);
        }
      })
    );
  });

  logger.info(`Extension ${EXT_NAME} activated.`);
}
