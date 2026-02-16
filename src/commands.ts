import * as vscode from "vscode";
import * as workspace from "./workspace";
import { EXT_DISPLAY_NAME, EXT_NAME, logAndGetError, logger } from "./instrumentation";
import { error } from "console";

/**
 * Abstract base class for all command handlers in Keep Sorted. Encapsulates the registration and
 * execution logic for VS Code commands, providing a consistent interface for extension features
 * that can be invoked by the user or programmatically. Subclasses should implement the `handle`
 * method to define command-specific behavior.
 */
export abstract class CommandHandler implements workspace.Registrant {
  readonly command: vscode.Command;
  readonly id: string;

  protected constructor(command: vscode.Command) {
    this.command = command;
    this.id = command.command;
  }

  /**
   * Executes the command logic. Subclasses must implement this to provide the actual command
   * behavior.
   *
   * @param args Arguments passed from VS Code or other extension code.
   */
  abstract handle(...args: unknown[]): Promise<void>;

  /**
   * Registers this command handler with VS Code, enabling it to be invoked by command palette,
   * keybindings, or programmatically. Returns a disposable for proper cleanup.
   */
  async register(): Promise<vscode.Disposable> {
    return vscode.commands.registerCommand(this.command.command, async (...args: unknown[]) => {
      logger.info(
        `Executing command: ${this.command.command} with args: ${workspace.toJson(args)}`
      );
      try {
        await this.handle(...args);
      } catch (err: Error | unknown) {
        logger.error(err);
        vscode.window.showErrorMessage(
          `${this.command.title}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }
}

/**
 * Groups all command handler instances used by the extension's code actions and UI. Provides a
 * strongly-typed contract for accessing the available fix operations.
 *
 * - `fixBlock`: Handles sorting a single keep-sorted block within a selection or range.
 * - `fixFile`: Handles sorting all keep-sorted blocks in the current file.
 * - `fixWorkspace`: Handles sorting all keep-sorted blocks across all in-scope workspace files.
 */
export interface CommandHandlers {
  /** Handler for sorting a single keep-sorted block in a selection or range. */
  readonly sortBlock: SortBlockCommandHandler;
  /** Handler for sorting all keep-sorted blocks in the current file. */
  readonly sortFile: SortFileCommandHandler;
}

/**
 * Command handler for opening the Keep Sorted extension documentation in a browser. Provides users
 * with quick access to usage instructions, configuration, and troubleshooting resources.
 */
export class ShowDocsCommandHandler extends CommandHandler {
  constructor() {
    super({
      title: `${EXT_DISPLAY_NAME}: Show Documentation`,
      command: `${EXT_NAME}.showDocumentation`,
      tooltip: "Open the Keep Sorted extension documentation in a browser",
    });
  }

  /**
   * Opens the extension documentation URL in the user's default browser using VS Code's open
   * command. Handles errors gracefully and logs them for diagnostics.
   */
  async handle(): Promise<void> {
    try {
      const uri = vscode.Uri.parse("https://github.com/awalsh128/vscode-keep-sorted#readme");
      await vscode.commands.executeCommand("vscode.open", uri);
    } catch (err: Error | unknown) {
      logAndGetError(logger, err);
    }
  }
}

/**
 * Abstract base class for command handlers that perform document edits (fixes). Integrates with the
 * extension's diagnostic and edit infrastructure to provide code actions and quick fixes.
 * Subclasses must implement `createEdit` to generate the appropriate edits for their scope.
 */
export abstract class EditCommandHandler extends CommandHandler {
  protected readonly diagnostics: vscode.DiagnosticCollection;
  protected readonly editFactory: workspace.EditFactory;

  constructor(
    command: vscode.Command,
    diagnostics: vscode.DiagnosticCollection,
    editFactory: workspace.EditFactory
  ) {
    super(command);
    this.editFactory = editFactory;
    this.diagnostics = diagnostics;
  }

  protected abstract createEdit(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<workspace.CreateEditResult | null>;

  /**
   * Creates a VS Code CodeAction for this handler, optionally attaching an edit if one is
   * available. Used by the code action provider to surface quick fixes and source actions in the
   * UI.
   *
   * @param diagnostics Diagnostics relevant to the action.
   * @param document The document to operate on.
   * @param range The range to operate on (if applicable).
   * @param isPreferred Whether this action should be marked as preferred in the UI.
   *
   * @returns A CodeAction with edit or command attached.
   */
  asCodeAction(
    diagnostics: vscode.Diagnostic[],
    document: vscode.TextDocument,
    range?: vscode.Range,
    isPreferred = false
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `${this.command.tooltip} (${EXT_NAME})`,
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = diagnostics;
    action.isPreferred = isPreferred;
    action.command = this.command;
    action.command.arguments = range ? [document, range] : [document];
    return action;
  }

  /**
   * Executes the edit command: generates edits, applies them, and clears fixed diagnostics. Handles
   * errors and logs edit operations for diagnostics and debugging.
   *
   * @param document The document to fix.
   * @param range The range to fix (if applicable).
   */
  async handle(document: vscode.TextDocument, range?: vscode.Range): Promise<void> {
    try {
      const editResult = await this.createEdit(document, range);
      if (editResult) {
        logger.debug(
          () =>
            `${this.command.command} create results:\n` +
            workspace.toJson({
              path: editResult.documentUri.path,
              edit: editResult.edit,
              diagnostics: editResult.diagnostics,
            })
        );
        this.diagnostics.delete(editResult.documentUri);
        await vscode.workspace.applyEdit(editResult.edit);
      }
    } catch (err: Error | unknown) {
      throw logAndGetError(logger, err);
    }
  }
}

/**
 * Command handler for sorting a single keep-sorted block within a selection or range. Used for
 * quick fixes and context menu actions targeting a specific block.
 */
export class SortBlockCommandHandler extends EditCommandHandler {
  constructor(diagnostics: vscode.DiagnosticCollection, editFactory: workspace.EditFactory) {
    super(
      {
        title: `${EXT_DISPLAY_NAME}: Sort Block`,
        command: `${EXT_NAME}.sortBlock`,
        tooltip: `Sort all lines in block`,
      },
      diagnostics,
      editFactory
    );
  }

  /**
   * Generates an edit for sorting a single keep-sorted block in the given range. Returns a single
   * CreateEditResult if a fix is available, otherwise an empty array.
   */
  protected async createEdit(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<workspace.CreateEditResult | null> {
    return this.editFactory.create(document, range);
  }
}

/**
 * Command handler for sorting all keep-sorted blocks in the current file. Used for source actions
 * and context menu actions at the file level.
 */
export class SortFileCommandHandler extends EditCommandHandler {
  constructor(diagnostics: vscode.DiagnosticCollection, editFactory: workspace.EditFactory) {
    super(
      {
        title: `${EXT_DISPLAY_NAME}: Sort Current File`,
        command: `${EXT_NAME}.sortFile`,
        tooltip: `Sort all lines in file`,
      },
      diagnostics,
      editFactory
    );
  }

  /**
   * Generates an edit for sorting all keep-sorted blocks in the given file. Returns a single
   * CreateEditResult if a fix is available, otherwise an empty array.
   */
  protected async createEdit(
    document: vscode.TextDocument
  ): Promise<workspace.CreateEditResult | null> {
    if (document && workspace.isInScope(document.uri)) {
      return this.editFactory.create(document);
    }
    logger.info(
      `Document ${document?.uri.toString()} is out of scope, falling back to active/visible editor`
    );

    const activeTextEditor = vscode.window.activeTextEditor;
    if (activeTextEditor && workspace.isInScope(activeTextEditor.document.uri)) {
      logger.info(
        `Found active editor with in-scope document: ${activeTextEditor.document.uri.toString()}`
      );
      return this.editFactory.create(activeTextEditor.document);
    }
    logger.info(
      "No active text editor found, falling back to visible text editors " +
        "and selecting first in-scope document"
    );
    for (const editor of vscode.window.visibleTextEditors) {
      if (workspace.isInScope(editor.document.uri)) {
        logger.info(
          `Found visible editor with in-scope document: ${editor.document.uri.toString()}`
        );
        return this.editFactory.create(editor.document);
      }
    }
    throw new Error("No in scope document displayed or active text editor found to sort");
  }
}
