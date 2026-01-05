import * as vscode from "vscode";
import { spawnSync } from "child_process";
import * as path from "path";
import {
  EXT_NAME,
  logger,
  contextualizeLogger,
  logAndGetError,
  Benchmark,
} from "./instrumentation";
import * as crypto from "crypto";

/** Hash contents and return last 8 characters of the hash for brevity. */
function hash(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex")
    .slice(256 / 4 - 8); // = (256 bits / 4 bits per hex char) - 8 char
}

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

class KeepSortedRange {
  readonly start: number;
  readonly end: number;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }

  static fromVscode(range: vscode.Range): KeepSortedRange {
    const startOneBased = range.start.line + 1;
    let endOneBased = range.end.line;
    // If the provided end value appears to be zero-based and is less than the start,
    // normalize it to the start to ensure the CLI receives a valid inclusive range.
    if (endOneBased < startOneBased) {
      endOneBased = startOneBased;
    }
    return new KeepSortedRange(startOneBased, endOneBased);
  }

  toString(): string {
    return `${this.start}:${this.end}`;
  }

  toVscode(): vscode.Range {
    const startPos = new vscode.Position(this.start - 1, 0);
    const endPos = new vscode.Position(this.end, 0);
    return new vscode.Range(startPos, endPos);
  }
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
    const linuxBinary = "keep-sorted-linux-amd64";
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
        binaryPath = path.join(this.extensionPath, "bin", linuxBinary);
        break;
      default:
        // Fallback to linux binary for unsupported platforms
        logger.warn(`Unsupported platform ${process.platform}, falling back to linux binary`);
        binaryPath = path.join(this.extensionPath, "bin", linuxBinary);
    }
    logger.info(`Using keep-sorted binary at path: ${binaryPath}`);
    return {
      fullPath: binaryPath,
      filename: path.basename(binaryPath),
    };
  }

  getSingleReplacement(findings: KeepSortedFinding[]): string | null {
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
  fixDocument(
    document: vscode.TextDocument,
    range?: vscode.Range
  ): { content: string; range: vscode.Range } | null {
    const uri = document.uri;
    const documentText = document.getText();
    const findings = this.getFindings(uri, documentText, range);
    if (findings.length === 0) {
      // If linting the specified range returns no findings, attempt a whole-file fix as a
      // fallback. This handles cases where the CLI's range parsing may differ between
      // in-memory document representations and the on-disk file.
      const fixed = this.fixFileText(document);
      if (fixed === null) {
        // No findings to fix in either range or full-file
        throw new Error("No findings to fix");
      }
      return { content: fixed, range: new vscode.Range(0, 0, document.lineCount, 0) };
    }
    const singleReplacement = this.getSingleReplacement(findings);
    if (singleReplacement) {
      return {
        content: singleReplacement,
        range: new KeepSortedRange(findings[0].lines.start, findings[0].lines.end).toVscode(),
      };
    }
    // Fix the entire file to avoid async file writes that can lead to file corruption
    contextualizeLogger(uri).warn(
      `Multiple findings detected in document ${uri.fsPath}, ` +
        `falling back to full document fix to ensure consistency.`
    );
    const fixed = this.fixFileText(document);
    if (fixed === null) {
      throw new Error("No findings to fix");
    }
    return {
      content: fixed,
      range: new vscode.Range(0, 0, document.lineCount, 0),
    };
  }

  /**
   * Lints the provided document and returns diagnostics for any findings.
   *
   * @param uri The URI of the document to lint
   *
   * @returns An array of diagnostics
   *
   * @throws Error if the binary call fails
   */
  lintDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
    const kpLogger = contextualizeLogger(document.uri);
    const findings = this.getFindings(document.uri, document.getText());
    const diagnostics: vscode.Diagnostic[] = findings.map((finding) => {
      const kpRange = new KeepSortedRange(finding.lines.start, finding.lines.end);
      kpLogger.debug(
        `${this.binaryFilename} finding for lines ${kpRange.toString()}: ${finding.message}`
      );
      kpLogger.traceLazy(() => `Finding details:\n${JSON.stringify(finding, null, 2)}`);
      const diagnostic = new vscode.Diagnostic(
        kpRange.toVscode(),
        finding.message,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = EXT_NAME;
      diagnostic.code = {
        value: "docs",
        target: vscode.Uri.parse("https://github.com/google/keep-sorted/blob/main/README.md"),
      };
      return diagnostic;
    });

    kpLogger.info(`${this.binaryFilename} found ${diagnostics.length} replacements.`);
    return diagnostics;
  }

  private fixFileText(document: vscode.TextDocument): string | null {
    const kpLogger = contextualizeLogger(document.uri);
    const documentText = document.getText();
    const hashValue = hash(documentText);

    const { code, stdout, stderr } = this.spawnCommand(
      ["--mode", "fix", "-"],
      document.uri,
      documentText
    );
    if (code === 1) {
      kpLogger.info(
        `${this.binaryFilename} found no issues to fix for document with hash ${hashValue}`
      );
      return null;
    } else if (code === 0 && stdout) {
      // Issues found and fixed, return fixed content
      const newHash = hash(stdout);
      kpLogger.info(
        `${this.binaryFilename} fixed content with ` +
          `original hash ${hashValue}, and new hash: ${newHash}`
      );
      return stdout;
    }
    throw logAndGetError(kpLogger, `${this.binaryFilename} failed with code ${code}: ${stderr}`);
  }

  private getFindings(
    documentUri: vscode.Uri,
    documentText: string,
    range?: vscode.Range
  ): KeepSortedFinding[] {
    const kpLogger = contextualizeLogger(documentUri);
    const args = range
      ? ["--mode", "lint", "--lines", `${KeepSortedRange.fromVscode(range)}`, "-"]
      : ["--mode", "lint", "-"];
    const { code, stdout, stderr } = this.spawnCommand(args, documentUri, documentText);
    if (code === 0) {
      // No issues found
      return [];
    } else if (code === 1 && stdout) {
      // Issues found, parse JSON output
      try {
        const findings = JSON.parse(stdout);
        kpLogger.traceLazy(
          () => `${this.binaryFilename} findings: ${JSON.stringify(findings, null, 2)}`
        );
        return findings;
      } catch (parseError) {
        throw logAndGetError(kpLogger, `Failed to parse command output: ${parseError}`);
      }
    }
    throw logAndGetError(kpLogger, `${this.binaryFilename} failed with code ${code}: ${stderr}`);
  }

  // Usage: keep-sorted [flags] file1 [file2 ...]
  //
  // Note that '-' can be used to read from stdin, in which case the output is written to stdout.
  //
  // Flags:
  //       --color string              Whether to color debug output. One of "always", "never", or
  //                                   "auto" (default "auto")
  //       --default-options options   The options keep-sorted will use to sort. Per-block
  //                                   overrides apply on top of these options. Note: list options
  //                                   like prefix_order are not merged with per-block overrides.
  //                                   They are completely overridden. (default
  //                                   allow_yaml_lists=yes case=yes group=yes
  //                                   remove_duplicates=yes sticky_comments=yes)
  //       --lines line_ranges         Line ranges of the form "start:end". Only processes
  //                                   keep-sorted blocks that overlap with the given line ranges.
  //                                   Can only be used when fixing a single file. This flag can
  //                                   either be a comma-separated list of line ranges, or it can
  //                                   be specified multiple times on the command line to specify
  //                                   multiple line ranges. (default [])
  //       --mode mode                 Determines what mode to run this tool in.
  //                                   One of ["fix", "lint"] (default fix)
  //   -v, --verbose count             Log more verbosely
  //       --version                   Report the keep-sorted version.
  private spawnCommand(
    args: string[],
    uri: vscode.Uri,
    stdin: string
  ): { code: number; stdout: string; stderr: string } {
    const spawnLogger = contextualizeLogger(uri);
    // <binary> <args> <document paths>...
    const command = `${this.binaryFilename} ${args.join(" ")} <text from ${uri.fsPath}>`;
    spawnLogger.trace(`Spawning "${command}"`);

    const benchmark = new Benchmark();

    const result = spawnSync(this.binaryPath, args, {
      input: stdin,
      encoding: "utf8",
    });

    const code = result.status ?? 1;
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";

    spawnLogger.debug(`${command} exited (time: ${benchmark.getDeltaAsText()}, code: ${code})`);
    if (code !== 0 && code !== 1) {
      spawnLogger.error(`${command} error output: ${stderr}`);
    }

    if (result.error) {
      const errorMessage = `Failed to spawn ${command}: ${result.error.message} (time: ${benchmark.getDeltaAsText()})`;
      spawnLogger.error(errorMessage);
      throw new Error(errorMessage);
    }

    return { code, stdout, stderr };
  }
}
