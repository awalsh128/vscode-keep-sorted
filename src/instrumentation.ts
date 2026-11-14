/* eslint-disable @typescript-eslint/no-require-imports */
import { ExtensionLogger, LazyLogger } from "vsce-winston-logging";
import * as vscode from "vscode";
import { errorMessage } from "./common";

export { Benchmark, logAndGetError, setLogLevel } from "vsce-winston-logging";

/** Guidance appended to warnings about broken or unpublished extension versions. */
const EXT_ERROR_HELP = `

Please downgrade to a published version or update to latest.
Check https://github.com/awalsh128/vscode-keep-sorted/issues for known bugs.

Extension can be disabled in settings, see https://github.com/awalsh128/vscode-keep-sorted#settings for more information`;

/** Fields read from the extension manifest. */
interface PackageJson {
  /** Marketplace publisher ID, such as `awalsh128`. */
  publisher: string;
  /** Extension name, which is also the configuration section and diagnostic source. */
  name: string;
  /** Semantic version of the running extension. */
  version: string;
  /** Human-readable name shown in the UI. */
  displayName: string;
}

/** Identifies the running extension from its manifest and checks that its version is usable. */
export class ExtensionId {
  /** Released versions with known major bugs that users should move off of. */
  private readonly brokenVersions = ["1.0.0", "1.0.1", "1.0.2"];

  /** Unique extension identifier in `publisher.name` form, such as `awalsh128.keep-sorted`. */
  readonly value: string;

  /**
   * Constructs a new ExtensionId.
   *
   * @param publisher Marketplace publisher ID.
   * @param name Extension name.
   * @param version Semantic version of the running extension.
   * @param displayName Human-readable name shown in the UI.
   */
  private constructor(
    readonly publisher: string,
    readonly name: string,
    readonly version: string,
    readonly displayName: string
  ) {
    this.value = `${publisher}.${name}`;
  }

  /**
   * Creates an ExtensionId from the extension manifest.
   *
   * @param manifest The parsed `package.json` of the extension.
   *
   * @returns The identity described by the manifest.
   */
  static fromPackageJson(manifest: PackageJson) {
    return new ExtensionId(
      manifest.publisher,
      manifest.name,
      manifest.version,
      manifest.displayName
    );
  }

  /**
   * Checks whether a registry has this version by sending a HEAD request. Only a 404 counts as
   * unpublished; other failures are logged and treated as published so that outages do not warn.
   *
   * @param httpFetch The fetch implementation, injectable for tests.
   * @param url The registry URL for this version.
   *
   * @returns False if the registry reports the version missing, otherwise true.
   */
  private async isPublished(httpFetch: typeof fetch, url: string): Promise<boolean> {
    try {
      const res = await httpFetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        return true;
      }
      if (res.status === 404) {
        return false;
      }
      // 500, 403, etc. - assume published and silently log
      logger.error(`Extension version check failed with HTTP response ${res.status} @ ${url}`);
      return true;
    } catch (err: Error | unknown) {
      const message = errorMessage(err);
      logger.error(`Extension version check failed with error message '${message}' @ ${url}`);
      return true; // network error / timeout → assume published
    }
  }

  /**
   * Logs a problem with this version, opens its Extensions view entry, and shows a warning with
   * downgrade and disable guidance.
   *
   * @param messageSuffix The problem, completing a sentence that starts with the extension name.
   */
  private async showError(messageSuffix: string): Promise<void> {
    const message = `${this.displayName} extension (${this.value}-${this.version}) ${messageSuffix}.`;
    logger.error(message);
    void vscode.commands.executeCommand("workbench.extensions.action.showExtensionsWithIds", [
      this.value,
    ]);
    await vscode.window.showWarningMessage(message + EXT_ERROR_HELP, "OK");
  }

  /**
   * Warns the user if this version has a known major bug or is missing from the Visual Studio
   * Marketplace or Open VSX, such as after a release is pulled.
   *
   * @param httpFetch The fetch implementation, injectable for tests.
   */
  async check(httpFetch: typeof fetch) {
    logger.info(`Extension ID: ${this.value}`);
    if (this.brokenVersions.some((v) => v === this.version)) {
      this.showError("has a known major bug");
      return;
    }

    const marketplacePublished = await this.isPublished(
      httpFetch,
      `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${this.publisher}/vsextensions/${this.name}/${this.version}/vspackage`
    );
    const openVsxPublished = await this.isPublished(
      httpFetch,
      `https://open-vsx.org/api/${this.publisher}/${this.name}/${this.version}`
    );

    if (marketplacePublished && openVsxPublished) {
      return;
    }

    let messageSuffix: string;
    if (!marketplacePublished && !openVsxPublished) {
      messageSuffix = "either Marketplace or OpenVSX";
    } else if (!marketplacePublished) {
      messageSuffix = "Marketplace";
    } else {
      messageSuffix = "OpenVSX";
    }

    this.showError("is not published on " + messageSuffix);
  }
}

/** Identity of the running extension, read from its manifest. */
export const extensionId = ExtensionId.fromPackageJson(require("../package.json"));

/**
 * Singleton logger instance for the keep-sorted extension.
 *
 * Writes to the extension's log output channel and follows its level, so users can change the level
 * at runtime via Command Palette:
 *
 * 1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
 * 2. Type "Developer: Set Log Level..."
 * 3. Select the extension name
 * 4. Choose desired level (changes apply immediately, no restart needed)
 *
 * Add it to the extension's subscriptions on activation so it is disposed on deactivation.
 */
export const logger = new ExtensionLogger({
  name: extensionId.displayName,
  show: true,
  configSection: extensionId.name,
});

/**
 * Gets diagnostics for the given document or URI relevant to the extension, optionally filtered by
 * range.
 */
export function relevantDiagnostics(
  diagnostics: vscode.DiagnosticCollection,
  uri: vscode.Uri,
  range?: vscode.Range
): readonly vscode.Diagnostic[] {
  const docDiagnostics = diagnostics.get(uri) || [];
  return range ? docDiagnostics.filter((d) => d.range.intersection(range)) : docDiagnostics;
}

/**
 * Sets up or removes file logging for the extension.
 *
 * @param filepath Optional file path to enable logging to. If not specified, file logging is
 *   removed. Relative paths resolve against the first workspace folder.
 */
export function setFileLogging(filepath?: string): void {
  logger.setFileLogging(filepath);
}

/**
 * Creates a logger for a specific document and optional range, whose lines are prefixed with the
 * document's workspace-relative path and range.
 *
 * @param uri The document or URI in scope for logging
 * @param range Optional range in scope for evaluation
 */
export function contextualizeLogger(uri: vscode.Uri, range?: vscode.Range): LazyLogger {
  return logger.forDocument(uri, range);
}
