import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import {
  KeepSortedDiagnostics,
  ErrorTracker,
  ExtensionDisabledInfo,
  createGithubIssueAsUrl,
} from "../instrumentation";

use(sinonChai);

/* eslint-disable @typescript-eslint/no-unused-expressions */

describe("instrumentation", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("KeepSortedDiagnostics", () => {
    let diagnostics: KeepSortedDiagnostics;
    let mockDiagnosticCollection: sinon.SinonStubbedInstance<vscode.DiagnosticCollection>;
    let mockDocument: vscode.TextDocument;

    beforeEach(() => {
      mockDiagnosticCollection = {
        set: sandbox.stub(),
        delete: sandbox.stub(),
        get: sandbox.stub(),
        dispose: sandbox.stub(),
        clear: sandbox.stub(),
        forEach: sandbox.stub(),
        has: sandbox.stub(),
        name: "keep-sorted",
      } as unknown as sinon.SinonStubbedInstance<vscode.DiagnosticCollection>;

      sandbox
        .stub(vscode.languages, "createDiagnosticCollection")
        .returns(mockDiagnosticCollection as unknown as vscode.DiagnosticCollection);

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
      } as unknown as vscode.TextDocument;

      diagnostics = new KeepSortedDiagnostics();
    });

    afterEach(() => {
      diagnostics.dispose();
    });

    it("should have the correct source", () => {
      expect(KeepSortedDiagnostics.source).to.equal("keep-sorted");
    });

    describe("set", () => {
      it("should set diagnostics with correct source", () => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "Test error",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = "keep-sorted";

        diagnostics.set(mockDocument, [diagnostic]);

        expect(mockDiagnosticCollection.set).to.have.been.calledOnce;
        expect(mockDiagnosticCollection.set).to.have.been.calledWith(mockDocument.uri, [
          diagnostic,
        ]);
      });

      it("should filter out diagnostics from other sources", () => {
        const keepSortedDiagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "Keep sorted error",
          vscode.DiagnosticSeverity.Warning
        );
        keepSortedDiagnostic.source = "keep-sorted";

        const otherDiagnostic = new vscode.Diagnostic(
          new vscode.Range(1, 0, 1, 10),
          "Other error",
          vscode.DiagnosticSeverity.Error
        );
        otherDiagnostic.source = "other-source";

        diagnostics.set(mockDocument, [keepSortedDiagnostic, otherDiagnostic]);

        expect(mockDiagnosticCollection.set).to.have.been.calledOnce;
        expect(mockDiagnosticCollection.set).to.have.been.calledWith(mockDocument.uri, [
          keepSortedDiagnostic,
        ]);
      });

      it("should not set diagnostics when all are filtered out", () => {
        const otherDiagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "Other error",
          vscode.DiagnosticSeverity.Error
        );
        otherDiagnostic.source = "other-source";

        diagnostics.set(mockDocument, [otherDiagnostic]);

        expect(mockDiagnosticCollection.set).not.to.have.been.called;
      });

      it("should handle empty diagnostics array", () => {
        diagnostics.set(mockDocument, []);

        expect(mockDiagnosticCollection.set).not.to.have.been.called;
      });
    });

    describe("clear", () => {
      it("should clear diagnostics for document", () => {
        diagnostics.clear(mockDocument);

        expect(mockDiagnosticCollection.delete).to.have.been.calledOnce;
        expect(mockDiagnosticCollection.delete).to.have.been.calledWith(mockDocument.uri);
      });
    });

    describe("get", () => {
      it("should retrieve diagnostics for document", () => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "Test error",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = "keep-sorted";

        mockDiagnosticCollection.get.returns([diagnostic]);

        const result = diagnostics.get(mockDocument);

        expect(mockDiagnosticCollection.get).to.have.been.calledOnce;
        expect(mockDiagnosticCollection.get).to.have.been.calledWith(mockDocument.uri);
        expect(result).to.deep.equal([diagnostic]);
      });

      it("should filter diagnostics by source", () => {
        const keepSortedDiagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "Keep sorted error",
          vscode.DiagnosticSeverity.Warning
        );
        keepSortedDiagnostic.source = "keep-sorted";

        const otherDiagnostic = new vscode.Diagnostic(
          new vscode.Range(1, 0, 1, 10),
          "Other error",
          vscode.DiagnosticSeverity.Error
        );
        otherDiagnostic.source = "other-source";

        mockDiagnosticCollection.get.returns([keepSortedDiagnostic, otherDiagnostic]);

        const result = diagnostics.get(mockDocument);

        expect(result).to.deep.equal([keepSortedDiagnostic]);
      });

      it("should return undefined when no diagnostics exist", () => {
        mockDiagnosticCollection.get.returns(undefined);

        const result = diagnostics.get(mockDocument);

        expect(result).to.be.undefined;
      });
    });

    describe("dispose", () => {
      it("should dispose the diagnostic collection", () => {
        diagnostics.dispose();

        expect(mockDiagnosticCollection.dispose).to.have.been.calledOnce;
      });
    });
  });

  describe("ErrorTracker", () => {
    let errorTracker: ErrorTracker;

    beforeEach(() => {
      errorTracker = new ErrorTracker();
    });

    afterEach(() => {
      errorTracker.dispose();
    });

    describe("recordSuccess", () => {
      it("should reset consecutive error counter", async () => {
        const error = new Error("Test error");
        await errorTracker.recordError(error);
        await errorTracker.recordError(error);

        errorTracker.recordSuccess();

        // Should be able to record more errors without disabling
        const result = await errorTracker.recordError(error);
        expect(result).to.be.true;
        expect(errorTracker.isExtensionDisabled()).to.be.false;
      });

      it("should do nothing when counter is already zero", () => {
        expect(() => errorTracker.recordSuccess()).not.to.throw();
        expect(errorTracker.isExtensionDisabled()).to.be.false;
      });
    });

    describe("recordError", () => {
      it("should return true when below threshold", async () => {
        const error = new Error("Test error");
        const result = await errorTracker.recordError(error);

        expect(result).to.be.true;
        expect(errorTracker.isExtensionDisabled()).to.be.false;
      });

      it("should disable extension after max consecutive errors", async () => {
        const error = new Error("Test error");

        // Record errors up to threshold (5)
        for (let i = 0; i < 4; i++) {
          const result = await errorTracker.recordError(error);
          expect(result).to.be.true;
        }

        // Fifth error should disable
        const result = await errorTracker.recordError(error);
        expect(result).to.be.false;
        expect(errorTracker.isExtensionDisabled()).to.be.true;
      });

      it("should return false when already disabled", async () => {
        const error = new Error("Test error");

        // Disable the tracker
        for (let i = 0; i < 5; i++) {
          await errorTracker.recordError(error);
        }

        // Subsequent errors should return false
        const result = await errorTracker.recordError(new Error("Another error"));
        expect(result).to.be.false;
      });

      it("should emit onExtensionDisabled event when disabled", async () => {
        const error = new Error("Test error");
        let firedEvent: ExtensionDisabledInfo | undefined;

        errorTracker.onExtensionDisabled((info) => {
          firedEvent = info;
        });

        // Trigger disable
        for (let i = 0; i < 5; i++) {
          await errorTracker.recordError(error);
        }

        expect(firedEvent).to.exist;
        expect(firedEvent?.errors).to.have.length(5);
        expect(firedEvent?.logSummary).to.include("Keep-Sorted Extension Error Report");
        expect(firedEvent?.logSummary).to.include("Test error");
      });

      it("should build log summary with correct information", async () => {
        const error1 = new Error("First error");
        const error2 = new Error("Second error");
        let firedEvent: ExtensionDisabledInfo | undefined;

        errorTracker.onExtensionDisabled((info) => {
          firedEvent = info;
        });

        // Trigger disable with multiple errors
        await errorTracker.recordError(error1);
        await errorTracker.recordError(error2);
        await errorTracker.recordError(error1);
        await errorTracker.recordError(error2);
        await errorTracker.recordError(error1);

        expect(firedEvent?.logSummary).to.include("First error");
        expect(firedEvent?.logSummary).to.include("Second error");
        expect(firedEvent?.logSummary).to.include("VS Code Version");
        expect(firedEvent?.logSummary).to.include("Node Version");
        expect(firedEvent?.logSummary).to.include("Platform");
        expect(firedEvent?.logSummary).to.include("Timestamp");
      });
    });

    describe("isExtensionDisabled", () => {
      it("should return false initially", () => {
        expect(errorTracker.isExtensionDisabled()).to.be.false;
      });

      it("should return true after disabling", async () => {
        const error = new Error("Test error");

        for (let i = 0; i < 5; i++) {
          await errorTracker.recordError(error);
        }

        expect(errorTracker.isExtensionDisabled()).to.be.true;
      });
    });

    describe("dispose", () => {
      it("should dispose the event emitter", () => {
        expect(() => errorTracker.dispose()).not.to.throw();
      });
    });
  });

  describe("createGithubIssueAsUrl", () => {
    it("should create a valid GitHub issue URL", async () => {
      const error1 = new Error("Test error 1");
      const error2 = new Error("Test error 2");
      const info: ExtensionDisabledInfo = {
        errors: [error1, error2],
        logSummary: "Test log summary with error details",
      };

      const url = await createGithubIssueAsUrl(info);

      expect(url).to.include("https://github.com/awalsh128/vscode-keep-sorted/issues/new");
      expect(url).to.include("template=bug_report.md");
      expect(url).to.include("title=");
      expect(url).to.include("body=");
      expect(decodeURIComponent(url)).to.include("[BUG] Test error 2");
      expect(decodeURIComponent(url)).to.include("Test log summary with error details");
      expect(decodeURIComponent(url)).to.include("2 consecutive errors");
    });

    it("should encode special characters in URL", async () => {
      const error = new Error("Error with special chars: & = ?");
      const info: ExtensionDisabledInfo = {
        errors: [error],
        logSummary: "Log with special chars: & = ?",
      };

      const url = await createGithubIssueAsUrl(info);

      // Should be properly URL encoded
      expect(url).not.to.include("&");
      expect(url).not.to.include("=");
      expect(url).not.to.include("?");
      expect(url).to.include("%");
    });

    it("should include error count in body", async () => {
      const errors = [new Error("Error 1"), new Error("Error 2"), new Error("Error 3")];
      const info: ExtensionDisabledInfo = {
        errors,
        logSummary: "Multiple errors occurred",
      };

      const url = await createGithubIssueAsUrl(info);
      const decodedUrl = decodeURIComponent(url);

      expect(decodedUrl).to.include("3 consecutive errors");
    });

    it("should use last error message in title", async () => {
      const error1 = new Error("First error");
      const error2 = new Error("Last error");
      const info: ExtensionDisabledInfo = {
        errors: [error1, error2],
        logSummary: "Error log",
      };

      const url = await createGithubIssueAsUrl(info);
      const decodedUrl = decodeURIComponent(url);

      expect(decodedUrl).to.include("[BUG] Last error");
      expect(decodedUrl).not.to.include("[BUG] First error");
    });
  });
});
