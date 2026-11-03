// keep-sorted start
import * as util from "util";
import * as vscode from "vscode";
import { Benchmark, contextualizeLogger, logger, relevantDiagnostics } from "./instrumentation";
import { KeepSorted } from "./keepsorted";
import { excluded, getConfig, scanExclude } from "./configuration";
import { hasDirectives } from "./keepsortedopt";
// keep-sorted end

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

  /** Replaces this extension's file diagnostics with findings from the current buffer. */
  refreshDiagnostics(document: vscode.TextDocument): void {
    this.diagnostics.set(document.uri, this.linter.lintDocument(document));
  }

  /**
   * Replaces this extension's file diagnostics with findings from content read from disk.
   *
   * @param uri The file the content belongs to.
   * @param text The file's content.
   */
  refreshFileDiagnostics(uri: vscode.Uri, text: string): void {
    this.diagnostics.set(uri, this.linter.lintText(uri, text));
  }

  /**
   * Applies a fix to the given document, updating the provided WorkspaceEdit. Returns the new
   * content and replaced range if a fix is available, or null if not.
   */
  private applyToEdit(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument
  ): { content: string; range: vscode.Range } | null {
    const result = this.linter.fixDocument(document);
    if (result === null || result.content === null) {
      return null;
    }
    edit.replace(document.uri, result.range, result.content);
    return result;
  }

  /**
   * Creates a WorkspaceEdit that sorts every keep-sorted block in the document, and returns the
   * related diagnostics. If the document has no findings, returns null.
   *
   * @param document The document to fix.
   *
   * @returns A CreateEditResult if a fix is available, otherwise null.
   */
  create(document: vscode.TextDocument): CreateEditResult | null {
    // Commands must not depend on stale Problems entries or on document-event timing.
    this.refreshDiagnostics(document);
    const uri = document.uri;
    const editLogger = contextualizeLogger(uri);

    if (relevantDiagnostics(this.diagnostics, uri).length === 0) {
      editLogger.debug(`No relevant diagnostics found`);
      return null;
    }

    const edit = new vscode.WorkspaceEdit();
    const result = this.applyToEdit(edit, document);
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

/** Files larger than this are not read by the workspace scan; open documents are always linted. */
export const MAX_SCAN_BYTES = 1024 * 1024;

/** Result of a completed workspace scan. */
export interface ScanResult {
  /** Workspace files considered by the scan. */
  files: number;
  /** Files and open documents that were linted because they contain directives. */
  linted: number;
}

/** Editor and file system access used by the scan, replaceable in tests. */
export interface ScanHost {
  /** Finds workspace files, skipping those that match the exclude glob. */
  findFiles(exclude: string | undefined): Thenable<vscode.Uri[]>;
  /** Returns the documents currently open in the editor. */
  textDocuments(): readonly vscode.TextDocument[];
  /** Returns file metadata, such as its size. */
  stat(uri: vscode.Uri): Thenable<vscode.FileStat>;
  /** Reads a file's content from disk. */
  readFile(uri: vscode.Uri): Thenable<Uint8Array>;
}

const defaultScanHost: ScanHost = {
  findFiles: (exclude) => vscode.workspace.findFiles("**/*", exclude),
  textDocuments: () => vscode.workspace.textDocuments,
  stat: (uri) => vscode.workspace.fs.stat(uri),
  readFile: (uri) => vscode.workspace.fs.readFile(uri),
};

/**
 * Lints the workspace's in-scope files so warnings appear without opening them. Open documents are
 * linted from their buffers; other files are read from disk, without opening them as documents, and
 * only run through keep-sorted when they contain directives. The scan yields between files so the
 * extension host stays responsive. Starting a new scan or calling `cancel()` stops the previous
 * one, and a disk result is dropped if the file was opened meanwhile, since document events then
 * own its diagnostics.
 */
export class WorkspaceScanner {
  private readonly editFactory: EditFactory;
  private readonly host: ScanHost;
  private generation = 0;

  /**
   * Constructs a new WorkspaceScanner.
   *
   * @param editFactory The edit factory whose diagnostics the scan refreshes.
   * @param host Editor and file system access; defaults to the VS Code API.
   */
  constructor(editFactory: EditFactory, host: ScanHost = defaultScanHost) {
    this.editFactory = editFactory;
    this.host = host;
  }

  /** Stops any running scan. */
  cancel(): void {
    this.generation++;
  }

  /**
   * Scans the workspace, replacing any scan already running.
   *
   * @returns The scan counts, or undefined if the scan was cancelled or replaced.
   */
  async scan(): Promise<ScanResult | undefined> {
    // cancel() and newer scans bump the generation, which stops this scan at its next check.
    const generation = ++this.generation;
    const current = (): boolean => generation === this.generation && getConfig().enabled;
    const benchmark = new Benchmark();
    let linted = 0;

    // Open documents first: their buffers can hold unsaved edits that are not on disk.
    const openDocuments = this.host.textDocuments().filter((d) => isInScope(d.uri));
    for (const document of openDocuments) {
      const lint = (): void => this.editFactory.refreshDiagnostics(document);
      if (hasDirectives(document.getText()) && this.tryLint(document.uri, lint)) {
        linted++;
      }
    }

    const files = await this.host.findFiles(scanExclude());
    for (const uri of files) {
      // Yield so document events and other extensions run between files.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (!current()) {
        return undefined;
      }
      // Open files were already linted from their buffers above.
      if (!isInScope(uri) || this.isOpen(uri)) {
        continue;
      }
      const text = await this.readText(uri);
      // The file may have been opened, excluded, or the scan replaced while it was read.
      if (text === undefined || !current() || this.isOpen(uri) || !isInScope(uri)) {
        continue;
      }
      if (this.tryLint(uri, () => this.editFactory.refreshFileDiagnostics(uri, text))) {
        linted++;
      }
    }
    logger.info(
      `Scanned ${files.length} workspace files and linted ${linted} with keep-sorted ` +
        `directives (time: ${benchmark.getDeltaAsText()}).`
    );
    return { files: files.length, linted };
  }

  /** Determines whether the file is open in the editor, so document events own its diagnostics. */
  private isOpen(uri: vscode.Uri): boolean {
    // Compare strings: two Uri objects for the same file are different instances.
    const key = uri.toString();
    return this.host.textDocuments().some((document) => document.uri.toString() === key);
  }

  /**
   * Reads a file that may contain directives.
   *
   * @param uri The file to read.
   *
   * @returns The file's text, or undefined to skip a large, binary, unreadable, or directive-free
   *   file.
   */
  private async readText(uri: vscode.Uri): Promise<string | undefined> {
    try {
      if ((await this.host.stat(uri)).size > MAX_SCAN_BYTES) {
        return undefined;
      }
      const text = new TextDecoder().decode(await this.host.readFile(uri));
      // Skip text without directives and binary content.
      return hasDirectives(text) && !text.includes("\0") ? text : undefined;
    } catch (err: Error | unknown) {
      contextualizeLogger(uri).debug(`Skipping unreadable file: ${String(err)}`);
      return undefined;
    }
  }

  /**
   * Runs a lint, logging failures so one file does not stop the scan.
   *
   * @param uri The file being linted, for logging.
   * @param lint The lint to run.
   *
   * @returns True if the lint succeeded, otherwise false.
   */
  private tryLint(uri: vscode.Uri, lint: () => void): boolean {
    try {
      lint();
      return true;
    } catch (err: Error | unknown) {
      contextualizeLogger(uri).error(`Linting failed with:\n${String(err)}`);
      return false;
    }
  }
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
 * for objects, evaluating own getters such as those on VS Code's TextDocument, and returns strings
 * as-is.
 *
 * @param value The value to convert.
 *
 * @returns A formatted string.
 */
export function toJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return util.inspect(value, { depth: null, compact: false, colors: false, getters: true });
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
  private registered = false;

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
    if (this.registered) {
      // Keep logic simple for now instead of individually registering/unregistering
      await this.registerAllEnabled();
    }
  }

  /** Registers all enabled registrants, disposing any previous registrations. */
  public async registerAllEnabled(): Promise<void> {
    this.registered = true;
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
    this.registered = false;
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
