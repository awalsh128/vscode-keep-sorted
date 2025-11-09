import * as vscode from "vscode";
import * as workspace from "./workspace";

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
    const createResults = await this.onHandle();
    if (createResults) {
      createResults.forEach((createResult) => {
        this.diagnostics.delete(createResult.documentUri);
        vscode.workspace.applyEdit(createResult.edit);
      });
    }
  }
}

/** Handler for the "fix file" command to sort all keep-sorted blocks in the current file */
export class FixFileCommandHandler extends CommandHandler {
  constructor(diagnostics: vscode.DiagnosticCollection, editFactory: workspace.EditFactory) {
    super(
      {
        title: "Sort all lines in file (keep-sorted)",
        command: "keep-sorted.fixFile",
        tooltip: "Sort all keep-sorted blocks in the current file",
      },
      diagnostics,
      editFactory
    );
  }
  public async onHandle(): Promise<workspace.CreateEditResult[] | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }
    const createResult = await this.editFactory.create(editor.document);
    if (!createResult) {
      return null;
    }
    return [createResult];
  }
}

/** Handler for the "fix workspace" command to sort all keep-sorted blocks in the workspace */
export class FixWorkspaceCommandHandler extends CommandHandler {
  constructor(diagnostics: vscode.DiagnosticCollection, editFactory: workspace.EditFactory) {
    super(
      {
        title: "Sort all lines in workspace (keep-sorted)",
        command: "keep-sorted.fixWorkspace",
        tooltip: "Sort all keep-sorted blocks in the workspace",
      },
      diagnostics,
      editFactory
    );
  }

  public async onHandle(): Promise<workspace.CreateEditResult[] | null> {
    const uris = await workspace.inScopeUris();
    const createResults = await Promise.all(
      uris
        .map(async (uri) => {
          return await this.editFactory.create(await vscode.workspace.openTextDocument(uri));
        })
        .filter((result) => result !== null)
        .map((result) => result! as unknown as workspace.CreateEditResult)
    );
    return createResults.length > 0 ? createResults : null;
  }
}
