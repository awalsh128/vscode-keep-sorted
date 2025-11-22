import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import { EXT_NAME, logger, contextualizeLogger, logAndGetError } from "./instrumentation";

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
    // Allow override for test/CI environments
    const override = process.env.KEEP_SORTED_BINARY;
    if (override) {
      this.binaryPath = path.resolve(override);
      this.binaryFilename = path.basename(this.binaryPath);
    } else {
      const binaryInfo = this.getBundledBinaryPath();
      this.binaryPath = binaryInfo.fullPath;
      this.binaryFilename = binaryInfo.filename;
    }
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
    logger.info(`Using keep-sorted binary at path: ${binaryPath}`);
    return {
      fullPath: binaryPath,
      filename: path.basename(binaryPath),
    };
  }

  async getSingleReplacement(
    document: vscode.TextDocument,
    findings: KeepSortedFinding[]
  ): Promise<string | null> {
    if (findings.length > 1) {
      return null;
    }
    const fixes = findings[0].fixes;
    if (fixes.length === 0) {
      return null;
    }
    if (fixes.length > 1) {
      return null;
    }
    if (fixes[0].replacements.length === 0) {
      return null;
    }
    if (fixes[0].replacements.length > 1) {
      return null;
    }
    return fixes[0].replacements[0].new_content;
  }

  /** Fixes the specified range in the document and returns the fixed content. */
  async fixDocument(document: vscode.TextDocument, range?: vscode.Range): Promise<string | null> {
    const findings = await this.getFindings(document, range);
    if (findings.length === 0) {
      // If linting the specified range returns no findings, attempt a whole-file fix as a
      // fallback. This handles cases where the CLI's range parsing may differ between
      // in-memory document representations and the on-disk file.
      const fixed = await this.fixFileText(document);
      if (fixed === null) {
        // No findings to fix in either range or full-file
        throw new Error("No findings to fix");
      }
      return fixed;
    }
    const singleReplacement = await this.getSingleReplacement(document, findings);
    if (singleReplacement) {
      return singleReplacement;
    }
    // Fix the entire file to avoid async file writes that can lead to file corruption
    return this.fixFileText(document);
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
      diagnostic.code = {
        value: "help",
        target: vscode.Uri.parse("https://github.com/google/keep-sorted/blob/main/README.md"),
      };
      return diagnostic;
    });

    kpLogger.info(`${this.binaryFilename} found ${diagnostics.length} replacements.`);
    return diagnostics;
  }

  private async fixFileText(document: vscode.TextDocument): Promise<string | null> {
    const kpLogger = contextualizeLogger(document);
    const { code, stdout, stderr } = await this.spawnCommand(
      ["--mode", "fix", "-"],
      document.uri,
      document.getText()
    );
    if (code === 0) {
      // No issues found
      return null;
    } else if (code === 1 && stdout) {
      // Issues found and fixed, return fixed content
      return stdout;
    }
    throw logAndGetError(kpLogger, `${this.binaryFilename} failed with code ${code}: ${stderr}`);
  }

  private async getFindings(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): Promise<KeepSortedFinding[]> {
    const kpLogger = contextualizeLogger(document);
    const args = range
      ? (() => {
          const startOneBased = range.start.line + 1;
          let endOneBased = range.end.line;
          // If the provided end value appears to be zero-based and is less than the start,
          // normalize it to the start to ensure the CLI receives a valid inclusive range.
          if (endOneBased < startOneBased) {
            endOneBased = startOneBased;
          }
          return ["--mode", "lint", "--lines", `${startOneBased}:${endOneBased}`, "-"];
        })()
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
        throw logAndGetError(kpLogger, `Failed to parse command output: ${parseError}`);
      }
    }
    throw logAndGetError(kpLogger, `${this.binaryFilename} failed with code ${code}: ${stderr}`);
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
