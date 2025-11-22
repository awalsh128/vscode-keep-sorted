import * as vscode from "vscode";
import * as workspace from "./workspace";
import { logAndGetError, logger } from "./instrumentation";

/** Command handler base class to register and provide execution of command */
export abstract class CommandHandler {
  protected readonly diagnostics: vscode.DiagnosticCollection;
  protected readonly editFactory: workspace.EditFactory;

  public readonly command: vscode.Command;

  constructor(
    command: vscode.Command,
    diagnostics: vscode.DiagnosticCollection,
    editFactory: workspace.EditFactory
  ) {
    this.command = command;
    this.editFactory = editFactory;
    this.diagnostics = diagnostics;
  }

  protected abstract onHandle(): Promise<workspace.CreateEditResult[] | null>;

  async handle(): Promise<void> {
    try {
      const createResults = await this.onHandle();
      if (createResults) {
        for (const createResult of createResults) {
          this.diagnostics.delete(createResult.documentUri);
          await vscode.workspace.applyEdit(createResult.edit);
        }
      }
    } catch (err: Error | unknown) {
      throw logAndGetError(logger, err);
    }
  }
}

/** Handler for the "fix file" command to sort all keep-sorted blocks in the current file */
export class FixFileCommandHandler extends CommandHandler {
  static readonly COMMAND = {
    title: "Sort all lines in file (keep-sorted)",
    command: "keep-sorted.fixFile",
    tooltip: "Sort all keep-sorted blocks in the current file",
  };
  constructor(diagnostics: vscode.DiagnosticCollection, editFactory: workspace.EditFactory) {
    super(FixFileCommandHandler.COMMAND, diagnostics, editFactory);
  }
  public async onHandle(): Promise<workspace.CreateEditResult[] | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      logger.debug(`No active editor found for ${this.command.command} command.`);
      return null;
    }
    const createResult = await this.editFactory.create(editor.document);
    if (!createResult) {
      return null;
    }
    logger.debug(
      () => `${this.command.command} create result:\n` + workspace.toLogText([createResult])
    );
    return [createResult];
  }
}

/** Handler for the "fix workspace" command to sort all keep-sorted blocks in the workspace */
export class FixWorkspaceCommandHandler extends CommandHandler {
  static readonly COMMAND = {
    title: "Sort all lines in workspace (keep-sorted)",
    command: "keep-sorted.fixWorkspace",
    tooltip: "Sort all keep-sorted blocks in the workspace",
  };
  constructor(diagnostics: vscode.DiagnosticCollection, editFactory: workspace.EditFactory) {
    super(FixWorkspaceCommandHandler.COMMAND, diagnostics, editFactory);
  }

  public async onHandle(): Promise<workspace.CreateEditResult[] | null> {
    const uris = await workspace.inScopeUris();
    const allResults = await Promise.all(
      uris.map(
        async (uri) => await this.editFactory.create(await vscode.workspace.openTextDocument(uri))
      )
    );
    const createResults = allResults.filter((result) => result !== null);
    if (createResults.length > 0) {
      logger.debug(
        () => `${this.command.command} create results:\n` + workspace.toLogText(createResults)
      );
      return createResults;
    }
    return null;
  }
}
