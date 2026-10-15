// keep-sorted start
import * as vscode from "vscode";
import { contextualizeLogger, relevantDiagnostics } from "./instrumentation";
import * as workspace from "./workspace";
import { CommandHandlers } from "./commands";
// keep-sorted end

/**
 * Provides code actions (quick fixes and source actions) for keep-sorted diagnostics. Integrates
 * with VS Code's CodeActionProvider API to surface file-level fixes in the editor lightbulb,
 * context menu, and command palette.
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

  /**
   * Constructs a new ActionProvider.
   *
   * @param diagnostics The diagnostic collection to use for relevant issues.
   * @param commandHandlers The set of command handlers for available fixes.
   */
  constructor(diagnostics: vscode.DiagnosticCollection, commandHandlers: CommandHandlers) {
    this.diagnostics = diagnostics;
    this.commandHandlers = commandHandlers;
  }

  /**
   * Determines whether code actions should be provided for the given URI and range. Returns true if
   * there are relevant diagnostics in the specified range.
   */
  private shouldProvide(uri: vscode.Uri, range: vscode.Range): boolean {
    const diagnostics = relevantDiagnostics(this.diagnostics, uri, range);
    if (diagnostics.length === 0) {
      contextualizeLogger(uri, range).debug("No relevant diagnostics found");
      return false;
    }
    return true;
  }

  /**
   * Provides code actions (quick fixes and fix all) for the given document and range. Returns an
   * array of CodeAction objects, or an empty array if no actions are available.
   *
   * @param document The document in which to provide actions.
   * @param range The range to check for diagnostics and provide fixes.
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context?: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const uri = document.uri;
    if (!this.shouldProvide(uri, range)) {
      return [];
    }

    const diagnostics = [...relevantDiagnostics(this.diagnostics, document.uri, range)];
    if (diagnostics.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];
    if (this.shouldIncludeAction(context, vscode.CodeActionKind.QuickFix)) {
      actions.push(this.commandHandlers.sortFile.asCodeAction(diagnostics, document));
    }
    if (this.shouldIncludeAction(context, ActionProvider.fixAllKind)) {
      actions.push(
        this.commandHandlers.sortFile.asCodeAction(
          diagnostics,
          document,
          undefined,
          true,
          ActionProvider.fixAllKind
        )
      );
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
