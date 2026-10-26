import * as vscode from "vscode";

/** Quiet period after the last edit before a document is linted. */
export const LINT_DELAY_MS = 300;

/**
 * Lints documents on behalf of document events. Edits are debounced per document, so typing runs
 * keep-sorted once per pause instead of once per keystroke, which also avoids flagging a directive
 * before it is finished. Opens and saves lint immediately.
 */
export class LintScheduler implements vscode.Disposable {
  private readonly pending = new Map<string, NodeJS.Timeout>();

  /**
   * @param lint Lints a document and updates its diagnostics.
   * @param delayMs Quiet period after the last edit before linting.
   */
  constructor(
    private readonly lint: (document: vscode.TextDocument) => void,
    private readonly delayMs = LINT_DELAY_MS
  ) {}

  /** Lints the document once edits pause, replacing any lint already waiting for it. */
  schedule(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(this.pending.get(key));
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        if (!document.isClosed) {
          this.lint(document);
        }
      }, this.delayMs)
    );
  }

  /** Lints the document now, dropping any lint waiting for it. */
  now(document: vscode.TextDocument): void {
    this.cancel(document);
    this.lint(document);
  }

  /** Lints the document now only if an edit is still waiting, so its diagnostics are current. */
  flush(document: vscode.TextDocument): void {
    if (this.pending.has(document.uri.toString())) {
      this.now(document);
    }
  }

  /** Drops any lint waiting for the document. */
  cancel(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(this.pending.get(key));
    this.pending.delete(key);
  }

  /** Drops every waiting lint. */
  dispose(): void {
    this.pending.forEach((timer) => clearTimeout(timer));
    this.pending.clear();
  }
}
