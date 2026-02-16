import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import sinonChai from "sinon-chai";
import * as sinon from "sinon";
import * as path from "path";
import * as vscode from "vscode";
import { SortBlockCommandHandler, SortFileCommandHandler } from "../commands";
import * as workspace from "../workspace";
import { EditFactory } from "../workspace";
import { KeepSorted } from "../keepsorted";
import { EXT_NAME } from "../instrumentation";

use(sinonChai);

// Path to test workspace
const TEST_WORKSPACE = path.join(__dirname, "..", "..", "test-workspace");
const MIXED_BLOCKS_FILE = path.join(TEST_WORKSPACE, "mixed_blocks.ts");

describe("commands", () => {
  describe("asCodeAction", () => {
    let blockHandler: SortBlockCommandHandler;
    let fileHandler: SortFileCommandHandler;
    let document: vscode.TextDocument;

    beforeEach(async () => {
      blockHandler = new SortBlockCommandHandler(diagnostics, editFactory);
      fileHandler = new SortFileCommandHandler(diagnostics, editFactory);
      document = await vscode.workspace.openTextDocument({
        content: "const a = 1;\nconst b = 2;\n",
        language: "typescript",
      });
    });

    it("should create a CodeAction for SortBlockCommandHandler with correct properties", () => {
      const range = new vscode.Range(0, 0, 1, 0);
      const diagnostics = [
        new vscode.Diagnostic(range, "Unsorted", vscode.DiagnosticSeverity.Warning),
      ];
      const action = blockHandler.asCodeAction(diagnostics, document, range, /*isPreferred=*/ true);
      expect(action.title).to.equal("Sort all lines in block (keep-sorted)");
      expect(action.kind).to.deep.equal(vscode.CodeActionKind.QuickFix);
      expect(action.diagnostics).to.deep.equal(diagnostics);
      expect(action.isPreferred).to.equal(true);
      expect(action.command?.title).to.equal("Keep Sorted: Sort Block");
      expect(action.command?.command).to.equal("keep-sorted.sortBlock");
      expect(action.command?.tooltip).to.equal("Sort all lines in block");
      expect(action.command?.arguments).to.have.lengthOf(2);
      expect(action.command?.arguments?.[0]).to.equal(document);
      expect(action.command?.arguments?.[1]).to.equal(range);
    });

    it("should create a CodeAction for SortFileCommandHandler with correct properties", () => {
      const diagnostics = [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 1, 0),
          "Unsorted",
          vscode.DiagnosticSeverity.Warning
        ),
      ];
      const action = fileHandler.asCodeAction(diagnostics, document);
      expect(action.title).to.equal("Sort all lines in file (keep-sorted)");
      expect(action.kind).to.deep.equal(vscode.CodeActionKind.QuickFix);
      expect(action.diagnostics).to.deep.equal(diagnostics);
      expect(action.isPreferred).to.equal(false);
      expect(action.command?.title).to.equal("Keep Sorted: Sort Current File");
      expect(action.command?.command).to.equal("keep-sorted.sortFile");
      expect(action.command?.tooltip).to.equal("Sort all lines in file");
      expect(action.command?.arguments).to.have.lengthOf(1);
      expect(action.command?.arguments?.[0]).to.equal(document);
    });
  });

  let linter: KeepSorted;
  let diagnostics: vscode.DiagnosticCollection;
  let editFactory: EditFactory;
  let applyEditStub: sinon.SinonStub;

  beforeEach(() => {
    linter = new KeepSorted(process.cwd());
    diagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);
    editFactory = new EditFactory(linter, diagnostics);

    // Stub vscode.workspace.applyEdit to prevent actual edits during tests
    applyEditStub = sinon.stub(vscode.workspace, "applyEdit");
  });

  afterEach(() => {
    diagnostics.dispose();
    applyEditStub.restore();
  });

  describe("SortFileCommandHandler", () => {
    let handler: SortFileCommandHandler;

    beforeEach(() => {
      handler = new SortFileCommandHandler(diagnostics, editFactory);
    });

    it("should do something when no active editor", async () => {
      // Arrange - Create a mock document for testing
      const document = await vscode.workspace.openTextDocument({
        content: "const a = 1;\n",
        language: "typescript",
      });

      // Act
      await handler.handle(document);

      // Assert - applyEdit should not have been called (no keep-sorted blocks)
      expect(applyEditStub.called).to.equal(false);
    });

    it("should do nothing when editFactory.create returns null", async () => {
      // Arrange - Open a document with no keep-sorted blocks
      const document = await vscode.workspace.openTextDocument({
        content: "const a = 1;\nconst b = 2;\n",
        language: "typescript",
      });
      await vscode.window.showTextDocument(document);

      // Act
      await handler.handle(document);

      // Assert - applyEdit should not have been called
      expect(applyEditStub.called).to.equal(false);
    });

    it("should apply edit when editFactory.create returns valid result", async () => {
      // Arrange - Open document with unsorted keep-sorted block
      const document = await vscode.workspace.openTextDocument(MIXED_BLOCKS_FILE);
      await vscode.window.showTextDocument(document);

      // Set diagnostics to trigger edit creation
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(5, 0, 8, 0),
        "Lines are not sorted",
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = EXT_NAME;
      diagnostics.set(document.uri, [diagnostic]);

      applyEditStub.resolves(true);

      // Act
      await handler.handle(document);

      // Assert - applyEdit should have been called with a WorkspaceEdit
      expect(applyEditStub.calledOnce).to.equal(true);
      const editArg = applyEditStub.firstCall.args[0];
      expect(editArg).to.be.an.instanceOf(vscode.WorkspaceEdit);
    });

    describe("document scope fallback", () => {
      let isInScopeStub: sinon.SinonStub;
      let sandbox: sinon.SinonSandbox;
      let mockActiveEditor: vscode.TextEditor | undefined;
      let mockVisibleEditors: vscode.TextEditor[];

      beforeEach(() => {
        sandbox = sinon.createSandbox();
        isInScopeStub = sandbox.stub(workspace, "isInScope");
        mockActiveEditor = undefined;
        mockVisibleEditors = [];
        sandbox.stub(vscode.window, "activeTextEditor").get(() => mockActiveEditor);
        sandbox.stub(vscode.window, "visibleTextEditors").get(() => mockVisibleEditors);
      });

      afterEach(() => {
        sandbox.restore();
      });

      it("should throw when document is not in scope", async () => {
        // Arrange - document is provided but not in scope, and no fallback editors
        const document = await vscode.workspace.openTextDocument({
          content: "const a = 1;\n",
          language: "typescript",
        });
        isInScopeStub.returns(false);
        mockActiveEditor = undefined;
        mockVisibleEditors = [];

        // Act & Assert
        try {
          await handler.handle(document);
          expect.fail("Expected an error to be thrown");
        } catch (err: unknown) {
          expect((err as Error).message).to.contain(
            "No in scope document displayed or active text editor found to sort"
          );
        }
      });

      it("should throw when null document is passed", async () => {
        // Arrange - null document, no fallback editors
        isInScopeStub.returns(false);
        mockActiveEditor = undefined;
        mockVisibleEditors = [];

        // Act & Assert
        try {
          await handler.handle(null as unknown as vscode.TextDocument);
          expect.fail("Expected an error to be thrown");
        } catch (err: unknown) {
          expect((err as Error).message).to.contain(
            "No in scope document displayed or active text editor found to sort"
          );
        }
      });

      it("should fall back to active editor when null document but active editor is in scope", async () => {
        // Arrange - null document, active editor has in-scope document
        const activeDoc = await vscode.workspace.openTextDocument(MIXED_BLOCKS_FILE);
        isInScopeStub.callsFake((uri: vscode.Uri) => uri.fsPath === activeDoc.uri.fsPath);
        mockActiveEditor = { document: activeDoc } as unknown as vscode.TextEditor;

        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(5, 0, 8, 0),
          "Lines are not sorted",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = EXT_NAME;
        diagnostics.set(activeDoc.uri, [diagnostic]);
        applyEditStub.resolves(true);

        // Act
        await handler.handle(null as unknown as vscode.TextDocument);

        // Assert - should have used the active editor's document
        expect(applyEditStub.calledOnce).to.equal(true);
        const editArg = applyEditStub.firstCall.args[0];
        expect(editArg).to.be.an.instanceOf(vscode.WorkspaceEdit);
      });

      it("should throw when null document and active editor is not in scope", async () => {
        // Arrange - null document, active editor exists but not in scope
        const outOfScopeDoc = await vscode.workspace.openTextDocument({
          content: "const a = 1;\n",
          language: "typescript",
        });
        isInScopeStub.returns(false);
        mockActiveEditor = { document: outOfScopeDoc } as unknown as vscode.TextEditor;
        mockVisibleEditors = [];

        // Act & Assert
        try {
          await handler.handle(null as unknown as vscode.TextDocument);
          expect.fail("Expected an error to be thrown");
        } catch (err: unknown) {
          expect((err as Error).message).to.contain(
            "No in scope document displayed or active text editor found to sort"
          );
        }
      });

      it("should fall back to visible editor when null document, no active editor, but visible editor in scope", async () => {
        // Arrange - null document, no active editor, one visible editor in scope
        const visibleDoc = await vscode.workspace.openTextDocument(MIXED_BLOCKS_FILE);
        isInScopeStub.callsFake((uri: vscode.Uri) => uri.fsPath === visibleDoc.uri.fsPath);
        mockActiveEditor = undefined;
        mockVisibleEditors = [{ document: visibleDoc } as unknown as vscode.TextEditor];

        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(5, 0, 8, 0),
          "Lines are not sorted",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = EXT_NAME;
        diagnostics.set(visibleDoc.uri, [diagnostic]);
        applyEditStub.resolves(true);

        // Act
        await handler.handle(null as unknown as vscode.TextDocument);

        // Assert - should have used the visible editor's document
        expect(applyEditStub.calledOnce).to.equal(true);
        const editArg = applyEditStub.firstCall.args[0];
        expect(editArg).to.be.an.instanceOf(vscode.WorkspaceEdit);
      });

      it("should throw when null document, no active editor, and all visible editors not in scope", async () => {
        // Arrange - null document, no active editor, visible editors all out of scope
        const outOfScopeDoc1 = await vscode.workspace.openTextDocument({
          content: "const x = 1;\n",
          language: "typescript",
        });
        const outOfScopeDoc2 = await vscode.workspace.openTextDocument({
          content: "const y = 2;\n",
          language: "typescript",
        });
        isInScopeStub.returns(false);
        mockActiveEditor = undefined;
        mockVisibleEditors = [
          { document: outOfScopeDoc1 } as unknown as vscode.TextEditor,
          { document: outOfScopeDoc2 } as unknown as vscode.TextEditor,
        ];

        // Act & Assert
        try {
          await handler.handle(null as unknown as vscode.TextDocument);
          expect.fail("Expected an error to be thrown");
        } catch (err: unknown) {
          expect((err as Error).message).to.contain(
            "No in scope document displayed or active text editor found to sort"
          );
        }
      });
    });
  });

  it("should register and execute sortFile command", async () => {
    // Arrange - Open document with diagnostics
    const document = await vscode.workspace.openTextDocument(MIXED_BLOCKS_FILE);
    await vscode.window.showTextDocument(document);

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(5, 0, 8, 0),
      "Lines are not sorted",
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = EXT_NAME;
    diagnostics.set(document.uri, [diagnostic]);

    applyEditStub.resolves(true);

    // Act - Execute the command directly
    const handler = new SortFileCommandHandler(diagnostics, editFactory);
    await handler.handle(document);

    // Assert
    expect(applyEditStub.called).to.equal(true);
  });
});
