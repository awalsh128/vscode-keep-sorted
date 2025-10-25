import * as vscode from "vscode";
import { KeepSortedDiagnostics, logger } from "./instrumentation";
import { KeepSorted } from "./keep_sorted";
import { memoize } from "./shared";

/**
 * Abstract base class for fix command handlers.
 */
export abstract class FixCommandHandler {
  protected readonly linter: KeepSorted;
  protected readonly diagnostics: KeepSortedDiagnostics;

  constructor(linter: KeepSorted, diagnostics: KeepSortedDiagnostics) {
    this.linter = linter;
    this.diagnostics = diagnostics;
  }

  static createHandlers(
    linter: KeepSorted,
    diagnostics: KeepSortedDiagnostics
  ): FixCommandHandler[] {
    return [
      new FixFileCommandHandler(linter, diagnostics),
      // Future command handlers can be added here
    ];
  }

  abstract onGetCommand(): vscode.Command;

  public get command(): vscode.Command {
    return memoize(() => this.onGetCommand())();
  }

  public get commandName(): string {
    return this.command.command;
  }

  protected abstract onExecute(
    editor: vscode.TextEditor
  ): Promise<vscode.WorkspaceEdit | undefined | null>;

  async execute(
    editor: vscode.TextEditor | undefined
  ): Promise<vscode.WorkspaceEdit | undefined | null> {
    if (!editor) {
      logger.warn(`No active text editor found for fix command. Aborted.`);
      return undefined;
    }

    const document = editor.document;
    logger.info(`Executing command ${this.commandName} for document: ${document.uri.fsPath}`);

    const edit = await this.onExecute(editor);

    if (edit === undefined) {
      logger.error(
        `${this.commandName} command encountered an error for document: ${document.uri.fsPath}`
      );
      return undefined;
    }

    if (!edit) {
      logger.info(
        `${this.commandName} command returned no edit for document: ${document.uri.fsPath}`
      );
      return null;
    }

    await this.applyEditAndUpdateDiagnostics(document, edit);
  }

  /**
   * Common logic for applying edits and updating diagnostics.
   */
  private async applyEditAndUpdateDiagnostics(
    document: vscode.TextDocument,
    edit: vscode.WorkspaceEdit
  ): Promise<void> {
    const editApplied = await vscode.workspace.applyEdit(edit);

    if (!editApplied) {
      logger.info(`No fix to applied to document: ${document.uri.fsPath}`);
      return;
    }

    logger.info(`Applied fix to document: ${document.uri.fsPath}`);
    this.diagnostics.clear(document);

    // Re-lint the document after applying fix
    const lintResults = await this.linter.lintDocument(document);
    if (lintResults === undefined) {
      logger.error(`Failed to re-lint document after fix: ${document.uri.fsPath}`);
      return;
    }

    this.diagnostics.set(document, lintResults);
  }
}

/**
 * Command handler for fixing all keep-sorted blocks in a file.
 */
export class FixFileCommandHandler extends FixCommandHandler {
  onGetCommand(): vscode.Command {
    return {
      title: "Sort all lines in file (keep-sorted)",
      command: "keep-sorted.fixfile",
      tooltip: "Fix all lines in the current document",
    };
  }

  async onExecute(editor: vscode.TextEditor): Promise<vscode.WorkspaceEdit | undefined | null> {
    const document = editor.document;
    const fixedContent = await this.linter.fixDocument(document);
    if (fixedContent === undefined) {
      logger.error(`keep-sorted operation failed for document: ${document.uri.fsPath}`);
      return undefined;
    }
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, fixedContent);
    return edit;
  }
}

/**
 * Provides Quick Fix actions when keep-sorted diagnostics are present.
 *
 * Bridges diagnostics and command execution by creating CodeActions that attach the
 * FixCommand to any document with keep-sorted warnings. This enables the lightbulb
 * menu (Ctrl+.) to show "Sort keep-sorted blocks" when the cursor is on a diagnostic.
 * Only returns actions when diagnostics exist to avoid cluttering the Quick Fix menu.
 */
export class KeepSortedActionProvider implements vscode.CodeActionProvider {
  public static readonly actionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly diagnostics: KeepSortedDiagnostics;
  private readonly linter: KeepSorted;

  constructor(linter: KeepSorted, diagnostics: KeepSortedDiagnostics) {
    this.linter = linter;
    this.diagnostics = diagnostics;
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    _: vscode.Range
  ): vscode.CodeAction[] | undefined {
    logger.debug(`Providing code actions for document: ${document.uri.fsPath}`);

    const documentDiagnostics = this.diagnostics.get(document) || [];
    logger.debug(
      `Code action provider for document: ${document.uri.fsPath}, found ${documentDiagnostics.length} diagnostics`
    );
    if (documentDiagnostics.length === 0) {
      return;
    }

    const fixActions = FixCommandHandler.createHandlers(this.linter, this.diagnostics).map(
      (handler) => {
        const fixAction = new vscode.CodeAction(
          handler.command.title,
          vscode.CodeActionKind.QuickFix
        );
        fixAction.command = handler.command;
        fixAction.diagnostics = documentDiagnostics;
        return fixAction;
      }
    );

    logger.debug(
      `Providing code actions "${fixActions
        .map((a) => a.command!.command)
        .join(", ")}" for document: ${document.uri.fsPath}`
    );
    return fixActions;
  }
}
