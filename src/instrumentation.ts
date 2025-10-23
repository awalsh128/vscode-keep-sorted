import * as vscode from "vscode";

/**
 * Creates a VS Code LogOutputChannel for extension logging.
 *
 * The LogOutputChannel provides built-in log levels (Trace, Debug, Info, Warning, Error)
 * with automatic timestamp formatting and VS Code integration.
 *
 * Users can change the log level at runtime via Command Palette:
 * 1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
 * 2. Type "Developer: Set Log Level..."
 * 3. Select the extension name
 * 4. Choose desired level (changes apply immediately, no restart needed)
 *
 * @param name - The display name for the output channel
 * @returns A LogOutputChannel instance with methods: trace(), debug(), info(), warn(), error()
 *
 * @example
 * ```typescript
 * const logger = createLogger("My Extension");
 * logger.info("Extension activated");
 * logger.debug("Processing file", { fileName: "test.ts" });
 * logger.error("Failed to process", error);
 * ```
 */
export function createLogger(name: string): vscode.LogOutputChannel {
  const channel = vscode.window.createOutputChannel(name, { log: true });
  channel.show();
  channel.info(`Log output channel created for: ${name}`);
  return channel;
}

/**
 * Manages diagnostic warnings for keep-sorted blocks across all open documents.
 *
 * Ensures diagnostics are scoped to this extension (via source filtering) and provides
 * lifecycle management through VS Code's DiagnosticCollection. Acts as a centralized
 * store for all keep-sorted warnings that integrates with VS Code's Problems panel.
 */
export class KeepSortedDiagnostics implements vscode.Disposable {
  public static readonly source = "keep-sorted";

  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly logger: vscode.LogOutputChannel;

  constructor(logger: vscode.LogOutputChannel) {
    this.diagnostics = vscode.languages.createDiagnosticCollection(KeepSortedDiagnostics.source);
    this.logger = logger;
  }

  dispose() {
    this.diagnostics.dispose();
  }

  set(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]) {
    const filteredDiagnostics = diagnostics.filter(
      (d) => d.source === KeepSortedDiagnostics.source
    );
    if (filteredDiagnostics.length > 0) {
      this.logger.debug(
        `Found ${filteredDiagnostics.length} diagnostics / findings for document: ${document.uri.fsPath}`
      );
      this.diagnostics.set(document.uri, filteredDiagnostics);
    } else {
      this.logger.debug(`No diagnostics / findings found for document: ${document.uri.fsPath}`);
    }
  }

  clear(document: vscode.TextDocument) {
    this.diagnostics.delete(document.uri);
    this.logger.debug(`Cleared diagnostics for document: ${document.uri.fsPath}`);
  }

  get(document: vscode.TextDocument): vscode.Diagnostic[] | undefined {
    const filteredDiagnostics = this.diagnostics
      .get(document.uri)
      ?.filter((diagnostic) => diagnostic.source === KeepSortedDiagnostics.source);
    this.logger.debug(
      `Retrieved ${filteredDiagnostics?.length ?? 0} diagnostics for document: ${
        document.uri.fsPath
      }`
    );
    return filteredDiagnostics;
  }
}

/**
 * Information about errors that caused the extension to be disabled.
 */
export interface ExtensionDisabledInfo {
  /** Array of errors encountered */
  errors: Error[];
  /** Formatted log summary for bug reports */
  logSummary: string;
}

/**
 * Tracks consecutive errors and triggers a circuit breaker to disable the extension.
 *
 * Implements a safety mechanism to prevent the extension from continuously failing.
 * After a threshold of consecutive errors, it disables itself and prompts the user
 * to report the issue. This prevents performance degradation and provides a clear
 * path for bug reporting.
 */
export class ErrorTracker implements vscode.Disposable {
  private consecutiveErrors = 0;
  private readonly maxErrors = 5;
  private isDisabled = false;
  private readonly logger: vscode.LogOutputChannel;
  private readonly errorHistory: Error[] = [];
  private readonly onExtensionDisabledEmitter = new vscode.EventEmitter<ExtensionDisabledInfo>();

  readonly onExtensionDisabled = this.onExtensionDisabledEmitter.event;

  constructor(logger: vscode.LogOutputChannel) {
    this.logger = logger;
  }

  dispose(): void {
    this.onExtensionDisabledEmitter.dispose();
  }

  /**
   * Records a successful operation, resetting the error counter.
   */
  recordSuccess(): void {
    if (this.consecutiveErrors > 0) {
      this.logger.debug(
        `Resetting error counter from ${this.consecutiveErrors} after successful operation`
      );
      this.consecutiveErrors = 0;
    }
  }

  /**
   * Records an error and checks if the circuit breaker threshold is exceeded.
   * @returns true if the extension should continue, false if disabled
   */
  async recordError(error: Error): Promise<boolean> {
    if (this.isDisabled) {
      return false;
    }

    this.consecutiveErrors++;
    this.errorHistory.push(error);
    this.logger.error(
      `Error #${this.consecutiveErrors}/${this.maxErrors}: ${error.message}`,
      error
    );

    if (this.consecutiveErrors < this.maxErrors) {
      return true;
    }

    this.isDisabled = true;
    this.logger.error("Maximum consecutive errors reached. Disabling keep-sorted extension.");

    // Build log summary for bug reports
    const logSummary = this.buildLogSummary();

    // Emit the disabled event to stop subscriptions
    this.onExtensionDisabledEmitter.fire({
      errors: [...this.errorHistory],
      logSummary,
    });

    return false;
  }

  /**
   * Builds a formatted summary of errors for bug reports.
   */
  private buildLogSummary(): string {
    const timestamp = new Date().toISOString();
    const platform = `${process.platform} ${process.arch}`;
    const nodeVersion = process.version;
    const vscodeVersion = vscode.version;

    let summary = `# Keep-Sorted Extension Error Report\n\n`;
    summary += `**Timestamp**: ${timestamp}\n`;
    summary += `**VS Code Version**: ${vscodeVersion}\n`;
    summary += `**Node Version**: ${nodeVersion}\n`;
    summary += `**Platform**: ${platform}\n\n`;
    summary += `## Errors Encountered (${this.errorHistory.length})\n\n`;

    this.errorHistory.forEach((error, index) => {
      summary += `### Error ${index + 1}\n`;
      summary += `**Message**: ${error.message}\n`;
      if (error.stack) {
        summary += `**Stack Trace**:\n\`\`\`\n${error.stack}\n\`\`\`\n\n`;
      } else {
        summary += `\n`;
      }
    });

    return summary;
  }

  /**
   * Checks if the extension is currently disabled due to errors.
   */
  isExtensionDisabled(): boolean {
    return this.isDisabled;
  }
}

export async function createGithubIssueAsUrl(info: ExtensionDisabledInfo): Promise<string> {
  const lastError = info.errors[info.errors.length - 1];
  const issueTitle = `[BUG] ${lastError.message}`;

  // Build the issue body with error logs
  const issueBody = `## Description
Extension was disabled after ${info.errors.length} consecutive errors.

## Error Information
${info.logSummary}

## Additional Context
<!-- Please add any additional context about what you were doing when this error occurred -->
`;

  // URL encode the title and body
  const encodedTitle = encodeURIComponent(issueTitle);
  const encodedBody = encodeURIComponent(issueBody);

  return `https://github.com/awalsh128/vscode-keep-sorted/issues/new?template=bug_report.md&title=${encodedTitle}&body=${encodedBody}`;
}
