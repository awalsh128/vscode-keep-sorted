import * as vscode from "vscode";
import { contextualizeLogger } from "./instrumentation";
import { KeepSorted } from "./keepSorted";

export const FIX_COMMAND: vscode.Command = {
  title: "Sort lines (keep-sorted)",
  command: "keep-sorted.fix",
  tooltip: "Sort lines in the current keep-sorted block",
};

/** Arguments to provide context for actions. */
export interface FixContext {
  linter: KeepSorted;
  diagnostics: vscode.DiagnosticCollection;
  document: vscode.TextDocument;
  range: vscode.Range;
}

async function onExecute(context: FixContext): Promise<vscode.WorkspaceEdit | undefined | null> {
  const document = context.document;
  const fixedContent = await context.linter.fixDocument(document, context.range);
  if (fixedContent === undefined) {
    return undefined;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, context.range, fixedContent);
  return edit;
}

/**
 * Applies fixes to the document based on the provided context; linter, diagnostics, and documents
 * with range in scope for fix.
 *
 * @param context The context for the fix action
 *
 * @returns The applied WorkspaceEdit, undefined on error, or null if no edit was necessary
 */
export async function executeFixAction(
  context: FixContext
): Promise<vscode.WorkspaceEdit | undefined | null> {
  // Don't require an activeTextEditor for the command to run in tests or programmatic calls.
  // Use the provided context.document to operate on the target document.

  const actionLogger = contextualizeLogger(context.document, context.range);
  actionLogger.info(`Executing command ${FIX_COMMAND.command}`);

  const edit = await onExecute(context);

  if (edit === undefined) {
    actionLogger.error(`${FIX_COMMAND.command} encountered an error`);
    return undefined;
  }

  if (!edit) {
    actionLogger.info(`${FIX_COMMAND.command} returned no edit`);
    return null;
  }
  const editApplied = await vscode.workspace.applyEdit(edit);
  if (!editApplied) {
    actionLogger.info(`No fix to apply.`);
    return;
  }
  actionLogger.info(`Fix applied.`);

  // Return the applied edit for callers/tests that may want to inspect it
  return edit;
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

  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly linter: KeepSorted;

  constructor(linter: KeepSorted, diagnostics: vscode.DiagnosticCollection) {
    this.linter = linter;
    this.diagnostics = diagnostics;
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] {
    const documentDiagnostics = this.diagnostics.get(document.uri);

    // Filter diagnostics to only those that intersect with the provided range
    const relevantDiagnostics = documentDiagnostics?.filter(
      (d) => d.range.intersection(range) !== undefined
    );

    if (!relevantDiagnostics || relevantDiagnostics.length === 0) {
      return [];
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

    const commandNames = actions.map((a) => a.command!.command).join(", ");
    contextualizeLogger(document, range).info(`Providing code action(s) "${commandNames}"`);
    return actions;
  }
}
