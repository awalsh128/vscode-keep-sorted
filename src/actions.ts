import * as vscode from "vscode";
import { contextualizeLogger, relevantDiagnostics } from "./instrumentation";
import * as workspace from "./workspace";
import { LRUCache } from "lru-cache";

/** Provides fix actions for keep-sorted diagnostics. */
export class ActionProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.SourceFixAll];

  // Debounce multiple provision requests for the same diagnostics.
  private readonly cache: LRUCache<string, { void: void }>;
  private readonly editFactory: workspace.EditFactory;

  constructor(editFactory: workspace.EditFactory) {
    this.editFactory = editFactory;
    this.cache = new LRUCache<string, { void: void }>({
      max: 100,
      ttl: 1000 * 60 * 5, // 5 minutes
    });
  }

  private getSupportCommand(): vscode.Command {
    return {
      title: "Keep Sorted documentation",
      command: "vscode.open",
      arguments: [vscode.Uri.parse("http://github.com/awalsh128/vscode-keep-sorted#readme")],
    };
  }

  private shouldProvide(document: vscode.TextDocument, range: vscode.Range): boolean {
    const actionLogger = contextualizeLogger(document, range);
    const diagnostics = relevantDiagnostics(document, range);
    if (diagnostics.length === 0) {
      actionLogger.debug("No relevant diagnostics found");
      return false;
    }
    const cacheKey = JSON.stringify({
      uri: document.uri.fsPath,
      ranges: diagnostics.map((d) => d.range),
    });
    if (this.cache.has(cacheKey)) {
      actionLogger.debug("Action provision recently provided, skipping / debouncing.");
      return false;
    }
    this.cache.set(cacheKey, { void: void 0 });
    return true;
  }

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): Promise<vscode.CodeAction[]> {
    if (!this.shouldProvide(document, range)) {
      return [];
    }

    const blockEditResult = await this.editFactory.create(document, range);
    if (!blockEditResult) {
      return [];
    }

    const actionLogger = contextualizeLogger(document, range);
    const actions = [];

    const blockAction = new vscode.CodeAction(
      "Sort all lines in block (keep-sorted)",
      vscode.CodeActionKind.QuickFix
    );
    blockAction.diagnostics = blockEditResult.diagnostics;
    blockAction.isPreferred = true;
    blockAction.edit = blockEditResult.edit;
    actions.push(blockAction);

    // Also create a fix-file action as SourceFixAll
    const fixFileEditResult = await this.editFactory.create(document);
    if (fixFileEditResult) {
      const title = "Sort all lines in file (keep-sorted)";

      const sourceFixFile = new vscode.CodeAction(title, vscode.CodeActionKind.SourceFixAll);
      // Use the same diagnostics as the block action (filtered by range)
      sourceFixFile.diagnostics = blockEditResult.diagnostics;
      sourceFixFile.isPreferred = false;
      sourceFixFile.edit = fixFileEditResult.edit;
      actions.push(sourceFixFile);

      const quickFixFile = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      quickFixFile.diagnostics = blockEditResult.diagnostics;
      quickFixFile.isPreferred = false;
      quickFixFile.edit = fixFileEditResult.edit;
      actions.push(quickFixFile);
    }

    const actionToString = (a: vscode.CodeAction) =>
      `${a.title}(${a.diagnostics!.map((d) => workspace.rangeText(d.range)).join(",")})`;
    actionLogger.info(`Providing code action(s):\n ${actions.map(actionToString).join("\n ")}`);

    return actions;
  }
}
