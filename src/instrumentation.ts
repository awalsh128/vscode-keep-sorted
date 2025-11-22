import * as vscode from "vscode";
import * as winston from "winston";
import * as workspace from "./workspace";
import * as tb from "triple-beam";
import * as path from "path";
/* eslint-disable @typescript-eslint/no-require-imports */
import TransportStream = require("winston-transport");

import type { TransformableInfo } from "logform";

/** Unique name of extension in VS Code. */
export const EXT_NAME = "keep-sorted";
/** Display friendly name of extension in VS Code. */
export const EXT_DISPLAY_NAME = "Keep Sorted";

/** Custom Winston transport for VS Code output channel. */
class OutputChannelTransport extends TransportStream {
  private readonly outputChannel: vscode.LogOutputChannel;

  constructor(
    opts?: TransportStream.TransportStreamOptions & { outputChannel: vscode.LogOutputChannel }
  ) {
    super(opts);
    this.outputChannel = opts!.outputChannel;
  }

  public log(info: TransformableInfo, next: () => void) {
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

/** Creates a logger instance for the extension. */
function createLogger(): winston.Logger {
  const outputChannel = vscode.window.createOutputChannel(EXT_DISPLAY_NAME, { log: true });
  outputChannel.show();

  const winstonLogLevel = (vscodeLevel: vscode.LogLevel) =>
    (vscodeLevel ? vscode.LogLevel[vscodeLevel] : vscode.LogLevel.Info.toString()).toLowerCase();

  const logLevel = winstonLogLevel(vscode.env.logLevel);

  const logger = winston.createLogger({
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

  vscode.env.onDidChangeLogLevel((newLevel: vscode.LogLevel) => {
    const previousLogLevel = logger.level;
    const newWinstonLevel = winstonLogLevel(newLevel);
    logger.level = newWinstonLevel;
    logger.transports.forEach((t) => (t.level = newWinstonLevel));
    logger.info(`Log level changed from '${previousLogLevel}' to '${logger.level}'`);
  });

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

function uri(documentOrUri: vscode.TextDocument | vscode.Uri): vscode.Uri {
  return documentOrUri instanceof vscode.Uri ? documentOrUri : documentOrUri.uri;
}

/** Logs an error and returns it so it can be handled / thrown. */
export function logAndGetError(logger: winston.Logger, error: Error | string | unknown): Error {
  const getError = (error: Error | string | unknown): Error => {
    if (error instanceof Error) {
      return error;
    }
    if (error instanceof String) {
      return new Error(error.toString());
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
  documentOrUri: vscode.TextDocument | vscode.Uri,
  range?: vscode.Range
): vscode.Diagnostic[] {
  const diagnostics = vscode.languages.getDiagnostics(uri(documentOrUri));
  const relevantDiagnostics = range
    ? diagnostics.filter((d) => d.range.intersection(range))
    : diagnostics;
  return relevantDiagnostics;
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
 * @param documentOrUri The document or URI in scope for logging
 * @param range Optional range in scope for evaluation
 *
 * @returns A ContextualLogger instance with the document and range context prefixed to all logs
 */
export function contextualizeLogger(
  documentOrUri: vscode.TextDocument | vscode.Uri,
  range?: vscode.Range
): winston.Logger {
  const relativePath = vscode.workspace.asRelativePath(uri(documentOrUri));
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
