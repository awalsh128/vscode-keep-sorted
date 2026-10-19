import * as vscode from "vscode";
import * as workspace from "./workspace";
import {
  EXT_DISPLAY_NAME,
  EXT_NAME,
  contextualizeLogger,
  logAndGetError,
  logger,
} from "./instrumentation";

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
 * - `sortFile`: Handles sorting all keep-sorted blocks in the current file.
 * - `sortWorkspace`: Handles sorting every file that has keep-sorted diagnostics.
 */
export interface CommandHandlers {
  /** Handler for sorting all keep-sorted blocks in the current file. */
  readonly sortFile: SortFileCommandHandler;
  /** Handler for sorting every file that has keep-sorted diagnostics. */
  readonly sortWorkspace: SortWorkspaceCommandHandler;
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
    document: vscode.TextDocument
  ): Promise<workspace.CreateEditResult | null>;

  /**
   * Creates a VS Code CodeAction for this handler, optionally attaching an edit if one is
   * available. Used by the code action provider to surface quick fixes and source actions in the
   * UI.
   *
   * @param diagnostics Diagnostics relevant to the action.
   * @param document The document to operate on.
   * @param isPreferred Whether this action should be marked as preferred in the UI.
   *
   * @returns A CodeAction with edit or command attached.
   */
  asCodeAction(
    diagnostics: vscode.Diagnostic[],
    document: vscode.TextDocument,
    isPreferred = false,
    kind = vscode.CodeActionKind.QuickFix
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(`${this.command.tooltip} (${EXT_NAME})`, kind);
    action.diagnostics = diagnostics;
    action.isPreferred = isPreferred;
    action.command = { ...this.command, arguments: [document] };
    return action;
  }

  /**
   * Generates and applies edits, then refreshes file diagnostics. Handles errors and logs edit
   * operations for diagnostics and debugging.
   *
   * @param document The document to fix.
   */
  async handle(document: vscode.TextDocument): Promise<void> {
    try {
      const editResult = await this.createEdit(document);
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
        const applied = await vscode.workspace.applyEdit(editResult.edit);
        if (!applied) {
          throw new Error("Could not apply sorting edits; file diagnostics were retained.");
        }
        const updatedDocument = await vscode.workspace.openTextDocument(editResult.documentUri);
        this.editFactory.refreshDiagnostics(updatedDocument);
      }
    } catch (err: Error | unknown) {
      throw logAndGetError(logger, err);
    }
  }
}

/**
 * Command handler for sorting all keep-sorted blocks in the current file. Used for source actions
 * and context menu actions at the file level.
 */
export class SortFileCommandHandler extends EditCommandHandler {
  constructor(
    diagnostics: vscode.DiagnosticCollection,
    editFactory: workspace.EditFactory,
    command: vscode.Command = {
      title: `${EXT_DISPLAY_NAME}: Sort Current File`,
      command: `${EXT_NAME}.fixFile`,
      tooltip: `Sort all lines in file`,
    }
  ) {
    super(command, diagnostics, editFactory);
  }

  /**
   * Generates an edit for sorting all keep-sorted blocks in the given file. Returns a single
   * CreateEditResult if a fix is available, otherwise an empty array.
   */
  protected async createEdit(
    document: vscode.TextDocument
  ): Promise<workspace.CreateEditResult | null> {
    if (document && document.uri && workspace.isInScope(document.uri)) {
      return this.editFactory.create(document);
    }
    logger.info(
      `Document ${document?.uri.toString()} is out of scope, falling back to active/visible editor`
    );

    const activeTextEditor = vscode.window.activeTextEditor;
    if (
      activeTextEditor &&
      !activeTextEditor.document.isClosed &&
      workspace.isInScope(activeTextEditor.document.uri)
    ) {
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

/**
 * Command handler for sorting every file that has keep-sorted diagnostics. The diagnostic
 * collection only holds unsorted-block findings, so this applies the file-level fix to each
 * affected file in a single workspace edit.
 */
export class SortWorkspaceCommandHandler extends CommandHandler {
  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly editFactory: workspace.EditFactory;

  constructor(
    diagnostics: vscode.DiagnosticCollection,
    editFactory: workspace.EditFactory,
    command: vscode.Command = {
      title: `${EXT_DISPLAY_NAME}: Sort All Files with Problems`,
      command: `${EXT_NAME}.fixWorkspace`,
      tooltip: "Sort all files with problems",
    }
  ) {
    super(command);
    this.diagnostics = diagnostics;
    this.editFactory = editFactory;
  }

  /**
   * Creates a quick fix that sorts every affected file.
   *
   * @param diagnostics Diagnostics in the current document that the action addresses.
   */
  asCodeAction(diagnostics: vscode.Diagnostic[]): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `${this.command.tooltip} (${EXT_NAME})`,
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = diagnostics;
    action.command = { ...this.command, arguments: [] };
    return action;
  }

  /** Returns the in-scope files that currently have keep-sorted diagnostics. */
  affectedUris(): vscode.Uri[] {
    const uris: vscode.Uri[] = [];
    this.diagnostics.forEach((uri, fileDiagnostics) => {
      if (fileDiagnostics.length > 0 && workspace.isInScope(uri)) {
        uris.push(uri);
      }
    });
    return uris;
  }

  /**
   * Sorts all affected files in one workspace edit, then refreshes their diagnostics. Files that
   * fail to sort are skipped and reported so the remaining files are still fixed.
   */
  async handle(): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const documents: vscode.TextDocument[] = [];
    const failedUris: vscode.Uri[] = [];
    for (const uri of this.affectedUris()) {
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        const editResult = this.editFactory.create(document);
        if (editResult) {
          for (const [entryUri, textEdits] of editResult.edit.entries()) {
            edit.set(entryUri, textEdits);
          }
          documents.push(document);
        }
      } catch (err: Error | unknown) {
        logAndGetError(contextualizeLogger(uri), err);
        failedUris.push(uri);
      }
    }

    if (documents.length === 0) {
      if (failedUris.length > 0) {
        throw new Error(`Could not sort ${failedUris.length} file(s).`);
      }
      vscode.window.showInformationMessage(`${EXT_DISPLAY_NAME}: No files need sorting.`);
      return;
    }
    logger.info(`Sorting ${documents.length} file(s) with keep-sorted diagnostics`);
    if (!(await vscode.workspace.applyEdit(edit))) {
      throw new Error("Could not apply sorting edits; file diagnostics were retained.");
    }
    // TextDocument instances are live, so they already reflect the applied edit.
    documents.forEach((document) => this.editFactory.refreshDiagnostics(document));
    if (failedUris.length > 0) {
      vscode.window.showWarningMessage(
        `${EXT_DISPLAY_NAME}: Sorted ${documents.length} file(s); ` +
          `${failedUris.length} could not be sorted.`
      );
    }
  }
}
