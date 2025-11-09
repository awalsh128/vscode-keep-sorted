import * as vscode from "vscode";
import * as workspace from "./workspace";
import { FixFileCommandHandler, FixWorkspaceCommandHandler } from "./commands";
import { logger, EXT_NAME, contextualizeLogger } from "./instrumentation";
import { KeepSorted } from "./keepsorted";
import { ActionProvider } from "./actions";
import { handleConfigurationChange, onEnabledChange } from "./configuration";

const EXECUTE_DELAY_MS = 3000;

export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  logger.show();
  logger.info(`Activating extension ${EXT_NAME}...`);

  const linter = new KeepSorted(context.extensionPath);
  const diagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);
  context.subscriptions.push(diagnostics);
  const editFactory = new workspace.EditFactory(linter, diagnostics);
  const actionProvider = new ActionProvider(editFactory);

  const extSubsHandler = new workspace.ExtensionSubscriptionsHandler(context.subscriptions);

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

  async function lint(document: vscode.TextDocument): Promise<void> {
    try {
      const results = await linter.lintDocument(document);
      if (results) {
        diagnostics.set(document.uri, results);
      }
    } catch (err: Error | unknown) {
      const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
      contextualizeLogger(document).error(`Linting failed with:\n${errorMessage}`);
    }
  }

  // Register code action provider
  extSubsHandler.addRegister(async () => {
    // Register for file-system documents and unsaved (untitled) buffers so the provider is
    // invoked in both saved and unsaved editors. This helps ensure the lightbulb appears
    // whether the user is working in an on-disk file or an untitled buffer.
    const selector: vscode.DocumentSelector = [{ scheme: "file" }, { scheme: "untitled" }];
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
  extSubsHandler.addRegister(async () => {
    return vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
      if (workspace.isInScope(document.uri)) {
        contextualizeLogger(document).debug(`Document saved.`);
        await lint(document);
      }
    });
  });
  extSubsHandler.addRegister(async () => {
    return vscode.workspace.onDidChangeTextDocument(
      async (event: vscode.TextDocumentChangeEvent) => {
        if (!workspace.isInScope(event.document.uri)) {
          return;
        }
        event.contentChanges.forEach((change) => {
          contextualizeLogger(event.document, change.range).debug(`Document change detected.`);
        });
        maybeExecute(() => lint(event.document));
      }
    );
  });

  // Configuration change, handle enabling/disabling extension
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

  extSubsHandler.registerExtensionSubscriptions();

  // Initial linting of all documents upon activation
  workspace.inScopeUris().then((uris) => {
    logger.info(`Found ${uris.length} workspace documents for possible linting on activation`);
    uris.forEach((uri) => {
      vscode.workspace.openTextDocument(uri).then((document) => {
        if (document) {
          lint(document);
        }
      });
    });
  });

  logger.info(`Extension ${EXT_NAME} activated.`);
}
