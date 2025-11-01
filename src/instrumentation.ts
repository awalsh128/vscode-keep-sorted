import * as vscode from "vscode";
import { RateLimiter } from "limiter";
import { LRUCache } from "lru-cache";
import * as path from "path";

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

  logLevel: vscode.LogLevel = logger.logLevel;

  onDidChangeLogLevel: vscode.Event<vscode.LogLevel> = logger.onDidChangeLogLevel;

  name: string = logger.name;

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
}

/**
 * Creates a contextualized logger for a specific document and optional range.
 *
 * @param document The document in scope for logging
 * @param range Optional range in scope for evaluation
 *
 * @returns A ContextualLogger instance with the document and range context prefixed to all logs
 */
export function contextualizeLogger(
  document: vscode.TextDocument,
  range?: vscode.Range
): ContextualLogger {
  const workspacePath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? null;
  const documentRelPath = workspacePath
    ? path.relative(workspacePath, document.uri.fsPath)
    : document.uri.fsPath;

  let rangeText = "";
  if (range) {
    if (range.end.line === 0) {
      rangeText = `[${range.start.line + 1}]`;
    } else {
      rangeText = `[${range.start.line + 1}:${range.end.line}]`;
    }
  }
  return new ContextualLogger(`${documentRelPath}${rangeText}`);
}

/**
 * Gets a log prefix string for a document and optional range.
 *
 * @param document The document
 * @param range Optional range
 *
 * @returns The prefix string
 */
export function getLogPrefix(document: vscode.TextDocument, range?: vscode.Range): string {
  const workspacePath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? null;
  const documentRelPath = workspacePath
    ? path.relative(workspacePath, document.uri.fsPath)
    : document.uri.fsPath;

  if (range) {
    return `${documentRelPath}[${range.start.line + 1}:${range.end.line}]`;
  }
  return documentRelPath;
}

/**
 * Tracks consecutive errors and triggers a circuit breaker to disable the extension.
 *
 * Implements a safety mechanism to prevent the extension from continuously failing. After a
 * threshold of consecutive errors, it disables itself and prompts the user to report the issue.
 * This prevents performance degradation and provides a clear path for bug reporting.
 */
export class ErrorTracker {
  private readonly errorRate = new RateLimiter({
    tokensPerInterval: 150,
    interval: "minute",
    fireImmediately: true,
  });
  private readonly uniqueErrors = new LRUCache<string, Error>({
    max: 20,
    ttl: 1000 * 30, // 30 seconds
  });

  constructor() {}

  /** Gets a deep clone of the unique errors recorded so far. */
  getUniqueErrors(): Error[] {
    return Array.from(this.uniqueErrors.values()).map((error) => {
      const clonedError = new Error(error.message);
      clonedError.stack = error.stack;
      clonedError.name = error.name;
      return clonedError;
    });
  }

  /**
   * Records an error and checks if the circuit breaker threshold is exceeded.
   *
   * @returns True if throttled, otherwise false.
   */
  async recordError(
    error: Error,
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<boolean> {
    this.uniqueErrors.set(error.message, error);

    const recordLogger = contextualizeLogger(document, range);
    const tokens = await this.errorRate.removeTokens(1);
    if (tokens < 0) {
      recordLogger.error(`Error rate limit exceeded. Throttling error collection and logging.`);
      return false;
    }
    recordLogger.error(`${error.message}`, error);
    return true;
  }

  /**
   * Builds a formatted summary of errors for bug reports.
   *
   * @param uniqueErrors The unique errors to include in the summary.
   */
  private static createLogSummary(uniqueErrors: Error[]): string {
    const timestamp = new Date().toISOString();
    const platform = `${process.platform} ${process.arch}`;
    const nodeVersion = process.version;
    const vscodeVersion = vscode.version;

    const summary = `# Keep-Sorted Extension Error Report
**Timestamp**: ${timestamp}
**VS Code Version**: ${vscodeVersion}
**Node Version**: ${nodeVersion}
**Platform**: ${platform}

## Unique Errors Encountered (${uniqueErrors.length})

In order by most recent occurrence.

`;
    function getStackTraceText(error: Error): string {
      return error.stack
        ? `**Stack Trace**:\n\`\`\`${error.stack}\n\`\`\``
        : "No stack trace available.";
    }

    return (
      summary +
      uniqueErrors
        .map((error, index) => {
          return `### Error ${index + 1}\n**Message**: ${error.message}\n${getStackTraceText(error)}`;
        })
        .join("\n")
    );
  }

  /**
   * Creates a GitHub issue URL for reporting extension errors.
   *
   * This method generates a pre-filled GitHub issue URL that includes error information when the
   * extension has been disabled due to consecutive errors. The URL contains an encoded title and
   * body with error details and log summary.
   *
   * @example
   *   ```typescript
   *   const issueUrl = await errorTracker.createGithubIssueUrl();
   *   // Returns: "https://github.com/awalsh128/vscode-keep-sorted/issues/new?template=bug_report.md&title=..."
   *   ```;
   *
   * @returns A promise that resolves to a GitHub issue creation URL with pre-filled bug report
   *   template, title containing the last error message, and body containing error count, log
   *   summary, and additional context section
   */
  async createGithubIssueUrl(): Promise<string | undefined> {
    // Perform a deep clone to avoid mutation issues
    const errors = this.getUniqueErrors();

    if (errors.length === 0) {
      logger.warn("No errors to create GitHub issue URL for.");
      return undefined;
    }

    const lastError = errors[errors.length - 1];
    const issueTitle = `[BUG] ${lastError.message}`;

    // Build the issue body with error logs
    const issueBody = `## Description
Extension was disabled after ${errors.length} consecutive errors.

## Error Information
${ErrorTracker.createLogSummary(errors)}

## Additional Context
<!-- Please add any additional context about what you were doing when this error occurred -->
`;

    // URL encode the title and body
    const encodedTitle = encodeURIComponent(issueTitle);
    const encodedBody = encodeURIComponent(issueBody);

    return `https://github.com/awalsh128/vscode-keep-sorted/issues/new?template=bug_report.md&title=${encodedTitle}&body=${encodedBody}`;
  }
}

/**
 * Displays a notification to the user about maximum errors and prompts for action.
 *
 * @param githubIssueUrl GitHub issue URL with the bug reported packed into the parameters
 */
export async function displayMaxErrorAndPrompt(githubIssueUrl: string): Promise<void> {
  // Show user notification with options
  const reportIssueLabel = "Report Issue";
  const copyLogsLabel = "Copy Logs";
  const viewLogsLabel = "View Logs";
  const result = await vscode.window.showErrorMessage(
    `Keep-sorted extension has encountered a high number of errors.`,
    reportIssueLabel,
    copyLogsLabel,
    viewLogsLabel
  );

  switch (result) {
    case reportIssueLabel: {
      // Copy full logs to clipboard as backup
      await vscode.env.clipboard.writeText(githubIssueUrl);
      vscode.window.showInformationMessage(
        "Error logs copied to clipboard. Opening create issue on GitHub..."
      );
      await vscode.env.openExternal(vscode.Uri.parse(githubIssueUrl));
      break;
    }
    case copyLogsLabel: {
      await vscode.env.clipboard.writeText(githubIssueUrl);
      vscode.window.showInformationMessage("Keep Sorted error logs copied to clipboard.");
      break;
    }
    case viewLogsLabel: {
      logger.show();
      break;
    }
  }
}
