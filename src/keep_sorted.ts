import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import { memoize } from "./shared";
import { ErrorTracker, KeepSortedDiagnostics } from "./instrumentation";

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
 * Spawns the platform-specific keep-sorted binary as a child process, communicating
 * via stdin/stdout. Handles both lint mode (returns JSON findings) and fix mode
 * (returns corrected content). The binary path is memoized to avoid repeated
 * platform detection on every invocation.
 */
export class KeepSorted {
  private readonly extensionPath: string;
  private readonly logger: vscode.LogOutputChannel;
  private readonly errorTracker: ErrorTracker;

  constructor(extensionPath: string, logger: vscode.LogOutputChannel, errorTracker: ErrorTracker) {
    this.extensionPath = extensionPath;
    this.logger = logger;
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
        this.logger.warn(`Unsupported platform ${process.platform}, trying linux binary`);
        binaryPath = path.join(this.extensionPath, "bin", "keep-sorted-linux-amd64");
    }
    this.logger.debug(`Using keep-sorted binary at path: ${binaryPath}`);
    return binaryPath;
  });

  async fixDocument(document: vscode.TextDocument): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      this.spawnCommand(["-"], document, async (code, stdout, stderr) => {
        if (code === 0 || code === 1) {
          this.errorTracker.recordSuccess();
          resolve(stdout);
        } else {
          const error = new Error(`Keep-sorted fix failed: ${stderr}`);
          this.logger.error(`Failed to fix document with error code ${code}: ${stderr}`);
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
        this.logger.error(error.message, { value: findings });
        await this.errorTracker.recordError(error);
        return undefined;
      }

      this.errorTracker.recordSuccess();

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
            diagnostic.source = KeepSortedDiagnostics.source;
            return diagnostic;
          });
        });
      });

      if (diagnostics.length === 0) {
        this.logger.debug(`No diagnostics / findings found for document: ${document.uri.fsPath}`);
      } else {
        this.logger.info(
          `Found ${diagnostics.length} diagnostics for document: ${document.uri.fsPath}`
        );
      }

      return diagnostics;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error encountered during document lint: ${err.message}`, err);
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
            reject(new Error(`Failed to parse keep-sorted output: ${parseError}`));
          }
        } else {
          reject(new Error(`keep-sorted failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private spawnCommand(
    args: string[],
    document: vscode.TextDocument,
    onClose: (code: number, stdout: string, stderr: string) => void
  ): void {
    this.logger.debug(
      `Spawning keep-sorted for document: ${document.uri.fsPath} with args: ${args.join(" ")}`
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
      this.logger.debug(`keep-sorted process exited with code ${code}`);
      if (code !== 0 && code !== 1) {
        this.logger.error(`keep-sorted error output: ${stderr}`);
      }
      onClose(code ?? 1, stdout, stderr);
    });

    child.on("error", (error) => {
      const errorMessage = `Failed to spawn keep-sorted: ${error.message}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    });

    // Write document content to stdin
    child.stdin.write(document.getText());
    child.stdin.end();
    this.logger.debug(`keep-sorted execution complete for document: ${document.uri.fsPath}`);
  }
}
