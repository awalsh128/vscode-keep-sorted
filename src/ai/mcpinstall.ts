import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { prettyJson } from "../common";
import { onWrapPreferencesChange, userWrapPreferences } from "../configuration";
import { extensionId, logAndGetError, logger } from "../instrumentation";
import { bundledBinaryPath } from "../keepsortedbin";
import * as workspace from "../workspace";
import { DIRTY_FILE_PREFIX, USER_PREFERENCES_FILE } from "./tools";

/** The server name written to MCP client configurations. */
export const MCP_SERVER_NAME = "keep-sorted";

/** Records which extension version the installed server copy came from. */
const VERSION_FILE = "version.txt";

/**
 * Installs the MCP server to a path that survives extension updates, and keeps the state it reads
 * from VS Code: the user-level wrap preferences and this window's unsaved files. Nothing is written
 * until `enable()` runs, which the AI setup command does; later activations then keep the copy and
 * state current.
 */
export class McpServerInstaller implements workspace.Registrant {
  readonly id = "mcpServer";
  /** The installed server's directory, which holds mcp.js, docs/ai, and bin. */
  readonly serverDir: string;
  /** The directory holding the state files the server reads. */
  readonly stateDir: string;
  private readonly extensionPath: string;
  private lastDirty = "";

  /**
   * Constructs a new McpServerInstaller.
   *
   * @param extensionPath The extension's install directory.
   * @param storageDir The extension's global storage directory, which survives updates.
   */
  constructor(extensionPath: string, storageDir: string) {
    this.extensionPath = extensionPath;
    this.serverDir = path.join(storageDir, "mcp", "server");
    this.stateDir = path.join(storageDir, "mcp", "state");
  }

  /** The installed server script. */
  get serverScript(): string {
    return path.join(this.serverDir, "mcp.js");
  }

  /** Whether the user has set the server up. Not `enabled`, which the registrant handler owns. */
  get installed(): boolean {
    return fs.existsSync(this.serverScript);
  }

  /**
   * The command MCP clients run to start the server.
   *
   * @returns The executable and its arguments.
   */
  launchCommand(): { command: string; args: string[] } {
    return { command: "node", args: [this.serverScript] };
  }

  /** Installs the server and starts keeping its state current. */
  enable(): void {
    this.install();
    this.writeUserPreferences(userWrapPreferences());
    this.writeDirtyFiles(true);
  }

  async register(): Promise<vscode.Disposable> {
    if (!this.installed) {
      return new vscode.Disposable(() => {});
    }
    try {
      this.enable();
    } catch (err: Error | unknown) {
      // A failed update leaves the previous copy, which still works.
      logAndGetError(logger, err);
    }
    const update = (): void => this.writeDirtyFiles();
    return vscode.Disposable.from(
      vscode.workspace.onDidChangeTextDocument(update),
      vscode.workspace.onDidSaveTextDocument(update),
      vscode.workspace.onDidCloseTextDocument(update),
      onWrapPreferencesChange(() => this.writeUserPreferences(userWrapPreferences())),
      new vscode.Disposable(() => fs.rmSync(this.dirtyFile(), { force: true }))
    );
  }

  /** Copies the server, docs, and this platform's binary when the installed copy is outdated. */
  install(): void {
    const versionFile = path.join(this.serverDir, VERSION_FILE);
    if (
      fs.existsSync(versionFile) &&
      fs.readFileSync(versionFile, "utf8") === extensionId.version
    ) {
      return;
    }
    // Copy into a fresh directory, then swap it in, so a running server never sees a partial copy.
    const staging = `${this.serverDir}.${process.pid}.tmp`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(path.join(staging, "docs"), { recursive: true });
    fs.copyFileSync(path.join(this.extensionPath, "dist", "mcp.js"), path.join(staging, "mcp.js"));
    fs.cpSync(path.join(this.extensionPath, "docs", "ai"), path.join(staging, "docs", "ai"), {
      recursive: true,
    });
    const binary = bundledBinaryPath(this.extensionPath);
    const copiedBinary = path.join(staging, "bin", path.basename(binary));
    fs.mkdirSync(path.dirname(copiedBinary), { recursive: true });
    fs.copyFileSync(binary, copiedBinary);
    fs.chmodSync(copiedBinary, 0o755);
    fs.writeFileSync(path.join(staging, VERSION_FILE), extensionId.version);
    fs.rmSync(this.serverDir, { recursive: true, force: true });
    fs.renameSync(staging, this.serverDir);
    logger.info(`Installed the Keep Sorted MCP server ${extensionId.version} to ${this.serverDir}`);
  }

  /**
   * Mirrors the user-level wrap preferences for the server.
   *
   * @param value The raw user-level setting, or undefined when unset.
   */
  writeUserPreferences(value: unknown): void {
    const file = path.join(this.stateDir, USER_PREFERENCES_FILE);
    if (value === undefined) {
      fs.rmSync(file, { force: true });
      return;
    }
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.writeFileSync(file, prettyJson(value));
  }

  /**
   * Records this window's files with unsaved changes, so the server will not overwrite them.
   *
   * @param force Write even when the list has not changed since the last write.
   */
  writeDirtyFiles(force = false): void {
    const dirty = vscode.workspace.textDocuments
      .filter((document) => document.isDirty && document.uri.scheme === "file")
      .map((document) => document.uri.fsPath)
      .sort();
    const serialized = JSON.stringify(dirty);
    if (!force && serialized === this.lastDirty) {
      return;
    }
    this.lastDirty = serialized;
    try {
      fs.mkdirSync(this.stateDir, { recursive: true });
      fs.writeFileSync(this.dirtyFile(), serialized);
    } catch (err: Error | unknown) {
      logAndGetError(logger, err);
    }
  }

  private dirtyFile(): string {
    return path.join(this.stateDir, `${DIRTY_FILE_PREFIX}${process.pid}.json`);
  }
}
