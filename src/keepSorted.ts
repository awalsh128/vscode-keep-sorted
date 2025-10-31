import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import { EXT_NAME, ErrorTracker, logger, getLogPrefix } from "./instrumentation";

/** Keep Sorted finding in the format reported by it's binary. */
export interface KeepSortedFinding {
  path: string;
  lines: {
    start: number;
    end: number;
  };
  message: string;
  fixes: {
    replacements: {
      lines: {
        start: number;
        end: number;
      };
      new_content: string;
    }[];
  }[];
}

/**
 * Interfaces with the keep-sorted binary to lint and fix documents.
 *
 * Spawns the platform-specific keep-sorted binary as a child process, communicating via
 * stdin/stdout. Handles both lint mode (returns JSON findings) and fix mode (returns corrected
 * content). The binary path is memoized to avoid repeated platform detection on every invocation.
 */
export class KeepSorted {
  private readonly extensionPath: string;
  private readonly errorTracker: ErrorTracker;
  private readonly binaryPath: string;
  private readonly binaryFilename: string;

  constructor(extensionPath: string, errorTracker: ErrorTracker) {
    this.extensionPath = extensionPath;
    this.errorTracker = errorTracker;
    const binaryInfo = this.getBundledBinaryPath();
    this.binaryPath = binaryInfo.fullPath;
    this.binaryFilename = binaryInfo.filename;
  }

  /** Gets the platform specific binary based on the extension runner's OS. */
  private getBundledBinaryPath() {
    let binaryPath = "";
    switch (process.platform) {
      case "win32":
        binaryPath = path.win32.join(this.extensionPath, "bin", "keep-sorted.exe");
        break;
      case "darwin": {
        // Detect architecture for macOS
        const darwinArch = process.arch === "arm64" ? "arm64" : "amd64";
        binaryPath = path.join(this.extensionPath, "bin", `keep-sorted-darwin-${darwinArch}`);
        break;
      }
      case "linux":
        binaryPath = path.join(this.extensionPath, "bin", "keep-sorted-linux-amd64");
        break;
      default:
        // Fallback to linux binary for unsupported platforms
        logger.warn(`Unsupported platform ${process.platform}, trying linux binary`);
        binaryPath = path.join(this.extensionPath, "bin", "keep-sorted-linux-amd64");
    }
    logger.debug(`Using keep-sorted binary at path: ${binaryPath}`);
    return {
      fullPath: binaryPath,
      filename: path.basename(binaryPath),
    };
  }

  /**
   * Fix the document in the context of a specific line range.
   *
   * @param document The document to fix in the context of the line range provided
   * @param range The range of lines to fix
   *
   * @returns The fixed lines
   */
  async fixDocument(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      // Keep Sorted line arguments are one-based inclusize and range is zero-based end exclusive
      const args = range ? ["--lines", `${range.start.line + 1}:${range.end.line}`, "-"] : ["-"];

      this.spawnCommand(args, document, async (code, stdout, stderr) => {
        if (code === 0 || code === 1) {
          resolve(stdout);
        } else {
          const error = new Error(`${EXT_NAME} fix failed: ${stderr}`);
          logger.error(`Failed to fix document with error code ${code}: ${stderr}`);
          const canContinue = await this.errorTracker.recordError(error, document, range);
          if (canContinue) {
            reject(error);
          } else {
            resolve(undefined);
          }
        }
      });
    });
  }

  /**
   * Lints the provided document and returns diagnostics for any findings.
   *
   * @param document The document to lint
   *
   * @returns An array of diagnostics if findings are present, or undefined on error
   */
  async lintDocument(document: vscode.TextDocument): Promise<vscode.Diagnostic[] | undefined> {
    try {
      const findings = await this.getFindings(document);
      if (!Array.isArray(findings)) {
        const error = new Error(
          `Keep Sorted unexpected findings type, expected array but got "${typeof findings}"`
        );
        logger.error(error.message, { value: findings });
        await this.errorTracker.recordError(error, document);
        return undefined;
      }

      const diagnostics: vscode.Diagnostic[] = findings.map((finding) => {
        // Range is zero-based and end exclusive while keep-sorted lines are one-based and inclusive
        const startPos = new vscode.Position(finding.lines.start - 1, 0);
        const endPos = new vscode.Position(finding.lines.end, 0);
        const range = new vscode.Range(startPos, endPos);
        logger.debug(
          `${getLogPrefix(document, range)} Keep Sorted finding for lines ${finding.lines.start}-${finding.lines.end}`
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          finding.message,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = EXT_NAME;
        return diagnostic;
      });

      logger.info(`${getLogPrefix(document)} Keep Sorted found ${diagnostics.length} diagnostics.`);

      return diagnostics;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`${getLogPrefix(document)} Keep Sorted encountered error during linting.`, err);
      await this.errorTracker.recordError(err, document);
      return undefined;
    }
  }

  private getFindings(document: vscode.TextDocument): Promise<KeepSortedFinding[]> {
    return new Promise((resolve, reject) => {
      const logPrefix = getLogPrefix(document);
      this.spawnCommand(["--mode", "lint", "-"], document, (code, stdout, stderr) => {
        if (code === 0) {
          // No issues found
          resolve([]);
        } else if (code === 1 && stdout) {
          // Issues found, parse JSON output
          try {
            const findings: KeepSortedFinding[] = JSON.parse(stdout);
            resolve(findings);
          } catch (parseError) {
            reject(new Error(`${logPrefix} Failed to parse with error: ${parseError}`));
          }
        } else {
          reject(new Error(`${logPrefix} ${EXT_NAME} failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private spawnCommand(
    args: string[],
    document: vscode.TextDocument,
    onClose: (code: number, stdout: string, stderr: string) => void
  ): void {
    const logPrefix = getLogPrefix(document);
    // <binary> <args> <document paths>...
    const command = `${this.binaryFilename} ${args.join(" ")} ${document.uri.fsPath}`;
    logger.debug(`${logPrefix} Spawning "${command}"`);

    const startTime = performance.now();
    function getExecTimeText(): string {
      const endTime = performance.now();
      return `${(endTime - startTime).toFixed(0)}ms`;
    }

    const child = spawn(this.binaryPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      logger.debug(`${logPrefix} ${command} exited (time: ${getExecTimeText()}, code: ${code})`);
      if (code !== 0 && code !== 1) {
        logger.error(`${logPrefix} ${command} error output: ${stderr}`);
      }
      onClose(code ?? 1, stdout, stderr);
    });

    child.on("error", (error) => {
      logger.error(
        `${logPrefix} Failed to spawn ${command}: ${error.message} (time: ${getExecTimeText()})`
      );
      const errorMessage = `${logPrefix} Failed to spawn ${command}: ${error.message} (time: ${getExecTimeText()})`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    });

    // Write document content to stdin
    const text = document.getText();
    child.stdin.write(text);
    child.stdin.end();
    logger.debug(`${logPrefix} Processed document with size ${text.length}.`);
  }
}
