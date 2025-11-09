import * as vscode from "vscode";
import { excluded } from "./configuration";
import { contextualizeLogger } from "./instrumentation";
import * as path from "path";
import { KeepSorted } from "./keepsorted";

export interface CreateEditResult {
  documentUri: vscode.Uri;
  edit: vscode.WorkspaceEdit;
  diagnostics: vscode.Diagnostic[];
}

/** Factory to create WorkspaceEdits that apply fixes to documents */
export class EditFactory {
  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly linter: KeepSorted;

  constructor(linter: KeepSorted, diagnostics: vscode.DiagnosticCollection) {
    this.linter = linter;
    this.diagnostics = diagnostics;
  }

  private async applyToEdit(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    range?: vscode.Range
  ) {
    const fixedContent = await this.linter.fixDocument(document, range);
    if (fixedContent === null) {
      return;
    }
    edit.replace(
      document.uri,
      range ?? new vscode.Range(0, 0, document.lineCount, 0),
      fixedContent
    );
  }

  /**
   * Creates a WorkspaceEdit that applies fixes to the specified document and range, and the related
   * diagnostics
   */
  async create(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<CreateEditResult | null> {
    const documentDiagnostics = this.diagnostics.get(document.uri);
    if (!documentDiagnostics || documentDiagnostics.length === 0) {
      return null;
    }

    // Filter diagnostics to only those that intersect with the provided range
    const relevantDiagnostics =
      range == null
        ? documentDiagnostics
        : documentDiagnostics?.filter((d) => d.range.intersection(range) !== undefined);

    const editLogger = contextualizeLogger(document, range);

    if (relevantDiagnostics.length === 0) {
      editLogger.debug(`No relevant diagnostics found`);
      return null;
    }

    const edit = new vscode.WorkspaceEdit();
    for (const diagnostic of relevantDiagnostics) {
      const range = diagnostic.range;
      await this.applyToEdit(edit, document, range);
    }

    editLogger.info(`Created fixes for ${relevantDiagnostics.length} diagnostic(s)`);

    return { documentUri: document.uri, edit, diagnostics: [...relevantDiagnostics] };
  }
}

/** Gets the human readable representation of a range. */
export function rangeText(range?: vscode.Range): string {
  if (!range) {
    return "";
  }
  if (range.end.line === 0) {
    return `[${range.start.line + 1}]`;
  }
  if (range.start.line == range.end.line) {
    return `[${range.start.line + 1}]`;
  }
  return `[${range.start.line + 1}:${range.end.line}]`;
}

/** Gets all URIs in the workspace that are in scope (not excluded) and are a regular file. */
export async function inScopeUris(): Promise<vscode.Uri[]> {
  const uris = await vscode.workspace.findFiles("**/*");
  return uris.filter((uri) => isInScope(uri));
}

/** Checks whether a URI is in scope (not excluded) and is a regular file. */
export function isInScope(uri: vscode.Uri): boolean {
  if (uri.scheme !== "file") {
    return false;
  }
  const scopeLogger = contextualizeLogger(uri);
  const regexp = excluded(uri);
  if (!regexp) {
    return true;
  }
  scopeLogger.info(`Document is excluded with regex ${regexp.source}.`);
  return false;
}

/**
 * Gets the workspace relative path of a URI, or full path if not in a workspace.
 *
 * @param uri The URI to get the path for
 *
 * @returns The workspace relative path, or full path if not in a workspace
 */
export function relativePath(uri: vscode.Uri): string | null {
  const workspacePath = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? null;
  return workspacePath ? path.relative(workspacePath, uri.fsPath) : uri.fsPath;
}

/**
 * Manages extension-specific subscriptions to be registered and unregistered.
 *
 * Used to handle subscriptions that should only be active when the extension is enabled and
 * disposed when disabled.
 */
export class ExtensionSubscriptionsHandler {
  private context: vscode.Disposable[] = [];
  private registers: (() => Promise<vscode.Disposable>)[] = [];
  private active: vscode.Disposable[] = [];

  constructor(contextSubscriptions: vscode.Disposable[]) {
    this.context = contextSubscriptions;
  }

  /** Adds a new subscription register function */
  public addRegister(register: () => Promise<vscode.Disposable>): void {
    this.registers.push(register);
  }

  public dispose(): void {
    this.active.forEach((d) => d.dispose());
    this.active = [];
  }

  /** Registers all extension subscriptions to be active */
  public async registerExtensionSubscriptions(): Promise<void> {
    // dispose any previously-registered subscriptions (defensive)
    if (this.active.length > 0) {
      this.unregisterExtensionSubscriptions();
    }
    const disposables = await Promise.all(this.registers.map((register) => register()));
    this.active.push(...disposables);
  }

  /** Unregisters all extension subscriptions to be inactive */
  public unregisterExtensionSubscriptions(): void {
    this.active.forEach((d) => d.dispose());
    this.active.forEach((d) => {
      const i = this.context.indexOf(d as vscode.Disposable);
      if (i !== -1) {
        this.context.splice(i, 1);
      }
    });
    this.active = [];
  }
}
