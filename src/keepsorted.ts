import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import { EXT_NAME, logger, contextualizeLogger } from "./instrumentation";

/**
 * Keep Sorted finding in the JSON format reported by it's binary. Uses casing matching the binary's
 * output for deserialization.
 */
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
  private readonly binaryPath: string;
  private readonly binaryFilename: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
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

  async getAndValidateFindings(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<KeepSortedFinding[]> {
    const kpLogger = contextualizeLogger(document);
    const findings = await this.getFindings(document, range);
    if (findings.length === 0) {
      return [];
    }
    if (findings.length > 1) {
      kpLogger.warn(
        `Multiple (${findings.length}) findings; only the first will be applied\n${JSON.stringify(findings)}`
      );
    }
    const fixes = findings[0].fixes;
    if (fixes.length === 0) {
      throw new Error(
        "Unexpected no fixes available for the finding.\n" + JSON.stringify(findings[0])
      );
    }
    if (fixes.length > 1) {
      kpLogger.warn(`Multiple (${fixes.length}) fixes available; only the first will be applied.`);
    }
    if (fixes[0].replacements.length === 0) {
      throw new Error(
        "Unexpected no replacements available in the fix.\n" + JSON.stringify(fixes[0])
      );
    }
    if (fixes[0].replacements.length > 1) {
      kpLogger.warn(
        `Multiple (${fixes[0].replacements.length}) replacements available; only the first will be applied.`
      );
    }
    return findings;
  }

  /** Fixes the specified range in the document and returns the fixed content. */
  async fixDocument(document: vscode.TextDocument, range?: vscode.Range): Promise<string | null> {
    const findings = await this.getAndValidateFindings(document, range);
    if (findings.length === 0) {
      return null;
    }
    return findings[0].fixes[0].replacements[0].new_content;
  }

  /**
   * Lints the provided document and returns diagnostics for any findings.
   *
   * @param document The document to lint
   *
   * @returns An array of diagnostics
   *
   * @throws Error if the binary call fails
   */
  async lintDocument(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
    const kpLogger = contextualizeLogger(document);
    const findings = await this.getFindings(document);
    const diagnostics: vscode.Diagnostic[] = findings.map((finding) => {
      // Range is zero-based and end exclusive while keep-sorted lines are one-based and inclusive
      const startPos = new vscode.Position(finding.lines.start - 1, 0);
      const endPos = new vscode.Position(finding.lines.end, 0);
      const range = new vscode.Range(startPos, endPos);
      kpLogger.debug(
        `${this.binaryFilename} finding for lines ${finding.lines.start}:${finding.lines.end}`
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        finding.message,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = EXT_NAME;
      return diagnostic;
    });

    kpLogger.info(`${this.binaryFilename} found ${diagnostics.length} replacements.`);
    return diagnostics;
  }

  private async getFindings(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<KeepSortedFinding[]> {
    const kpLogger = contextualizeLogger(document);
    const args = range
      ? ["--mode", "lint", "--lines", `${range.start.line + 1}:${range.end.line}`, "-"]
      : ["--mode", "lint", "-"];
    const { code, stdout, stderr } = await this.spawnCommand(
      args,
      document.uri,
      document.getText()
    );
    if (code === 0) {
      // No issues found
      return [];
    } else if (code === 1 && stdout) {
      // Issues found, parse JSON output
      try {
        return JSON.parse(stdout);
      } catch (parseError) {
        throw kpLogger.logAndGetError(`Failed to parse command output: ${parseError}`);
      }
    }
    throw kpLogger.logAndGetError(`${this.binaryFilename} failed with code ${code}: ${stderr}`);
  }

  private async spawnCommand(
    args: string[],
    uri: vscode.Uri,
    stdin: string
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const spawnLogger = contextualizeLogger(uri);
      // <binary> <args> <document paths>...
      const command = `${this.binaryFilename} ${args.join(" ")} ${uri.fsPath}`;
      spawnLogger.debug(`Spawning "${command}"`);

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
        spawnLogger.debug(`${command} exited (time: ${getExecTimeText()}, code: ${code})`);
        if (code !== 0 && code !== 1) {
          spawnLogger.error(`${command} error output: ${stderr}`);
        }
        resolve({ code: code ?? 1, stdout, stderr });
      });

      child.on("error", (error) => {
        spawnLogger.error(
          `Failed to spawn ${command}: ${error.message} (time: ${getExecTimeText()})`
        );
        const errorMessage = `Failed to spawn ${command}: ${error.message} (time: ${getExecTimeText()})`;
        spawnLogger.error(errorMessage);
        reject(new Error(errorMessage));
      });

      // Write text content to stdin
      child.stdin.write(stdin);
      child.stdin.end();
      spawnLogger.debug(`Processed document with size ${stdin.length}.`);
    });
  }
}
