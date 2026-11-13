/* eslint-disable @typescript-eslint/no-require-imports */
import * as path from "path";
import * as tb from "triple-beam";
import * as vscode from "vscode";
import * as winston from "winston";
import { errorMessage } from "./common";
import * as workspace from "./workspace";
import TransportStream = require("winston-transport");
import type { TransformableInfo } from "logform";
import { performance } from "node:perf_hooks";

/** Simple benchmarking to measure elapsed time. */
export class Benchmark {
  private readonly startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  /** Gets the elapsed time, in milliseconds, since creation as a formatted text string. */
  getDeltaAsText(): string {
    const endTime = performance.now();
    return `${(endTime - this.startTime).toFixed(0)}ms`;
  }
}

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
 * Creates a level method that logs through the logger it is called on. Child loggers from
 * `logger.child()` inherit these methods, so binding them to the parent would drop the child's
 * metadata, such as the document path from `contextualizeLogger()`.
 */
function createLeveledLog(level: string): winston.LeveledLogMethod {
  function logLevel(this: winston.Logger, message: string, ...meta: unknown[]): winston.Logger;
  function logLevel(this: winston.Logger, message: string): winston.Logger;
  function logLevel(this: winston.Logger, infoObject: object): winston.Logger;
  function logLevel(this: winston.Logger, ...args: unknown[]): winston.Logger {
    if (args.length === 1) {
      return this.log(level, args[0]);
    }
    const [message, ...meta] = args;
    return this.log(level, message as string, ...(meta as unknown[]));
  }
  // string | number | unknown[] | object
  return logLevel;
}

class LazyLogger extends winston.Logger {
  error = createLeveledLog("error");
  warn = createLeveledLog("warn");
  help = createLeveledLog("help");
  data = createLeveledLog("data");
  info = createLeveledLog("info");
  debug = createLeveledLog("debug");
  trace = createLeveledLog("trace");

  /** Logs at debug level, building the message only when debug logging is enabled. */
  debugLazy(getMessage: () => string): void {
    if (this.isLevelEnabled("debug")) {
      this.log("debug", getMessage());
    }
  }

  traceLazy(getMessage: () => string): void {
    if (this.isLevelEnabled("trace")) {
      this.log("trace", getMessage());
    }
  }
}

/** Custom Winston transport for VS Code output channel. */
class OutputChannelTransport extends TransportStream {
  private readonly outputChannel: vscode.LogOutputChannel;

  constructor(
    opts?: TransportStream.TransportStreamOptions & { outputChannel: vscode.LogOutputChannel }
  ) {
    super(opts);
    this.outputChannel = opts!.outputChannel;
  }

  log(info: TransformableInfo, next: () => void) {
    setImmediate(() => {
      this.emit("logged", info);
    });
    const message = String(info[tb.MESSAGE] || info.message || "");
    const level = String(info[tb.LEVEL] || info.level || "info");

    switch (level) {
      case "error":
        this.outputChannel.error(message);
        break;
      case "warn":
      case "warning":
        this.outputChannel.warn(message);
        break;
      case "info":
        this.outputChannel.info(message);
        break;
      case "debug":
        this.outputChannel.debug(message);
        break;
      case "trace":
        this.outputChannel.trace(message);
        break;
      default:
        this.outputChannel.appendLine(`[UNKNOWN/${level}] ${message}`);
    }

    next();
  }
}

/**
 * Creates a file logger based on the specified file path in the keep-sorted extension.
 * configuration.
 */
function createFileTransport(filepath: string) {
  return new winston.transports.File({
    filename: filepath,
    format: winston.format.printf((info: TransformableInfo) => {
      const timestamp = info.timestamp || new Date().toISOString();
      return `${timestamp} [${info.level}] ${logFormat(info)}`;
    }),
  });
}

/** Sets the level of a logger and all of its transports. */
export function setLogLevel(logger: winston.Logger, level: string): void {
  const previousLogLevel = logger.level;
  logger.level = level;
  logger.transports.forEach((t) => (t.level = level));
  logger.info(`Log level changed from '${previousLogLevel}' to '${logger.level}'`);
}

/** Creates a logger instance for the extension. */
function createLogger(): LazyLogger {
  const outputChannel = vscode.window.createOutputChannel(extensionId.displayName, { log: true });
  outputChannel.show();

  const winstonLogLevel = (vscodeLevel: vscode.LogLevel) =>
    (vscodeLevel ? vscode.LogLevel[vscodeLevel] : vscode.LogLevel.Info.toString()).toLowerCase();

  // Use the current VS Code log level for the output channel specifically. This ensures that
  // changes to the log level via command line --log=awalsh128.keep-sorted:<level> are respected.
  const logLevel = winstonLogLevel(outputChannel.logLevel);

  const logger = new LazyLogger({
    level: logLevel,
    // VS Code log levels mapped to winston
    levels: {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4,
    },
    transports: [
      new OutputChannelTransport({
        outputChannel,
        format: winston.format.printf(logFormat),
        level: logLevel,
      }),
    ],
  });

  // The channel's event covers both its own level (Developer: Set Log Level) and
  // the global level it follows; vscode.env.onDidChangeLogLevel only reports the global level.
  outputChannel.onDidChangeLogLevel((newLevel: vscode.LogLevel) =>
    setLogLevel(logger, winstonLogLevel(newLevel))
  );

  return logger;
}

/**
 * Singleton logger instance for the keep-sorted extension.
 *
 * Wraps VS Code's LogOutputChannel, file and other transports for structured logging. All logging
 * configurations from VSCode are preserved by this logger.
 *
 * Users can change the log level at runtime via Command Palette:
 *
 * 1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
 * 2. Type "Developer: Set Log Level..."
 * 3. Select the extension name
 * 4. Choose desired level (changes apply immediately, no restart needed)
 */
export const logger = createLogger();

/** Logs an error and returns it so it can be handled / thrown. */
export function logAndGetError(logger: winston.Logger, error: Error | string | unknown): Error {
  const getError = (error: Error | string | unknown): Error => {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === "string") {
      return new Error(error);
    }
    return new Error(workspace.toJson(error));
  };
  const err = getError(error);
  logger.error(err.message, { error: err, stack: err.stack });
  return err;
}

function logFormat(info: TransformableInfo) {
  const findingPath = info.documentRelativePath;
  const findingLoc = findingPath ? `${findingPath}${info.range}: ` : "";
  return info.error ? workspace.toJson(info) : `${findingLoc}${info.message}`;
}

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
 *   removed.
 */
export function setFileLogging(filepath?: string) {
  // Reset all file transports first
  logger.transports
    .filter((t) => t instanceof winston.transports.File)
    .forEach((t) => logger.remove(t));

  if (!filepath || filepath.trim() === "") {
    logger.info("File logging disabled");
    return;
  }

  const rootPath = workspace.rootPath();
  const normalizedFilepath = rootPath ? path.join(rootPath, filepath) : path.normalize(filepath);
  const fileTransport = createFileTransport(normalizedFilepath);
  fileTransport.level = logger.level;
  logger.add(fileTransport);
  logger.info(`File logging enabled
  path: "${normalizedFilepath}"
  level: "${logger.level}"`);
}

/**
 * Creates a contextualized logger for a specific document and optional range.
 *
 * @param uri The document or URI in scope for logging
 * @param range Optional range in scope for evaluation
 *
 * @returns A ContextualLogger instance with the document and range context prefixed to all logs
 */
export function contextualizeLogger(uri: vscode.Uri, range?: vscode.Range): LazyLogger {
  const relativePath = vscode.workspace.asRelativePath(uri);
  const meta = {
    documentRelativePath: relativePath,
    range: workspace.rangeText(range),
  };
  const child = logger.child(meta);
  // Ensure the child logger exposes the metadata in a predictable place for tests and
  // consumers that may inspect the logger object.
  (child as unknown as { defaultMeta: typeof meta }).defaultMeta = meta;
  return child;
}
