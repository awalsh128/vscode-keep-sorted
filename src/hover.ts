import * as vscode from "vscode";
import * as workspace from "./workspace";
import { KEEP_SORTED_OPTS, isValidCompletionPosition } from "./keepsortedopt";

/** Matches a `key=value` option token, including YAML list values that contain spaces. */
const OPTION_TOKEN_REGEX = /[A-Za-z_]+=(?:\[[^\]]*\]|\S*)/;

/** Shows option documentation when hovering a key or value on a `keep-sorted start` line. */
export class KeepSortedHoverProvider implements vscode.HoverProvider, workspace.Registrant {
  readonly id = "KeepSortedHoverProvider";

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, OPTION_TOKEN_REGEX);
    // Options only exist after the "start" keyword
    if (!range || !isValidCompletionPosition(document, range.start)) {
      return undefined;
    }
    const key = document.getText(range).split("=")[0];
    const option = KEEP_SORTED_OPTS.get(key);
    if (!option) {
      return undefined;
    }
    return new vscode.Hover(new vscode.MarkdownString(option.documentation), range);
  }

  /** Registers the hover provider for in-scope document schemas. */
  async register(): Promise<vscode.Disposable> {
    const selector: vscode.DocumentSelector = workspace.IN_SCOPE_SCHEMAS.map(
      (scheme: string): vscode.DocumentFilter => ({ scheme })
    );
    return vscode.languages.registerHoverProvider(selector, this);
  }
}
