import * as vscode from "vscode";
import * as util from "util";
import { excluded } from "./configuration";
import { contextualizeLogger, relevantDiagnostics } from "./instrumentation";
import { KeepSorted } from "./keepsorted";

/** Schemas that this extension supports */
export const IN_SCOPE_SCHEMAS = ["file", "untitled"];
export interface CreateEditResult {
  documentUri: vscode.Uri;
  edit: vscode.WorkspaceEdit;
  diagnostics: vscode.Diagnostic[];
}

/** Converts a CreateEditResult array to a loggable string */
export const toLogText = (results: CreateEditResult[]): string =>
  toJson(
    results.map((r) => {
      return {
        path: r.documentUri.path,
        edit: r.edit,
        diagnostics: r.diagnostics,
      };
    })
  );

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
      range ?? new vscode.Range(0, 0, document.lineCount - 1, 0),
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
    const diagnostics = relevantDiagnostics(document, range);
    if (!diagnostics || diagnostics.length === 0) {
      return null;
    }

    const editLogger = contextualizeLogger(document, range);

    if (diagnostics.length === 0) {
      editLogger.debug(`No relevant diagnostics found`);
      return null;
    }

    const uri = document.uri;
    const edit = new vscode.WorkspaceEdit();
    await this.applyToEdit(edit, document, range);

    return { documentUri: uri, edit, diagnostics: [...diagnostics] };
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

/** Gets the root path of the first workspace found, or undefined if no workspace is open. */
export function rootPath(): string | undefined {
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
  return undefined;
}

/** Gets all URIs in the workspace that are in scope (not excluded) and are a regular file. */
export async function inScopeUris(): Promise<vscode.Uri[]> {
  const uris = await vscode.workspace.findFiles("**/*");
  return uris.filter((uri) => isInScope(uri));
}

/** Checks whether a URI is in scope (not excluded) and is a regular file. */
export function isInScope(uri: vscode.Uri): boolean {
  if (!IN_SCOPE_SCHEMAS.includes(uri.scheme)) {
    return false;
  }
  const scopeLogger = contextualizeLogger(uri);
  const regexp = excluded(uri);
  if (!regexp) {
    return true;
  }
  scopeLogger.debug(`Document is excluded with regex ${regexp.source}.`);
  return false;
}

/** Converts a value to a pretty printed JSON string representation. */
export function toJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return util.inspect(value, { depth: null, compact: false, colors: false });
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
