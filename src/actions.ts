import * as vscode from "vscode";
import { KeepSortedDiagnostics, logger } from "./instrumentation";
import { KeepSorted } from "./keepSorted";

export const FIX_COMMAND: vscode.Command = {
  title: "Sort lines (keep-sorted)",
  command: "keep-sorted.fix",
  tooltip: "Sort lines in the current keep-sorted block",
};

export interface FixContext {
  linter: KeepSorted;
  diagnostics: KeepSortedDiagnostics;
  document: vscode.TextDocument;
  range: vscode.Range;
}

async function onExecute(context: FixContext): Promise<vscode.WorkspaceEdit | undefined | null> {
  const document = context.document;
  const fixedContent = await context.linter.fixDocument(document, context.range);
  if (fixedContent === undefined) {
    logger.error(
      `${FIX_COMMAND.command} operation at line range ${context.range.start.line}:${context.range.end.line} failed for document: ${document.uri.fsPath}`
    );
    return undefined;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, context.range, fixedContent);
  return edit;
}

export async function executeFixAction(
  context: FixContext
): Promise<vscode.WorkspaceEdit | undefined | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    logger.warn(`No active text editor found for fix command. Aborted.`);
    return null;
  }

  logger.info(
    `Executing command ${FIX_COMMAND.command} for document: ${context.document.uri.fsPath}`
  );

  const edit = await onExecute(context);

  if (edit === undefined) {
    logger.error(
      `${FIX_COMMAND.command} command encountered an error for document: ${context.document.uri.fsPath}`
    );
    return undefined;
  }

  if (!edit) {
    logger.info(
      `${FIX_COMMAND.command} command returned no edit for document: ${context.document.uri.fsPath}`
    );
    return null;
  }

  await applyEditAndUpdateDiagnostics(context, edit);
}

/** Common logic for applying edits and updating diagnostics. */
async function applyEditAndUpdateDiagnostics(
  context: FixContext,
  edit: vscode.WorkspaceEdit
): Promise<void> {
  const editApplied = await vscode.workspace.applyEdit(edit);

  if (!editApplied) {
    logger.info(`No fix to applied to document: ${context.document.uri.fsPath}`);
    return;
  }

  logger.info(`Applied fix to document: ${context.document.uri.fsPath}`);
  context.diagnostics.clear(context.document);

  // Re-lint the document after applying fix
  const lintResults = await context.linter.lintDocument(context.document);
  if (lintResults === undefined) {
    logger.error(`Failed to re-lint document after fix: ${context.document.uri.fsPath}`);
    return;
  }

  context.diagnostics.set(context.document, lintResults);
}

/**
 * Provides Quick Fix actions when keep-sorted diagnostics are present.
 *
 * Bridges diagnostics and command execution by creating CodeActions that attach the FixCommand to
 * any document with keep-sorted warnings. This enables the lightbulb menu (Ctrl+.) to show "Sort
 * keep-sorted blocks" when the cursor is on a diagnostic. Only returns actions when diagnostics
 * exist to avoid cluttering the Quick Fix menu.
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
    range: vscode.Range
  ): vscode.CodeAction[] | undefined {
    logger.debug(`Providing code actions for document: ${document.uri.fsPath}, range: ${range}`);

    const documentDiagnostics = this.diagnostics.get(document) || [];
    logger.debug(
      `Code action provider for document: ${document.uri.fsPath}, found ${documentDiagnostics.length} total diagnostics`
    );

    // Filter diagnostics to only those that intersect with the provided range
    const relevantDiagnostics = documentDiagnostics.filter((diagnostic) =>
      diagnostic.range.intersection(range)
    );

    logger.debug(
      `Code action provider for document: ${document.uri.fsPath}, found ${relevantDiagnostics.length} diagnostics in range`
    );

    if (relevantDiagnostics.length === 0) {
      return;
    }

    const action = new vscode.CodeAction(FIX_COMMAND.title, vscode.CodeActionKind.QuickFix);
    action.command = {
      command: FIX_COMMAND.command,
      title: FIX_COMMAND.title,
      tooltip: FIX_COMMAND.tooltip,
      arguments: [document, range],
    };
    action.diagnostics = relevantDiagnostics;
    action.isPreferred = true;

    const actions = [action];

    logger.debug(
      `Providing code action(s) "${actions
        .map((a) => a.command!.command)
        .join(", ")}" for range with ${relevantDiagnostics.length} diagnostics in document: ${
        document.uri.fsPath
      }`
    );
    return actions;
  }
}
