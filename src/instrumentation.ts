import * as vscode from "vscode";
import { RateLimiter } from "limiter";
import { LRUCache } from "lru-cache";

export const EXT_NAME = "keep-sorted";
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

/**
 * Manages diagnostic warnings for keep-sorted blocks across all open documents.
 *
 * Ensures diagnostics are scoped to this extension (via source filtering) and provides lifecycle
 * management through VS Code's DiagnosticCollection. Acts as a centralized store for all
 * keep-sorted warnings that integrates with VS Code's Problems panel.
 */
export class KeepSortedDiagnostics implements vscode.Disposable {
  private readonly diagnostics: vscode.DiagnosticCollection;

  constructor() {
    this.diagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);
  }

  dispose() {
    this.diagnostics.dispose();
  }

  set(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]) {
    const filteredDiagnostics = diagnostics.filter((d) => d.source === EXT_NAME);
    if (filteredDiagnostics.length > 0) {
      logger.debug(
        `Found ${filteredDiagnostics.length} diagnostics / findings for document: ${document.uri.fsPath}`
      );
      this.diagnostics.set(document.uri, filteredDiagnostics);
    } else {
      logger.debug(`No diagnostics / findings found for document: ${document.uri.fsPath}`);
    }
  }

  append(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]) {
    const existingDiagnostics = this.diagnostics.get(document.uri) || [];
    const combinedDiagnostics = existingDiagnostics.concat(
      diagnostics.filter((d) => d.source === EXT_NAME)
    );
    this.diagnostics.set(document.uri, combinedDiagnostics);
    logger.debug(
      `Appended diagnostics. Document: ${document.uri.fsPath}, total diagnostics: ${combinedDiagnostics.length}`
    );
  }

  clear(document: vscode.TextDocument) {
    this.diagnostics.delete(document.uri);
    logger.debug(`Cleared diagnostics for document: ${document.uri.fsPath}`);
  }

  get(document: vscode.TextDocument): vscode.Diagnostic[] | undefined {
    const filteredDiagnostics = this.diagnostics
      .get(document.uri)
      ?.filter((diagnostic) => diagnostic.source === EXT_NAME);
    logger.debug(
      `Retrieved ${filteredDiagnostics?.length ?? 0} diagnostics for document: ${
        document.uri.fsPath
      }`
    );
    return filteredDiagnostics;
  }
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

  getUniqueErrors(): Error[] {
    return JSON.parse(JSON.stringify(this.uniqueErrors.values()));
  }

  /**
   * Records an error and checks if the circuit breaker threshold is exceeded.
   *
   * @returns True if throttled, otherwise false.
   */
  async recordError(error: Error): Promise<boolean> {
    this.uniqueErrors.set(error.message, error);

    const tokens = await this.errorRate.removeTokens(1);
    if (tokens < 0) {
      logger.error("Error rate limit exceeded. Throttling error collection and logging.");
      return false;
    }
    logger.error(error.message, error);
    return true;
  }

  /** Builds a formatted summary of errors for bug reports. */
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
