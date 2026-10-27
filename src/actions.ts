// keep-sorted start
import * as vscode from "vscode";
import * as workspace from "./workspace";
import { CommandHandlers } from "./commands";
import { contextualizeLogger, relevantDiagnostics } from "./instrumentation";
// keep-sorted end

/**
 * Provides code actions (quick fixes and source actions) for keep-sorted diagnostics. Integrates
 * with VS Code's CodeActionProvider API to surface file and workspace fixes in the editor
 * lightbulb, context menu, and command palette.
 *
 * This class coordinates with the extension's diagnostic collection and command handlers to
 * generate actionable fixes for detected sorting issues.
 */
export class ActionProvider implements vscode.CodeActionProvider, workspace.Registrant {
  /** Code action kind used by editor.codeActionsOnSave source.fixAll.keepSorted. */
  static readonly fixAllKind = vscode.CodeActionKind.SourceFixAll.append("keepSorted");

  /** The code action kinds this provider supports. */
  static readonly kinds = [vscode.CodeActionKind.QuickFix, ActionProvider.fixAllKind];

  /** Unique identifier for this provider, used for registration and diagnostics. */
  readonly id = ActionProvider.name;

  private readonly commandHandlers: CommandHandlers;
  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly flushLint: (document: vscode.TextDocument) => void;

  /**
   * Constructs a new ActionProvider.
   *
   * @param diagnostics The diagnostic collection to use for relevant issues.
   * @param commandHandlers The set of command handlers for available fixes.
   * @param flushLint Lints a document whose debounced lint is still waiting, so a fix all on save
   *   sees edits made just before saving.
   */
  constructor(
    diagnostics: vscode.DiagnosticCollection,
    commandHandlers: CommandHandlers,
    flushLint: (document: vscode.TextDocument) => void = () => {}
  ) {
    this.diagnostics = diagnostics;
    this.commandHandlers = commandHandlers;
    this.flushLint = flushLint;
  }

  /**
   * Provides code actions (quick fixes and fix all) for the given document and range. Quick fixes
   * cover diagnostics in the range, while fix all covers the whole document wherever the cursor is,
   * like other source actions. Returns an empty array if no actions are available.
   *
   * @param document The document in which to provide actions.
   * @param range The range to check for diagnostics and provide quick fixes.
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context?: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const uri = document.uri;
    const actions: vscode.CodeAction[] = [];
    if (this.shouldIncludeAction(context, vscode.CodeActionKind.QuickFix)) {
      const diagnostics = [...relevantDiagnostics(this.diagnostics, uri, range)];
      if (diagnostics.length > 0) {
        // Preferred so Auto Fix applies it.
        actions.push(this.commandHandlers.sortFile.asCodeAction(diagnostics, document, true));
        // Only offer the workspace fix when it does more than the file fix.
        const { sortWorkspace } = this.commandHandlers;
        if (sortWorkspace.affectedUris().some((other) => other.toString() !== uri.toString())) {
          actions.push(sortWorkspace.asCodeAction(diagnostics));
        }
      }
    }
    if (this.shouldIncludeAction(context, ActionProvider.fixAllKind)) {
      // Only fix all waits for current diagnostics: quick fixes are requested as the cursor moves,
      // and flushing for them would lint on every keystroke again.
      this.flushLint(document);
      const diagnostics = [...relevantDiagnostics(this.diagnostics, uri)];
      if (diagnostics.length > 0) {
        actions.push(
          this.commandHandlers.sortFile.asCodeAction(
            diagnostics,
            document,
            true,
            ActionProvider.fixAllKind
          )
        );
      }
    }

    if (actions.length === 0) {
      contextualizeLogger(uri, range).debug("No relevant diagnostics found");
      return actions;
    }
    contextualizeLogger(uri, range).info(
      `Providing code action(s) for ${uri.fsPath}:\n` +
        actions
          .map(
            (a) =>
              ` - ${a.title}(${a.diagnostics!.map((d) => workspace.rangeText(d.range)).join(",")})`
          )
          .join("\n")
    );

    return actions;
  }

  private shouldIncludeAction(
    context: vscode.CodeActionContext | undefined,
    kind: vscode.CodeActionKind
  ): boolean {
    if (!context?.only) {
      return kind === vscode.CodeActionKind.QuickFix;
    }
    return context.only.contains(kind) || kind.contains(context.only);
  }

  /**
   * Registers this provider with VS Code, enabling code actions for all in-scope document schemas.
   * Returns a disposable for proper cleanup.
   */
  async register(): Promise<vscode.Disposable> {
    return vscode.languages.registerCodeActionsProvider(
      workspace.IN_SCOPE_SCHEMAS.map((s: string) => ({ scheme: s })),
      this,
      {
        providedCodeActionKinds: ActionProvider.kinds,
      }
    );
  }
}
