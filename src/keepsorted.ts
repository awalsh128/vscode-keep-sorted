import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { oneLine } from "./common";
import { contextualizeLogger, extensionId, logAndGetError, logger } from "./instrumentation";
import { bundledBinaryPath, KeepSortedBinary, KeepSortedFinding } from "./keepsortedbin";

/** Hash contents and return last 8 characters of the hash for brevity. */
function hash(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex")
    .slice(256 / 4 - 8); // = (256 bits / 4 bits per hex char) - 8 char
}

export type { KeepSortedFinding };

class KeepSortedRange {
  readonly start: number;
  readonly end: number;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
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
  private readonly binary: KeepSortedBinary;
  private readonly binaryFilename: string;

  constructor(extensionPath: string) {
    // Allow override for test/CI environments
    const override = process.env.KEEP_SORTED_BINARY;
    let binaryPath: string;
    if (override) {
      binaryPath = path.resolve(override);
    } else {
      if (!["win32", "darwin", "linux"].includes(process.platform)) {
        logger.warn(`Unsupported platform ${process.platform}, falling back to linux binary`);
      }
      binaryPath = bundledBinaryPath(extensionPath);
      logger.info(`Using keep-sorted binary at path: ${binaryPath}`);
    }
    this.binary = new KeepSortedBinary(binaryPath);
    this.binaryFilename = this.binary.filename;
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

  /**
   * Fixes all keep-sorted blocks in the document and returns the fixed content with the range it
   * replaces, or null if the document has no findings.
   */
  fixDocument(document: vscode.TextDocument): { content: string; range: vscode.Range } | null {
    const uri = document.uri;
    const findings = this.getFindings(uri, document.getText());
    if (findings.length === 0) {
      return null;
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
   * @param document The document to lint
   *
   * @returns An array of diagnostics
   *
   * @throws Error if the binary call fails
   */
  lintDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
    return this.lintText(document.uri, document.getText());
  }

  /**
   * Lints file content that is not open as a document, such as a file read from disk.
   *
   * @param uri The URI the content belongs to
   * @param text The content to lint
   *
   * @returns An array of diagnostics
   *
   * @throws Error if the binary call fails
   */
  lintText(uri: vscode.Uri, text: string): vscode.Diagnostic[] {
    const kpLogger = contextualizeLogger(uri);
    const findings = this.getFindings(uri, text);
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
      diagnostic.source = extensionId.name;
      diagnostic.code = {
        value: "docs",
        target: vscode.Uri.parse("https://github.com/google/keep-sorted/blob/main/README.md"),
      };
      return diagnostic;
    });

    kpLogger.debug(`${this.binaryFilename} found ${diagnostics.length} replacements.`);
    return diagnostics;
  }

  private fixFileText(document: vscode.TextDocument): string | null {
    const kpLogger = contextualizeLogger(document.uri);
    const documentText = document.getText();
    const hashValue = hash(documentText);
    const fixed = this.binary.fix(documentText, document.uri.fsPath, kpLogger);
    if (fixed === null) {
      kpLogger.info(
        `${this.binaryFilename} found no issues to fix for document with hash ${hashValue}`
      );
      return null;
    }
    kpLogger.info(oneLine`
      ${this.binaryFilename} fixed content with original hash ${hashValue}, and new hash:
      ${hash(fixed)}`);
    return fixed;
  }

  private getFindings(documentUri: vscode.Uri, documentText: string): KeepSortedFinding[] {
    const kpLogger = contextualizeLogger(documentUri);
    try {
      const findings = this.binary.lint(documentText, documentUri.fsPath, kpLogger);
      kpLogger.traceLazy(
        () => `${this.binaryFilename} findings: ${JSON.stringify(findings, null, 2)}`
      );
      return findings;
    } catch (err: Error | unknown) {
      // The runner already logged the failure with this document's context.
      throw err instanceof Error ? err : logAndGetError(kpLogger, err);
    }
  }
}
