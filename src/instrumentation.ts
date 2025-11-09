import * as vscode from "vscode";
import * as workspace from "./workspace";

/** Unique name of extension in VS Code */
export const EXT_NAME = "keep-sorted";
/** Display friendly name of extension in VS Code */
export const EXT_DISPLAY_NAME = "Keep Sorted";

/**
 * Creates a VS Code LogOutputChannel for extension logging.
 *
 * The LogOutputChannel provides built-in log levels (Trace, Debug, Info, Warning, Error) with
 * automatic timestamp formatting and VS Code integration.
 *
 * Users can change the log level at runtime via Command Palette:
 *
 * 1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
 * 2. Type "Developer: Set Log Level..."
 * 3. Select the extension name
 * 4. Choose desired level (changes apply immediately, no restart needed)
 *
 * @example
 *   ```typescript
 *   const logger = createLogger("My Extension");
 *   logger.info("Extension activated");
 *   logger.debug("Processing file", { fileName: "test.ts" });
 *   logger.error("Failed to process", error);
 *   ```;
 *
 * @param name - The display name for the output channel
 *
 * @returns A LogOutputChannel instance with methods: trace(), debug(), info(), warn(), error()
 */
function createLogger(): vscode.LogOutputChannel {
  const channel = vscode.window.createOutputChannel(EXT_DISPLAY_NAME, { log: true });
  channel.show();
  channel.info(`Log output channel created for: ${EXT_DISPLAY_NAME}`);
  return channel;
}

/** Singleton logger instance for the keep-sorted extension */
export const logger = createLogger();

/** Prefixes all log messages with a specified string to provide context for the log lines. */
export class ContextualLogger implements vscode.LogOutputChannel {
  readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  // Forward the log level to the underlying logger so runtime changes are reflected.
  get logLevel(): vscode.LogLevel {
    return logger.logLevel;
  }

  onDidChangeLogLevel: vscode.Event<vscode.LogLevel> = logger.onDidChangeLogLevel;

  get name(): string {
    return logger.name;
  }

  append(value: string): void {
    logger.append(value);
  }
  appendLine(value: string): void {
    logger.appendLine(value);
  }
  replace(value: string): void {
    logger.replace(value);
  }
  clear(): void {
    logger.clear();
  }
  show(column?: unknown, preserveFocus?: unknown): void {
    logger.show(column as vscode.ViewColumn | undefined, preserveFocus as boolean | undefined);
  }
  hide(): void {
    logger.hide();
  }
  dispose(): void {
    logger.dispose();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trace(message: string, ...args: any[]): void {
    logger.trace(`${this.prefix} ${message}`, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, ...args: any[]): void {
    logger.debug(`${this.prefix} ${message}`, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, ...args: any[]): void {
    logger.info(`${this.prefix} ${message}`, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, ...args: any[]): void {
    logger.warn(`${this.prefix} ${message}`, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, ...args: any[]): void {
    logger.error(`${this.prefix} ${message}`, ...args);
  }

  logAndGetError(message: string, ...args: unknown[]): never {
    const fullMessage = `${this.prefix} ${message}`;
    logger.error(fullMessage, ...args);
    throw new Error(fullMessage);
  }
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
): ContextualLogger {
  const uri = documentOrUri instanceof vscode.Uri ? documentOrUri : documentOrUri.uri;
  return new ContextualLogger(`${workspace.relativePath(uri)}${workspace.rangeText(range)}`);
}
