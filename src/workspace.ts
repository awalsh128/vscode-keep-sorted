import * as vscode from "vscode";
import * as util from "util";
import { excluded } from "./configuration";
import { contextualizeLogger, logger, relevantDiagnostics } from "./instrumentation";
import { KeepSorted } from "./keepsorted";

/**
 * List of URI schemes that are considered in-scope for keep-sorted operations. Only documents with
 * these schemes will be processed by the extension.
 */
export const IN_SCOPE_SCHEMAS = ["file", "untitled"];

/**
 * Represents the result of creating a workspace edit for a document, including the edit itself and
 * the diagnostics it addresses.
 */
export interface CreateEditResult {
  /** The URI of the document being edited. */
  documentUri: vscode.Uri;
  /** The workspace edit to apply. */
  edit: vscode.WorkspaceEdit;
  /** The diagnostics that are fixed by this edit. */
  diagnostics: vscode.Diagnostic[];
}

/**
 * Factory for creating WorkspaceEdits that apply keep-sorted fixes to documents. Coordinates with
 * the linter and diagnostics to generate edits and track affected diagnostics.
 */
export class EditFactory {
  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly linter: KeepSorted;

  /**
   * Constructs a new EditFactory.
   *
   * @param linter The KeepSorted linter instance to use for fix generation.
   * @param diagnostics The diagnostic collection to use for relevant issues.
   */
  constructor(linter: KeepSorted, diagnostics: vscode.DiagnosticCollection) {
    this.linter = linter;
    this.diagnostics = diagnostics;
  }

  /**
   * Applies a fix to the given document and range, updating the provided WorkspaceEdit. Returns the
   * new content and range if a fix is available, or null if not.
   */
  private applyToEdit(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    range?: vscode.Range
  ): { content: string; range: vscode.Range } | null {
    const result = this.linter.fixDocument(document, range);
    if (result === null || result.content === null) {
      return null;
    }
    edit.replace(document.uri, result.range, result.content);
    return result;
  }

  /**
   * Creates a WorkspaceEdit that applies fixes to the specified document and range, and returns the
   * related diagnostics. If no relevant diagnostics are found, returns null.
   *
   * @param document The document to fix.
   * @param range The range to fix (if applicable).
   *
   * @returns A CreateEditResult if a fix is available, otherwise null.
   */
  create(document: vscode.TextDocument, range?: vscode.Range): CreateEditResult | null {
    const uri = document.uri;
    const diagnostics = relevantDiagnostics(this.diagnostics, uri, range);
    const editLogger = contextualizeLogger(uri, range);

    if (diagnostics.length === 0) {
      editLogger.debug(`No relevant diagnostics found`);
      return null;
    }

    const targetRange =
      range ??
      diagnostics.slice(1).reduce<vscode.Range>((combined, diagnostic) => {
        return combined.union(diagnostic.range);
      }, diagnostics[0].range);

    const edit = new vscode.WorkspaceEdit();
    const result = this.applyToEdit(edit, document, targetRange);
    if (result === null) {
      return null;
    }

    // Remove the actual diagnostics that were fixed in case the whole document was fixed
    const affectedDiagnostics = relevantDiagnostics(this.diagnostics, uri, result.range);
    editLogger.debug(
      `Created edit for ${uri.toString()} with ${affectedDiagnostics.length} affected diagnostics`
    );
    return { documentUri: uri, edit, diagnostics: [...affectedDiagnostics] };
  }
}

/**
 * Returns a human-readable string representation of a VS Code range, for logging and diagnostics.
 *
 * @param range The range to format.
 *
 * @returns A string like [start] or [start:end].
 */
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

/**
 * Gets the root path of the first workspace folder, or undefined if no workspace is open. Used for
 * resolving relative paths and workspace-wide operations.
 */
export function rootPath(): string | undefined {
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
  return undefined;
}

/**
 * Returns all open text documents in the workspace that are in scope for keep-sorted operations.
 * Filters out documents that are excluded by configuration or not regular files.
 */
export async function inScopeDocuments(): Promise<readonly vscode.TextDocument[]> {
  const uris = await vscode.workspace.findFiles("**/*");
  const inScopeUris = uris.filter((uri) => isInScope(uri));
  const documents = await Promise.all(
    inScopeUris.map((uri) => {
      logger.debug(`Fetched in-scope document: ${uri.toString()}`);
      return vscode.workspace.openTextDocument(uri);
    })
  );
  return documents;
}

/**
 * Determines whether a URI is in scope for keep-sorted operations. Checks the URI scheme and
 * exclusion patterns from configuration.
 *
 * @param uri The URI to check.
 *
 * @returns True if the URI is in scope, false otherwise.
 */
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

/**
 * Converts a value to a pretty-printed JSON string for logging and diagnostics. Uses util.inspect
 * for objects, returns strings as-is.
 *
 * @param value The value to convert.
 *
 * @returns A formatted string.
 */
export function toJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return util.inspect(value, { depth: null, compact: false, colors: false });
}

/**
 * Interface for extension components that can register a disposable subscription and control their
 * enabled state. Registrants are only active when the extension is enabled.
 */
export interface Registrant {
  /** Unique identifier for the registrant. */
  readonly id: string;
  /** Registers the component and returns a disposable for cleanup. */
  register(): Promise<vscode.Disposable>;
}

/** Internal type for tracking registrants with their enabled state and registration handle. */
type RegistrantWithState = Registrant & {
  enabled: boolean;
  registration: vscode.Disposable | undefined;
};

/**
 * Manages extension-specific subscriptions, enabling and disabling them as the extension state
 * changes. Handles registration and disposal of all components that need to be active only when the
 * extension is enabled.
 */
export class ExtensionSubscriptionsHandler implements vscode.Disposable {
  private context: vscode.Disposable[] = [];
  private registrants: RegistrantWithState[] = [];
  private registrationsActive = true;

  /**
   * Constructs a new ExtensionSubscriptionsHandler.
   *
   * @param contextSubscriptions The array of disposables to manage.
   */
  constructor(contextSubscriptions: vscode.Disposable[]) {
    this.context = contextSubscriptions;
  }

  /**
   * Adds a new registrant (component) to be managed, optionally enabling it immediately.
   *
   * @param registrant The registrant to add.
   * @param enabled Whether the registrant should be enabled initially.
   */
  public addRegistrant(registrant: Registrant, enabled = true): void {
    // Keep reference to original registrant to preserve prototype methods (like register())
    const registrantWithState: RegistrantWithState = Object.assign(registrant, {
      enabled,
      registration: undefined as vscode.Disposable | undefined,
    });
    this.registrants.push(registrantWithState);
  }

  /** Disposes all managed registrants and clears the list. */
  public dispose(): void {
    this.registrants.filter((r) => r.registration).forEach((r) => r.registration?.dispose());
    this.registrants = [];
  }

  /**
   * Enables or disables a specific registrant by ID, re-registering all if needed.
   *
   * @param id The ID of the registrant to enable/disable.
   * @param enabled The new enabled state.
   */
  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    // Keep lookup simple for now since number of registrants is small
    const registrant = this.registrants.find((r) => r.id === id);
    if (!registrant) {
      throw new Error(`No registrant found with ID ${id} to set enable state.`);
    }
    registrant.enabled = enabled;
    // Re-register all to reflect the change if registrations are active
    if (!this.registrationsActive) {
      // Keep logic simple for now instead of individually registering/unregistering
      await this.registerAllEnabled();
    }
  }

  /** Registers all enabled registrants, disposing any previous registrations. */
  public async registerAllEnabled(): Promise<void> {
    this.registrationsActive = false;
    // dispose any previously-registered subscriptions (defensive)
    if (this.registrants.filter((r) => r.registration).length > 0) {
      this.unregisterAll();
    }
    for (const registrant of this.registrants.filter((r) => r.enabled)) {
      const registration = await registrant.register();
      registrant.registration = registration;
      this.context.push(registration);
    }
  }

  /** Unregisters (disposes) all managed registrants, making them inactive. */
  public unregisterAll(): void {
    this.registrationsActive = true;
    this.registrants
      .map((registrant) => registrant.registration as vscode.Disposable | undefined)
      .filter((disposable) => disposable !== undefined)
      .forEach((disposable) => {
        const i = this.context.indexOf(disposable);
        if (i !== -1) {
          this.context.splice(i, 1);
          disposable.dispose();
        }
      });
  }
}
