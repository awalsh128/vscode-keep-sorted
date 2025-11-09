import * as vscode from "vscode";
import { contextualizeLogger } from "./instrumentation";
import * as workspace from "./workspace";

/** Provides fix actions for keep-sorted diagnostics. */
export class ActionProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.SourceFixAll];

  private readonly editFactory: workspace.EditFactory;

  constructor(editFactory: workspace.EditFactory) {
    this.editFactory = editFactory;
  }

  private getSupportCommand(): vscode.Command {
    return {
      title: "Keep Sorted documentation",
      command: "vscode.open",
      arguments: [vscode.Uri.parse("http://github.com/awalsh128/vscode-keep-sorted#readme")],
    };
  }

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): Promise<vscode.CodeAction[]> {
    const actionLogger = contextualizeLogger(document, range);

    const actions = [];

    const blockEditResult = await this.editFactory.create(document, range);
    if (blockEditResult) {
      const blockAction = new vscode.CodeAction(
        "Sort all lines in block (keep-sorted)",
        vscode.CodeActionKind.QuickFix
      );
      blockAction.command = this.getSupportCommand();
      blockAction.diagnostics = blockEditResult.diagnostics;
      blockAction.isPreferred = true;
      blockAction.edit = blockEditResult.edit;
      actions.push(blockAction);
    }

    // Also create a fix-file action with the same diagnostics as the block action
    const fixFileEditResult = await this.editFactory.create(document);
    if (fixFileEditResult) {
      const fixFile = new vscode.CodeAction(
        "Sort all lines in file (keep-sorted)",
        vscode.CodeActionKind.QuickFix
      );
      fixFile.command = this.getSupportCommand();
      // Use the same diagnostics as the block action (filtered by range)
      fixFile.diagnostics = fixFileEditResult.diagnostics;
      fixFile.isPreferred = false;
      fixFile.edit = fixFileEditResult.edit;
      actions.push(fixFile);

      const sourceFixFile = new vscode.CodeAction(
        fixFile.title,
        vscode.CodeActionKind.SourceFixAll
      );
      sourceFixFile.diagnostics = fixFile.diagnostics ? fixFile.diagnostics.slice() : undefined;
      sourceFixFile.edit = fixFile.edit;
      sourceFixFile.isPreferred = false;
      actions.push(sourceFixFile);
    }

    const actionToString = (a: vscode.CodeAction) =>
      `${a.title}(${a.diagnostics!.map((d) => workspace.rangeText(d.range)).join(",")})`;
    actionLogger.info(`Providing code action(s): ${actions.map(actionToString).join(", ")}`);

    return actions;
  }
}
