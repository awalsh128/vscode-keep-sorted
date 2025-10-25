import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import { FixFileCommandHandler, KeepSortedActionProvider } from "../actions";
import { KeepSorted } from "../keep_sorted";
import { KeepSortedDiagnostics } from "../instrumentation";

use(sinonChai);

/* eslint-disable @typescript-eslint/no-unused-expressions */

describe("actions", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("FixCommandHandler", () => {
    let handler: FixFileCommandHandler;
    let mockLinter: sinon.SinonStubbedInstance<KeepSorted>;
    let mockDiagnostics: sinon.SinonStubbedInstance<KeepSortedDiagnostics>;
    let mockDocument: vscode.TextDocument;
    let mockEditor: vscode.TextEditor;

    beforeEach(() => {
      mockLinter = {
        fixDocument: sandbox.stub(),
        lintDocument: sandbox.stub(),
      } as unknown as sinon.SinonStubbedInstance<KeepSorted>;

      mockDiagnostics = {
        set: sandbox.stub(),
        clear: sandbox.stub(),
        get: sandbox.stub(),
        dispose: sandbox.stub(),
      } as unknown as sinon.SinonStubbedInstance<KeepSortedDiagnostics>;

      mockDocument = {
        uri: vscode.Uri.file("/test/file.ts"),
        fsPath: "/test/file.ts",
        getText: sandbox.stub().returns("original content"),
        positionAt: sandbox.stub().callsFake((offset: number) => new vscode.Position(0, offset)),
      } as unknown as vscode.TextDocument;

      mockEditor = {
        document: mockDocument,
      } as vscode.TextEditor;

      handler = new FixFileCommandHandler(
        mockLinter as unknown as KeepSorted,
        mockDiagnostics as unknown as KeepSortedDiagnostics
      );
    });

    describe("command metadata", () => {
      it("should have correct command name", () => {
        expect(handler.commandName).to.equal("keep-sorted.fix");
      });

      it("should have static command with correct properties", () => {
        expect(FixFileCommandHandler.command.title).to.equal("Sort lines (keep-sorted)");
        expect(FixFileCommandHandler.command.command).to.equal("keep-sorted.fix");
        expect(FixFileCommandHandler.command.tooltip).to.equal(
          "Fix all lines in keep-sorted blocks of the current document"
        );
      });
    });

    describe("execute", () => {
      let applyEditStub: sinon.SinonStub;

      beforeEach(() => {
        applyEditStub = sandbox.stub(vscode.workspace, "applyEdit");
      });

      it("should return early when editor is undefined", async () => {
        await handler.execute(undefined);

        expect(mockLinter.fixDocument).not.to.have.been.called;
        expect(applyEditStub).not.to.have.been.called;
      });

      it("should apply fix successfully", async () => {
        const fixedContent = "fixed content";
        mockLinter.fixDocument.resolves(fixedContent);
        mockLinter.lintDocument.resolves([]);
        applyEditStub.resolves(true);

        await handler.execute(mockEditor);

        expect(mockLinter.fixDocument).to.have.been.calledOnceWith(mockDocument);
        expect(applyEditStub).to.have.been.calledOnce;
        expect(mockDiagnostics.clear).to.have.been.calledOnceWith(mockDocument);
        expect(mockLinter.lintDocument).to.have.been.calledOnceWith(mockDocument);
      });

      it("should handle fix returning no content", async () => {
        mockLinter.fixDocument.resolves(undefined);

        await handler.execute(mockEditor);

        expect(mockLinter.fixDocument).to.have.been.calledOnce;
        expect(applyEditStub).not.to.have.been.called;
        expect(mockDiagnostics.clear).not.to.have.been.called;
      });

      it("should handle fix returning null", async () => {
        mockLinter.fixDocument.resolves(undefined);

        await handler.execute(mockEditor);

        expect(mockLinter.fixDocument).to.have.been.calledOnce;
        expect(applyEditStub).not.to.have.been.called;
      });

      it("should handle failed edit application", async () => {
        mockLinter.fixDocument.resolves("fixed content");
        applyEditStub.resolves(false);

        await handler.execute(mockEditor);

        expect(applyEditStub).to.have.been.calledOnce;
        expect(mockDiagnostics.clear).not.to.have.been.called;
      });

      it("should re-lint after successful fix", async () => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "Test diagnostic",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = "keep-sorted";

        mockLinter.fixDocument.resolves("fixed content");
        mockLinter.lintDocument.resolves([diagnostic]);
        applyEditStub.resolves(true);

        await handler.execute(mockEditor);

        expect(mockLinter.lintDocument).to.have.been.calledOnceWith(mockDocument);
        expect(mockDiagnostics.set).to.have.been.calledOnceWith(mockDocument, [diagnostic]);
      });

      it("should handle lint results being undefined after fix", async () => {
        mockLinter.fixDocument.resolves("fixed content");
        mockLinter.lintDocument.resolves(undefined);
        applyEditStub.resolves(true);

        await handler.execute(mockEditor);

        expect(mockLinter.lintDocument).to.have.been.calledOnce;
        expect(mockDiagnostics.set).not.to.have.been.called;
      });

      it("should create correct workspace edit", async () => {
        const fixedContent = "fixed content";
        mockLinter.fixDocument.resolves(fixedContent);
        mockLinter.lintDocument.resolves([]);
        applyEditStub.resolves(true);

        await handler.execute(mockEditor);

        const editArg = applyEditStub.getCall(0).args[0] as vscode.WorkspaceEdit;
        expect(editArg).to.be.instanceOf(vscode.WorkspaceEdit);
      });
    });
  });

  describe("KeepSortedActionProvider", () => {
    let provider: KeepSortedActionProvider;
    let mockDiagnostics: sinon.SinonStubbedInstance<KeepSortedDiagnostics>;
    let mockDocument: vscode.TextDocument;
    let mockRange: vscode.Range;

    beforeEach(() => {
      mockDiagnostics = {
        get: sandbox.stub(),
        set: sandbox.stub(),
        clear: sandbox.stub(),
        dispose: sandbox.stub(),
      } as unknown as sinon.SinonStubbedInstance<KeepSortedDiagnostics>;

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

      mockRange = new vscode.Range(0, 0, 0, 10);

      provider = new KeepSortedActionProvider(mockDiagnostics as unknown as KeepSortedDiagnostics);
    });

    describe("actionKinds", () => {
      it("should have QuickFix action kind", () => {
        expect(KeepSortedActionProvider.actionKinds).to.deep.equal([
          vscode.CodeActionKind.QuickFix,
        ]);
      });
    });

    describe("provideCodeActions", () => {
      it("should return undefined when no diagnostics exist", () => {
        mockDiagnostics.get.returns([]);

        const result = provider.provideCodeActions(mockDocument, mockRange);

        expect(result).to.be.undefined;
        expect(mockDiagnostics.get).to.have.been.calledOnceWith(mockDocument);
      });

      it("should return undefined when diagnostics.get returns undefined", () => {
        mockDiagnostics.get.returns(undefined);

        const result = provider.provideCodeActions(mockDocument, mockRange);

        expect(result).to.be.undefined;
      });

      it("should return fix action when diagnostics exist", () => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "Test diagnostic",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = "keep-sorted";
        mockDiagnostics.get.returns([diagnostic]);

        const result = provider.provideCodeActions(mockDocument, mockRange);

        expect(result).to.have.length(1);
        expect(result![0].title).to.equal("Sort lines (keep-sorted)");
        expect(result![0].kind).to.equal(vscode.CodeActionKind.QuickFix);
        expect(result![0].command).to.deep.equal(FixFileCommandHandler.command);
        expect(result![0].diagnostics).to.deep.equal([diagnostic]);
      });

      it("should return action with multiple diagnostics", () => {
        const diagnostic1 = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "First diagnostic",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic1.source = "keep-sorted";

        const diagnostic2 = new vscode.Diagnostic(
          new vscode.Range(1, 0, 1, 10),
          "Second diagnostic",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic2.source = "keep-sorted";

        mockDiagnostics.get.returns([diagnostic1, diagnostic2]);

        const result = provider.provideCodeActions(mockDocument, mockRange);

        expect(result).to.have.length(1);
        expect(result![0].diagnostics).to.have.length(2);
      });

      it("should use FixCommandHandler.command for action command", () => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          "Test",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = "keep-sorted";
        mockDiagnostics.get.returns([diagnostic]);

        const result = provider.provideCodeActions(mockDocument, mockRange);

        expect(result![0].command).to.equal(FixFileCommandHandler.command);
      });
    });
  });
});
