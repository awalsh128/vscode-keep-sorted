import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as path from "path";
import { readFileSync, writeFileSync } from "fs";
import { KeepSorted } from "../keepsorted";
import { EXT_WORKSPACE_DIR, TEST_WORKSPACE_DIR } from "./testing";
import chaiAsPromised from "chai-as-promised";

use(sinonChai);
use(chaiAsPromised);

/* eslint-disable @typescript-eslint/no-unused-expressions */

describe("KeepSorted", () => {
  const errorMessage = "test error message";
  const sortedText = `const alpha = 1;
const beta = 2;
const delta = 4;
`;
  const sortedTextBlock = `// keep-sorted start
${sortedText}// keep-sorted end
`;
  const unsortedTextBlock = `// keep-sorted start
const delta = 4;
const alpha = 1;
const beta = 2;
// keep-sorted end
`;
  const range = new vscode.Range(0, 0, 5, 0);

  let keepSorted: KeepSorted;
  let sandbox: sinon.SinonSandbox;

  function mockDocument(text = ""): vscode.TextDocument {
    return {
      uri: vscode.Uri.file(path.join(TEST_WORKSPACE_DIR, "sample.ts")),
      fsPath: path.join(TEST_WORKSPACE_DIR, "sample.ts"),
      fileName: path.join(TEST_WORKSPACE_DIR, "sample.ts"),
      isUntitled: false,
      languageId: "typescript",
      version: 1,
      isDirty: false,
      isClosed: false,
      eol: vscode.EndOfLine.LF,
      lineCount: 10,
      getText: sandbox.stub().returns(text),
      positionAt: sandbox.stub().callsFake((offset: number) => new vscode.Position(0, offset)),
    } as unknown as vscode.TextDocument;
  }

  function mockChildProcess(exitCode: number, stdout: string, stderr = "") {
    const spawnStub = sandbox.stub(childProcess, "spawn");
    const mockProcess = createMockChildProcess(exitCode, stdout, stderr);
    spawnStub.returns(mockProcess);
    return spawnStub;
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    keepSorted = new KeepSorted(EXT_WORKSPACE_DIR);
  });

  afterEach(() => {
    sandbox.restore();
  });

  [
    { platform: "linux", arch: "x64", expectedBinary: "keep-sorted-linux-amd64" },
    { platform: "darwin", arch: "x64", expectedBinary: "keep-sorted-darwin-amd64" },
    { platform: "darwin", arch: "arm64", expectedBinary: "keep-sorted-darwin-arm64" },
    { platform: "win32", arch: "x64", expectedBinary: "keep-sorted.exe" },
    // unsupported platform falls back to linux binary
    { platform: "freebsd", arch: "x64", expectedBinary: "keep-sorted-linux-amd64" },
  ].forEach(({ platform, arch, expectedBinary }) => {
    it(`spawns correct binary for ${platform} ${arch}`, function () {
      // Arrange
      this.timeout(5000);
      sandbox.stub(process, "platform").value(platform);
      sandbox.stub(process, "arch").value(arch);

      const spawnStub = mockChildProcess(0, "");
      // Re-create KeepSorted to pick up stubbed platform/arch
      keepSorted = new KeepSorted(EXT_WORKSPACE_DIR);

      // Act
      // Trigger binary spawning by calling lintDocument
      keepSorted.lintDocument(mockDocument());

      // Assert
      // Get the actual call and check just the binary name, not the full path
      const actualBinaryPath = spawnStub.getCall(0).args[0] as string;
      // Truncate the folder path; unable to use path library since this must work for Windows
      // paths too
      expect(actualBinaryPath.slice((EXT_WORKSPACE_DIR + "/bin/").length)).to.equal(expectedBinary);
    });
  });

  describe("lintDocument", () => {
    it("should return empty array when no issues found", async function () {
      // Arrange
      this.timeout(5000);

      // Act
      const result = await keepSorted.lintDocument(mockDocument(sortedTextBlock));

      // Assert
      expect(result).to.be.an("array").that.is.empty;
    });

    it("should return diagnostics for unsorted content", async function () {
      // Arrange
      this.timeout(5000);

      // Act
      const result = await keepSorted.lintDocument(mockDocument(unsortedTextBlock));

      // Assert
      expect(result).to.be.an("array").with.length.greaterThan(0);
      expect(result![0].message).to.include("out of order");
      expect(result![0].severity).to.equal(vscode.DiagnosticSeverity.Warning);
      expect(result![0].source).to.equal("keep-sorted");
    });

    it(`should throw error on non-zero/non-one exit code`, async function () {
      // Arrange
      this.timeout(5000);
      mockChildProcess(2, "", errorMessage);

      // Act & Assert
      expect(keepSorted.lintDocument(mockDocument())).to.be.rejectedWith(Error, errorMessage);
    });

    it("should lint test-workspace/sample.ts", async function () {
      this.timeout(10 * 1000); // Allow more time for binary execution

      // Open the sample file
      const sampleUri = vscode.Uri.file(path.join(TEST_WORKSPACE_DIR, "sample.ts"));
      const document = await vscode.workspace.openTextDocument(sampleUri);

      // Lint the document - should find unsorted blocks
      const diagnostics = await keepSorted.lintDocument(document);
      expect(diagnostics).to.be.an("array").with.length.greaterThan(0);
      expect(
        diagnostics?.map((d) => {
          return {
            source: d.source,
            start: d.range.start.line,
            end: d.range.end.line,
          };
        })
      ).is.deep.equal([
        // Diagnostics are start exclusive and end inclusive
        { source: "keep-sorted", start: 5, end: 9 },
        { source: "keep-sorted", start: 16, end: 20 },
      ]);
    });
  });

  describe("fixDocument", () => {
    let originalDocumentText = "";

    beforeEach(() => {
      originalDocumentText = readFileSync(path.join(TEST_WORKSPACE_DIR, "sample.ts"), "utf-8");
    });

    afterEach(() => {
      writeFileSync(path.join(TEST_WORKSPACE_DIR, "sample.ts"), originalDocumentText);
    });

    it("should throw error on non-zero/non-one exit code", async function () {
      // Arrange
      this.timeout(5000);
      mockChildProcess(2, "", errorMessage);

      // Act & Assert
      expect(keepSorted.fixDocument(mockDocument(), range)).to.be.rejectedWith(Error, errorMessage);
    });

    it("should fix unsorted content using real binary", async function () {
      // Arrange
      this.timeout(5000);

      // Act
      const result = await keepSorted.fixDocument(mockDocument(unsortedTextBlock), range);

      // Assert
      expect(result).to.be.equal(sortedText);
    });

    it("should throw an error when no fixes present", async function () {
      // Arrange
      this.timeout(5000);

      // Act & Assert
      expect(keepSorted.fixDocument(mockDocument(sortedTextBlock), range)).to.be.rejectedWith(
        Error,
        "No findings to fix"
      );
    });

    it("should fix test-workspace/sample.ts", async function () {
      this.timeout(10 * 1000); // Allow more time for binary execution

      // Open the sample file
      const sampleUri = vscode.Uri.file(path.join(TEST_WORKSPACE_DIR, "sample.ts"));
      const document = await vscode.workspace.openTextDocument(sampleUri);

      // Fix the entire document
      const result = await keepSorted.fixDocument(
        document,
        new vscode.Range(0, 0, document.lineCount, 0)
      );
      expect(result).to.equal(
        `const alpha = "alpha";
const beta = "beta";
const delta = "delta";
const zebra = "zebra";
`
      );
    });
  });
});

/** Creates a mock child process with event emitters for testing. */
function createMockChildProcess(exitCode: number, stdout: string, stderr: string) {
  const stdinMock = {
    write: sinon.stub(),
    end: sinon.stub(),
  };

  const stdoutMock = {
    on: sinon.stub().callsFake((event: string, callback: (data: Buffer) => void) => {
      if (event === "data" && stdout) {
        // Simulate async data emission
        setTimeout(() => callback(Buffer.from(stdout)), 0);
      }
    }),
  };

  const stderrMock = {
    on: sinon.stub().callsFake((event: string, callback: (data: Buffer) => void) => {
      if (event === "data" && stderr) {
        setTimeout(() => callback(Buffer.from(stderr)), 0);
      }
    }),
  };

  const processMock = {
    stdin: stdinMock,
    stdout: stdoutMock,
    stderr: stderrMock,
    on: sinon.stub().callsFake((event: string, callback: (code: number) => void) => {
      if (event === "close") {
        // Simulate async close event
        setTimeout(() => callback(exitCode), 0);
      }
    }),
  };

  return processMock as unknown as childProcess.ChildProcess;
}
