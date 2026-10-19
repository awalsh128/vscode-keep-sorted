import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import sinonChai from "sinon-chai";
import * as sinon from "sinon";
import * as path from "path";
import * as vscode from "vscode";
import { SortFileCommandHandler, SortWorkspaceCommandHandler } from "../commands";
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
    let fileHandler: SortFileCommandHandler;
    let document: vscode.TextDocument;

    beforeEach(async () => {
      fileHandler = new SortFileCommandHandler(diagnostics, editFactory);
      document = await vscode.workspace.openTextDocument({
        content: "const a = 1;\nconst b = 2;\n",
        language: "typescript",
      });
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
      expect(action.command?.command).to.equal("keep-sorted.fixFile");
      expect(action.command?.tooltip).to.equal("Sort all lines in file");
      expect(action.command?.arguments).to.have.lengthOf(1);
      expect(action.command?.arguments?.[0]).to.equal(document);
    });

    it("should create a CodeAction with the requested kind", () => {
      const diagnostics = [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 1, 0),
          "Unsorted",
          vscode.DiagnosticSeverity.Warning
        ),
      ];
      const kind = vscode.CodeActionKind.SourceFixAll.append("keepSorted");

      const action = fileHandler.asCodeAction(diagnostics, document, true, kind);

      expect(action.kind).to.deep.equal(kind);
      expect(action.isPreferred).to.equal(true);
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

    it("should recheck the edited document and retain only current findings", async (): Promise<void> => {
      // Arrange
      const document = await vscode.workspace.openTextDocument({ content: "buffer" });
      const stale = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), "Stale sorting warning");
      const remaining = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), "Remaining issue");
      diagnostics.set(document.uri, [stale]);
      const lint = sinon.stub(linter, "lintDocument").returns([remaining]);
      const create = sinon.stub(editFactory, "create").returns({
        documentUri: document.uri,
        edit: new vscode.WorkspaceEdit(),
        diagnostics: [stale],
      });
      applyEditStub.resolves(true);

      try {
        // Act
        await handler.handle(document);

        // Assert
        expect(lint.calledOnceWithExactly(document)).to.equal(true);
        expect(diagnostics.get(document.uri)).to.deep.equal([remaining]);
        expect(applyEditStub.calledBefore(lint)).to.equal(true);
      } finally {
        create.restore();
        lint.restore();
      }
    });

    it("should retain diagnostics when the workspace rejects the edit", async (): Promise<void> => {
      // Arrange
      const document = await vscode.workspace.openTextDocument({ content: "buffer" });
      const finding = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), "Unsorted");
      diagnostics.set(document.uri, [finding]);
      const create = sinon.stub(editFactory, "create").returns({
        documentUri: document.uri,
        edit: new vscode.WorkspaceEdit(),
        diagnostics: [finding],
      });
      applyEditStub.resolves(false);

      try {
        // Act & Assert
        await expect(handler.handle(document)).to.be.rejectedWith("Could not apply sorting edits");
        expect(diagnostics.get(document.uri)).to.deep.equal([finding]);
      } finally {
        create.restore();
      }
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

  describe("SortWorkspaceCommandHandler", () => {
    let handler: SortWorkspaceCommandHandler;
    let sandbox: sinon.SinonSandbox;
    let first: vscode.TextDocument;
    let second: vscode.TextDocument;

    const finding = (): vscode.Diagnostic =>
      new vscode.Diagnostic(new vscode.Range(0, 0, 1, 0), "Lines are not sorted");
    const editResultFor = (document: vscode.TextDocument): workspace.CreateEditResult => {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(0, 0, 1, 0), "sorted\n");
      return { documentUri: document.uri, edit, diagnostics: [] };
    };

    beforeEach(async (): Promise<void> => {
      sandbox = sinon.createSandbox();
      handler = new SortWorkspaceCommandHandler(diagnostics, editFactory);
      first = await vscode.workspace.openTextDocument({ content: "first\n" });
      second = await vscode.workspace.openTextDocument({ content: "second\n" });
    });

    afterEach((): void => {
      sandbox.restore();
    });

    it("should create a quick fix for the workspace command", (): void => {
      // Arrange
      const fileDiagnostics = [finding()];

      // Act
      const action = handler.asCodeAction(fileDiagnostics);

      // Assert
      expect(action.title).to.equal("Sort all files with problems (keep-sorted)");
      expect(action.kind).to.deep.equal(vscode.CodeActionKind.QuickFix);
      expect(action.diagnostics).to.deep.equal(fileDiagnostics);
      expect(action.command?.command).to.equal("keep-sorted.fixWorkspace");
      expect(action.command?.arguments).to.deep.equal([]);
      expect(handler.command.arguments).to.equal(undefined);
    });

    it("should only report files that have diagnostics", (): void => {
      // Arrange
      diagnostics.set(first.uri, [finding()]);
      diagnostics.set(second.uri, []);

      // Act
      const uris = handler.affectedUris().map((uri) => uri.toString());

      // Assert
      expect(uris).to.deep.equal([first.uri.toString()]);
    });

    it("should sort all affected files in one edit and refresh their diagnostics", async (): Promise<void> => {
      // Arrange
      diagnostics.set(first.uri, [finding()]);
      diagnostics.set(second.uri, [finding()]);
      sandbox.stub(editFactory, "create").callsFake(editResultFor);
      const refresh = sandbox.stub(editFactory, "refreshDiagnostics");
      applyEditStub.resolves(true);

      // Act
      await handler.handle();

      // Assert
      expect(applyEditStub.calledOnce).to.equal(true);
      const edit = applyEditStub.firstCall.args[0] as vscode.WorkspaceEdit;
      expect(edit.entries().map(([uri]) => uri.toString())).to.have.members([
        first.uri.toString(),
        second.uri.toString(),
      ]);
      expect(refresh.args.map(([document]) => document.uri.toString())).to.have.members([
        first.uri.toString(),
        second.uri.toString(),
      ]);
    });

    it("should report when no files need sorting", async (): Promise<void> => {
      // Arrange
      const info = sandbox.stub(vscode.window, "showInformationMessage");

      // Act
      await handler.handle();

      // Assert
      expect(applyEditStub.called).to.equal(false);
      expect(info.calledOnceWith("Keep Sorted: No files need sorting.")).to.equal(true);
    });

    it("should retain diagnostics when the edit is rejected", async (): Promise<void> => {
      // Arrange
      diagnostics.set(first.uri, [finding()]);
      sandbox.stub(editFactory, "create").callsFake(editResultFor);
      const refresh = sandbox.stub(editFactory, "refreshDiagnostics");
      applyEditStub.resolves(false);

      // Act & Assert
      try {
        await handler.handle();
        expect.fail("Expected an error to be thrown");
      } catch (err: unknown) {
        expect((err as Error).message).to.contain("Could not apply sorting edits");
      }
      expect(refresh.called).to.equal(false);
    });

    it("should sort remaining files when one file fails", async (): Promise<void> => {
      // Arrange
      diagnostics.set(first.uri, [finding()]);
      diagnostics.set(second.uri, [finding()]);
      sandbox.stub(editFactory, "create").callsFake((document: vscode.TextDocument) => {
        if (document.uri.toString() === first.uri.toString()) {
          throw new Error("binary failed");
        }
        return editResultFor(document);
      });
      sandbox.stub(editFactory, "refreshDiagnostics");
      const warning = sandbox.stub(vscode.window, "showWarningMessage");
      applyEditStub.resolves(true);

      // Act
      await handler.handle();

      // Assert
      const edit = applyEditStub.firstCall.args[0] as vscode.WorkspaceEdit;
      expect(edit.entries().map(([uri]) => uri.toString())).to.deep.equal([second.uri.toString()]);
      expect(warning.calledOnce).to.equal(true);
      expect(warning.firstCall.args[0]).to.contain("1 could not be sorted");
    });

    it("should fail when every affected file fails", async (): Promise<void> => {
      // Arrange
      diagnostics.set(first.uri, [finding()]);
      sandbox.stub(editFactory, "create").throws(new Error("binary failed"));

      // Act & Assert
      try {
        await handler.handle();
        expect.fail("Expected an error to be thrown");
      } catch (err: unknown) {
        expect((err as Error).message).to.equal("Could not sort 1 file(s).");
      }
      expect(applyEditStub.called).to.equal(false);
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
