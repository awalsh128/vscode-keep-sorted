import * as vscode from "vscode";
import { KeepSortedDiagnostics, logger } from "./instrumentation";
import { KeepSorted } from "./keep_sorted";

export class FixCommandHandler {
  public static readonly command = new (class implements vscode.Command {
    title = "Sort lines (keep-sorted)";
    command = "keep-sorted.fix";
    tooltip = "Fix all lines in keep-sorted blocks of the current document";
  })();

  private readonly linter: KeepSorted;
  private readonly diagnostics: KeepSortedDiagnostics;

  get commandName(): string {
    return FixCommandHandler.command.command;
  }

  constructor(linter: KeepSorted, diagnostics: KeepSortedDiagnostics) {
    this.linter = linter;
    this.diagnostics = diagnostics;
  }

  /**
   * Executes the fix command for the active document.
   */
  async execute(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!editor) {
      logger.warn(`No active text editor found for fix command. Aborted.`);
      return;
    }

    const document = editor.document;
    logger.info(`Executing fix command for document: ${document.uri.fsPath}`);

    const fixedContent = await this.linter.fixDocument(document);
    if (!fixedContent) {
      logger.error(`Fix command returned no content for document: ${document.uri.fsPath}`);
      return;
    }

    // Apply the fixed content to the document
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, fixedContent);

    const success = await vscode.workspace.applyEdit(edit);
    if (success) {
      logger.info(`Successfully applied fix to document: ${document.uri.fsPath}`);
      this.diagnostics.clear(document);
      // Re-lint the document after applying fix
      const lintResults = await this.linter.lintDocument(document);
      if (lintResults) {
        this.diagnostics.set(document, lintResults);
      }
    } else {
      logger.error(`Failed to apply edit to document: ${document.uri.fsPath}`);
    }
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

  constructor(diagnostics: KeepSortedDiagnostics) {
    this.diagnostics = diagnostics;
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    _: vscode.Range
  ): vscode.CodeAction[] | undefined {
    const documentDiagnostics = this.diagnostics.get(document) || [];
    logger.debug(
      `Code action provider for document: ${document.uri.fsPath}, found ${documentDiagnostics.length} diagnostics`
    );
    if (documentDiagnostics.length === 0) {
      return;
    }

    const fixAction = new vscode.CodeAction(
      FixCommandHandler.command.title,
      vscode.CodeActionKind.QuickFix
    );
    fixAction.command = FixCommandHandler.command;
    fixAction.diagnostics = documentDiagnostics;

    logger.debug(
      `Providing code action "${FixCommandHandler.command.title}" for document: ${document.uri.fsPath}`
    );
    return [fixAction];
  }
}
