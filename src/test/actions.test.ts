import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import { executeFixAction, FIX_COMMAND, KeepSortedActionProvider } from "../actions";
import { KeepSorted } from "../keepSorted";
import { ErrorTracker, EXT_NAME } from "../instrumentation";

use(sinonChai);

// Constants for test values that are irrelevant to test behavior
const ANY_FILE_PATH = "/test/file.ts";
const UNSORTED_CONTENT = `// keep-sorted start
const zebra = "zebra";
const alpha = "alpha";
const beta = "beta";
// keep-sorted end`;
const ANY_DIAGNOSTIC_MESSAGE = "Test diagnostic";
const ANY_SHORT_MESSAGE = "Test";
const FIRST_DIAGNOSTIC_MESSAGE = "First diagnostic";
const SECOND_DIAGNOSTIC_MESSAGE = "Second diagnostic";
const KEEP_SORTED_SOURCE = "keep-sorted";

describe("actions", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("executeFixAction", () => {
    let realLinter: KeepSorted;
    let realDiagnostics: vscode.DiagnosticCollection;
    let mockDocument: vscode.TextDocument;
    let mockRange: vscode.Range;

    beforeEach(() => {
      // Arrange - Use real objects
      const errorTracker = new ErrorTracker();
      realLinter = new KeepSorted(process.cwd(), errorTracker);
      realDiagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);

      mockDocument = {
        uri: vscode.Uri.file(ANY_FILE_PATH),
        fsPath: ANY_FILE_PATH,
        getText: sandbox.stub().returns(UNSORTED_CONTENT),
        positionAt: sandbox.stub().callsFake((offset: number) => new vscode.Position(0, offset)),
      } as unknown as vscode.TextDocument;

      mockRange = new vscode.Range(0, 0, 0, 10);
    });

    afterEach(() => {
      realDiagnostics.dispose();
    });

    describe("execute", () => {
      let applyEditStub: sinon.SinonStub;

      beforeEach(() => {
        applyEditStub = sandbox.stub(vscode.workspace, "applyEdit");
      });

      it("should process document with unsorted content", async () => {
        // Arrange
        applyEditStub.resolves(true);

        // Act
        await executeFixAction({
          linter: realLinter,
          diagnostics: realDiagnostics,
          document: mockDocument,
          range: mockRange,
        });

        // Assert - Should attempt to apply edits for unsorted content
        void expect(applyEditStub).to.have.been.calledOnce;
      });

      it("should create workspace edit when content needs fixing", async () => {
        // Arrange
        applyEditStub.resolves(true);

        // Act
        const edit = await executeFixAction({
          linter: realLinter,
          diagnostics: realDiagnostics,
          document: mockDocument,
          range: mockRange,
        });

        // Assert
        void expect(applyEditStub).to.have.been.calledOnce;
        expect(edit).to.be.instanceOf(vscode.WorkspaceEdit);
      });

      it("should update diagnostics after successful fix", async () => {
        // Arrange
        applyEditStub.resolves(true);

        // Act
        await executeFixAction({
          linter: realLinter,
          diagnostics: realDiagnostics,
          document: mockDocument,
          range: mockRange,
        });

        // Assert
        void expect(realDiagnostics.get(mockDocument.uri)).to.be.empty;
      });
    });
  });

  describe("KeepSortedActionProvider", () => {
    let provider: KeepSortedActionProvider;
    let realLinter: KeepSorted;
    let realDiagnostics: vscode.DiagnosticCollection;
    let mockDocument: vscode.TextDocument;
    let mockRange: vscode.Range;

    beforeEach(() => {
      // Arrange - Use real objects
      const errorTracker = new ErrorTracker();
      realLinter = new KeepSorted(process.cwd(), errorTracker);
      realDiagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);

      mockDocument = {
        uri: vscode.Uri.file(ANY_FILE_PATH),
        fsPath: ANY_FILE_PATH,
        fileName: ANY_FILE_PATH,
        isUntitled: false,
        languageId: "typescript",
        version: 1,
        isDirty: false,
        isClosed: false,
        eol: vscode.EndOfLine.LF,
        lineCount: 10,
      } as unknown as vscode.TextDocument;

      mockRange = new vscode.Range(0, 0, 0, 10);

      provider = new KeepSortedActionProvider(realLinter, realDiagnostics);
    });

    afterEach(() => {
      realDiagnostics.dispose();
    });

    describe("actionKinds", () => {
      it("should have QuickFix action kind", () => {
        // Arrange - No setup needed

        // Act
        const kinds = KeepSortedActionProvider.actionKinds;

        // Assert
        expect(kinds).to.deep.equal([vscode.CodeActionKind.QuickFix]);
      });
    });

    describe("provideCodeActions", () => {
      it("should return empty array when no diagnostics exist", () => {
        // Arrange - Real diagnostics collection is empty by default

        // Act
        const result = provider.provideCodeActions(mockDocument, mockRange);

        // Assert
        void expect(result).to.be.an("array").that.is.empty;
      });

      it("should return empty array when diagnostics.get returns empty array", () => {
        // Arrange
        realDiagnostics.set(mockDocument.uri, []);

        // Act
        const result = provider.provideCodeActions(mockDocument, mockRange);

        // Assert
        void expect(result).to.be.an("array").that.is.empty;
      });

      it("should return fix actions when diagnostics exist", () => {
        // Arrange
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          ANY_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = KEEP_SORTED_SOURCE;
        realDiagnostics.set(mockDocument.uri, [diagnostic]);

        // Act
        const result = provider.provideCodeActions(mockDocument, mockRange);

        // Assert
        expect(result).to.have.length(1);
        expect(result![0].title).to.equal(FIX_COMMAND.title);
        expect(result![0].kind).to.equal(vscode.CodeActionKind.QuickFix);
        expect(result![0].command!.command).to.equal(FIX_COMMAND.command);
        expect(result![0].command!.title).to.equal(FIX_COMMAND.title);
        expect(result![0].command!.tooltip).to.equal(FIX_COMMAND.tooltip);
        expect(result![0].command!.arguments).to.deep.equal([mockDocument, mockRange]);
        expect(result![0].diagnostics).to.deep.equal([diagnostic]);
        void expect(result![0].isPreferred).to.be.true;
      });

      it("should return action with multiple diagnostics", () => {
        // Arrange
        const diagnostic1 = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          FIRST_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic1.source = KEEP_SORTED_SOURCE;

        const diagnostic2 = new vscode.Diagnostic(
          new vscode.Range(1, 0, 1, 10),
          SECOND_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic2.source = KEEP_SORTED_SOURCE;

        realDiagnostics.set(mockDocument.uri, [diagnostic1, diagnostic2]);

        // Act
        const result = provider.provideCodeActions(mockDocument, mockRange);

        // Assert - Only diagnostic1 included since it intersects with mockRange
        // (0,0 to 0,10)
        expect(result).to.have.length(1);
        expect(result![0].diagnostics).to.have.length(1);
        expect(result![0].diagnostics![0]).to.equal(diagnostic1);
      });

      it("should return empty array when diagnostics exist but don't intersect with range", () => {
        // Arrange
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(2, 0, 2, 10), // Different line from mockRange (0,0 to
          // 0,10)
          ANY_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = KEEP_SORTED_SOURCE;
        realDiagnostics.set(mockDocument.uri, [diagnostic]);

        // Act
        const result = provider.provideCodeActions(mockDocument, mockRange);

        // Assert
        void expect(result).to.be.an("array").that.is.empty;
      });

      it("should filter diagnostics to only those intersecting with range", () => {
        // Arrange
        const intersectingDiagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10), // Intersects with mockRange
          ANY_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        intersectingDiagnostic.source = KEEP_SORTED_SOURCE;

        const nonIntersectingDiagnostic = new vscode.Diagnostic(
          new vscode.Range(3, 0, 3, 10), // Does not intersect with mockRange
          ANY_SHORT_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        nonIntersectingDiagnostic.source = KEEP_SORTED_SOURCE;

        realDiagnostics.set(mockDocument.uri, [intersectingDiagnostic, nonIntersectingDiagnostic]);

        // Act
        const result = provider.provideCodeActions(mockDocument, mockRange);

        // Assert
        expect(result).to.have.length(1);
        expect(result![0].diagnostics).to.have.length(1);
        expect(result![0].diagnostics![0]).to.equal(intersectingDiagnostic);
      });

      it("should create actions with command arguments", () => {
        // Arrange
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          ANY_SHORT_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = KEEP_SORTED_SOURCE;
        realDiagnostics.set(mockDocument.uri, [diagnostic]);

        // Act
        const results = provider.provideCodeActions(mockDocument, mockRange);

        // Assert
        expect(results).to.have.length(1);
        expect(results![0]).to.deep.equal({
          title: FIX_COMMAND.title,
          kind: vscode.CodeActionKind.QuickFix,
          command: {
            command: FIX_COMMAND.command,
            title: FIX_COMMAND.title,
            tooltip: FIX_COMMAND.tooltip,
            arguments: [mockDocument, mockRange],
          },
          diagnostics: [diagnostic],
          isPreferred: true,
        });
      });
    });
  });
});
