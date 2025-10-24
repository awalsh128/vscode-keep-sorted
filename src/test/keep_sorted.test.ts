import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import * as childProcess from "child_process";
import { KeepSorted, KeepSortedFinding } from "../keep_sorted";
import { ErrorTracker } from "../instrumentation";

use(sinonChai);

/* eslint-disable @typescript-eslint/no-unused-expressions */

describe("keep_sorted", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("KeepSorted", () => {
    let keepSorted: KeepSorted;
    let mockErrorTracker: sinon.SinonStubbedInstance<ErrorTracker>;
    let mockDocument: vscode.TextDocument;
    let spawnStub: sinon.SinonStub;

    beforeEach(() => {
      mockErrorTracker = {
        recordSuccess: sandbox.stub(),
        recordError: sandbox.stub().resolves(true),
        isExtensionDisabled: sandbox.stub().returns(false),
        dispose: sandbox.stub(),
        onExtensionDisabled: {} as sinon.SinonStubbedMember<
          typeof mockErrorTracker.onExtensionDisabled
        >,
      } as unknown as sinon.SinonStubbedInstance<ErrorTracker>;

      mockDocument = {
        uri: vscode.Uri.file("/test/file.ts"),
        fsPath: "/test/file.ts",
        fileName: "/test/file.ts",
        isUntitled: false,
        languageId: "typescript",
        version: 1,
        isDirty: false,
        isClosed: false,
        eol: vscode.EndOfLine.LF,
        lineCount: 10,
        getText: sandbox.stub().returns("test content\n"),
        positionAt: sandbox.stub().callsFake((offset: number) => new vscode.Position(0, offset)),
      } as unknown as vscode.TextDocument;

      keepSorted = new KeepSorted(
        "/fake/extension/path",
        mockErrorTracker as unknown as ErrorTracker
      );

      // Stub child_process.spawn
      spawnStub = sandbox.stub(childProcess, "spawn");
    });

    describe("getBundledBinaryPath", () => {
      it("should memoize binary path", async () => {
        // Mock a successful fix to trigger binary path resolution
        const mockProcess = createMockChildProcess(0, "fixed content", "");
        spawnStub.returns(mockProcess);

        await keepSorted.fixDocument(mockDocument);
        await keepSorted.fixDocument(mockDocument);

        // Binary path should be determined once (memoized)
        expect(spawnStub).to.have.been.calledTwice;
      });
    });

    describe("fixDocument", () => {
      it("should return fixed content on success", async () => {
        const fixedContent = "fixed content";
        const mockProcess = createMockChildProcess(0, fixedContent, "");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.fixDocument(mockDocument);

        expect(result).to.equal(fixedContent);
        expect(mockErrorTracker.recordSuccess).to.have.been.called;
      });

      it("should handle exit code 1 (issues found but fixed)", async () => {
        const fixedContent = "fixed content with changes";
        const mockProcess = createMockChildProcess(1, fixedContent, "");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.fixDocument(mockDocument);

        expect(result).to.equal(fixedContent);
        expect(mockErrorTracker.recordSuccess).to.have.been.called;
      });

      it("should reject on non-zero/non-one exit code", async () => {
        const mockProcess = createMockChildProcess(2, "", "binary error");
        spawnStub.returns(mockProcess);

        try {
          await keepSorted.fixDocument(mockDocument);
          expect.fail("Should have rejected");
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.include("Keep-sorted fix failed");
          expect(mockErrorTracker.recordError).to.have.been.called;
        }
      });

      it("should return undefined when error tracker disables extension", async () => {
        mockErrorTracker.recordError.resolves(false); // Extension disabled
        const mockProcess = createMockChildProcess(2, "", "binary error");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.fixDocument(mockDocument);

        expect(result).to.be.undefined;
      });

      it("should write document content to stdin", async () => {
        const mockProcess = createMockChildProcess(0, "fixed", "");
        spawnStub.returns(mockProcess);

        await keepSorted.fixDocument(mockDocument);

        expect(mockProcess.stdin).to.exist;
        expect(mockProcess.stdin!.write).to.have.been.calledWith("test content\n");
        expect(mockProcess.stdin!.end).to.have.been.called;
      });
    });

    describe("lintDocument", () => {
      it("should return empty array when no issues found", async () => {
        const mockProcess = createMockChildProcess(0, "", "");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.lintDocument(mockDocument);

        expect(result).to.be.an("array").that.is.empty;
        expect(mockErrorTracker.recordSuccess).to.have.been.called;
      });

      it("should parse JSON findings and create diagnostics", async () => {
        const findings: KeepSortedFinding[] = [
          {
            path: "/test/file.ts",
            lines: { start: 1, end: 3 },
            message: "Lines not sorted",
            fixes: [
              {
                replacements: [
                  {
                    lines: { start: 1, end: 3 },
                    new_content: "sorted content",
                  },
                ],
              },
            ],
          },
        ];
        const mockProcess = createMockChildProcess(1, JSON.stringify(findings), "");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.lintDocument(mockDocument);

        expect(result).to.be.an("array").with.length(1);
        expect(result![0].message).to.equal("Lines not sorted");
        expect(result![0].severity).to.equal(vscode.DiagnosticSeverity.Warning);
        expect(result![0].source).to.equal("keep-sorted");
        expect(mockErrorTracker.recordSuccess).to.have.been.called;
      });

      it("should handle multiple findings", async () => {
        const findings: KeepSortedFinding[] = [
          {
            path: "/test/file.ts",
            lines: { start: 1, end: 3 },
            message: "First issue",
            fixes: [
              {
                replacements: [{ lines: { start: 1, end: 3 }, new_content: "fix1" }],
              },
            ],
          },
          {
            path: "/test/file.ts",
            lines: { start: 5, end: 7 },
            message: "Second issue",
            fixes: [
              {
                replacements: [{ lines: { start: 5, end: 7 }, new_content: "fix2" }],
              },
            ],
          },
        ];
        const mockProcess = createMockChildProcess(1, JSON.stringify(findings), "");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.lintDocument(mockDocument);

        expect(result).to.have.length(2);
      });

      it("should handle JSON parse errors", async () => {
        const mockProcess = createMockChildProcess(1, "invalid json", "");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.lintDocument(mockDocument);

        expect(result).to.be.undefined;
        expect(mockErrorTracker.recordError).to.have.been.called;
      });

      it("should handle non-array findings", async () => {
        const mockProcess = createMockChildProcess(1, '{"not": "an array"}', "");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.lintDocument(mockDocument);

        expect(result).to.be.undefined;
        expect(mockErrorTracker.recordError).to.have.been.called;
      });

      it("should handle binary errors", async () => {
        const mockProcess = createMockChildProcess(2, "", "binary crashed");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.lintDocument(mockDocument);

        expect(result).to.be.undefined;
        expect(mockErrorTracker.recordError).to.have.been.called;
      });

      it("should create correct diagnostic ranges", async () => {
        const findings: KeepSortedFinding[] = [
          {
            path: "/test/file.ts",
            lines: { start: 5, end: 10 },
            message: "Test",
            fixes: [
              {
                replacements: [{ lines: { start: 5, end: 10 }, new_content: "fix" }],
              },
            ],
          },
        ];
        const mockProcess = createMockChildProcess(1, JSON.stringify(findings), "");
        spawnStub.returns(mockProcess);

        const result = await keepSorted.lintDocument(mockDocument);

        // Lines are 1-indexed in findings, 0-indexed in VS Code
        expect(result![0].range.start.line).to.equal(4); // 5 - 1
        expect(result![0].range.end.line).to.equal(10);
      });
    });
  });
});

/**
 * Creates a mock child process with event emitters for testing.
 */
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
