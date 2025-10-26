import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import { EXT_NAME, ErrorTracker, logger } from "./instrumentation";
import { memoize } from "./shared";

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

  constructor(extensionPath: string, errorTracker: ErrorTracker) {
    this.extensionPath = extensionPath;
    this.errorTracker = errorTracker;
  }

  private getBundledBinaryPath = memoize(() => {
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
    return binaryPath;
  });

  async fixDocument(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const args = range
        ? ["--lines", `${range.start.line + 1}:${range.end.line + 1}`, "-"]
        : ["-"];

      this.spawnCommand(args, document, async (code, stdout, stderr) => {
        if (code === 0 || code === 1) {
          resolve(stdout);
        } else {
          const error = new Error(`${EXT_NAME} fix failed: ${stderr}`);
          logger.error(`Failed to fix document with error code ${code}: ${stderr}`);
          const canContinue = await this.errorTracker.recordError(error);
          if (canContinue) {
            reject(error);
          } else {
            resolve(undefined);
          }
        }
      });
    });
  }

  async lintDocument(document: vscode.TextDocument): Promise<vscode.Diagnostic[] | undefined> {
    try {
      const findings = await this.getFindings(document);
      if (!Array.isArray(findings)) {
        const error = new Error(
          `Unexpected findings type, expected array but got "${typeof findings}"`
        );
        logger.error(error.message, { value: findings });
        await this.errorTracker.recordError(error);
        return undefined;
      }

      const diagnostics: vscode.Diagnostic[] = findings.flatMap((finding) => {
        return finding.fixes.flatMap((fix) => {
          return fix.replacements.map((replacement) => {
            const startPos = new vscode.Position(replacement.lines.start - 1, 0);
            const endPos = new vscode.Position(replacement.lines.end, 0);
            const range = new vscode.Range(startPos, endPos);
            const diagnostic = new vscode.Diagnostic(
              range,
              finding.message,
              vscode.DiagnosticSeverity.Warning
            );
            diagnostic.source = EXT_NAME;
            return diagnostic;
          });
        });
      });

      if (diagnostics.length === 0) {
        logger.debug(`No diagnostics / findings found for document: ${document.uri.fsPath}`);
      } else {
        logger.info(`Found ${diagnostics.length} diagnostics for document: ${document.uri.fsPath}`);
      }

      return diagnostics;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error encountered during document lint: ${err.message}`, err);
      await this.errorTracker.recordError(err);
      return undefined;
    }
  }

  private getFindings(document: vscode.TextDocument): Promise<KeepSortedFinding[]> {
    return new Promise((resolve, reject) => {
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
            reject(new Error(`Failed to parse ${EXT_NAME} output: ${parseError}`));
          }
        } else {
          reject(new Error(`${EXT_NAME} failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private spawnCommand(
    args: string[],
    document: vscode.TextDocument,
    onClose: (code: number, stdout: string, stderr: string) => void
  ): void {
    logger.debug(
      `Spawning ${EXT_NAME} for document: ${document.uri.fsPath} with args: ${args.join(" ")}`
    );
    const child = spawn(this.getBundledBinaryPath(), args, {
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
      logger.debug(`${EXT_NAME} process exited with code ${code}`);
      if (code !== 0 && code !== 1) {
        logger.error(`${EXT_NAME} error output: ${stderr}`);
      }
      onClose(code ?? 1, stdout, stderr);
    });

    child.on("error", (error) => {
      const errorMessage = `Failed to spawn ${EXT_NAME}: ${error.message}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    });

    // Write document content to stdin
    child.stdin.write(document.getText());
    child.stdin.end();
    logger.debug(`${EXT_NAME} execution complete for document: ${document.uri.fsPath}`);
  }
}
