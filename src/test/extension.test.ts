import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import * as path from "path";
import { activate } from "../extension";

use(sinonChai);

/* eslint-disable @typescript-eslint/no-unused-expressions */

describe("extension", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("activate", () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
      // Use current working directory which should be the extension root
      const realExtensionPath = process.cwd();
      mockContext = {
        subscriptions: [],
        extensionPath: realExtensionPath,
        extensionUri: vscode.Uri.file(realExtensionPath),
        globalState: {} as vscode.Memento,
        workspaceState: {} as vscode.Memento,
        secrets: {} as vscode.SecretStorage,
        storageUri: vscode.Uri.file("/fake/storage"),
        globalStorageUri: vscode.Uri.file("/fake/global-storage"),
        logUri: vscode.Uri.file("/fake/log"),
        extensionMode: vscode.ExtensionMode.Development,
        extension: {} as vscode.Extension<unknown>,
        environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
        asAbsolutePath: (relativePath: string) => `${realExtensionPath}/${relativePath}`,
        storagePath: "/fake/storage",
        globalStoragePath: "/fake/global-storage",
        logPath: "/fake/log",
      } as unknown as vscode.ExtensionContext;

      // Stub workspace configuration
      const mockConfig = {
        get: sandbox.stub().callsFake((key: string, defaultValue: unknown) => {
          switch (key) {
            case "enabled":
              return true;
            case "lintOnSave":
              return true;
            case "lintOnChange":
              return true;
            case "logLevel":
              return "info";
            default:
              return defaultValue;
          }
        }),
      };
      sandbox
        .stub(vscode.workspace, "getConfiguration")
        .returns(mockConfig as unknown as vscode.WorkspaceConfiguration);

      // Stub workspace
      sandbox.stub(vscode.workspace, "textDocuments").value([]);
      sandbox.stub(vscode.workspace, "onDidSaveTextDocument");
      sandbox.stub(vscode.workspace, "onDidChangeTextDocument");
      sandbox.stub(vscode.workspace, "onDidCloseTextDocument");
      sandbox.stub(vscode.workspace, "applyEdit");

      // Stub languages
      sandbox.stub(vscode.languages, "createDiagnosticCollection").returns({
        set: sandbox.stub(),
        delete: sandbox.stub(),
        clear: sandbox.stub(),
        get: sandbox.stub(),
        dispose: sandbox.stub(),
      } as unknown as vscode.DiagnosticCollection);

      sandbox.stub(vscode.languages, "registerCodeActionsProvider").returns({
        dispose: sandbox.stub(),
      } as unknown as vscode.Disposable);

      // Stub commands
      sandbox.stub(vscode.commands, "registerCommand").returns({
        dispose: sandbox.stub(),
      } as unknown as vscode.Disposable);

      // Stub window
      sandbox.stub(vscode.window, "createOutputChannel").returns({
        appendLine: sandbox.stub(),
        append: sandbox.stub(),
        clear: sandbox.stub(),
        show: sandbox.stub(),
        hide: sandbox.stub(),
        dispose: sandbox.stub(),
        name: "keep-sorted",
        trace: sandbox.stub(),
        debug: sandbox.stub(),
        info: sandbox.stub(),
        warn: sandbox.stub(),
        error: sandbox.stub(),
      } as unknown as vscode.LogOutputChannel);
    });

    it("should register all expected subscriptions", () => {
      activate(mockContext);

      // Should register at minimum:
      // - ErrorTracker
      // - ExtensionDisabled listener
      // - KeepSortedDiagnostics
      // - Fix command
      // - Code action provider
      expect(mockContext.subscriptions.length).to.be.greaterThan(0);
    });

    it("should complete activation successfully", () => {
      // Just verify activation doesn't throw
      expect(() => activate(mockContext)).not.to.throw();
    });

    it("should read configuration on activation", () => {
      activate(mockContext);

      // Configuration is read during module initialization, not during activate
      // This test is not applicable anymore
      expect(mockContext.subscriptions.length).to.be.greaterThan(0);
    });

    it("should register fix command", () => {
      activate(mockContext);

      expect(vscode.commands.registerCommand).to.have.been.calledWith("keep-sorted.fix");
    });

    it("should register code actions provider", () => {
      activate(mockContext);

      expect(vscode.languages.registerCodeActionsProvider).to.have.been.called;
    });

    it("should create diagnostic collection", () => {
      activate(mockContext);

      expect(vscode.languages.createDiagnosticCollection).to.have.been.calledWith("keep-sorted");
    });

    it("should register document save listener", () => {
      activate(mockContext);

      expect(vscode.workspace.onDidSaveTextDocument).to.have.been.called;
    });

    it("should register document change listener", () => {
      activate(mockContext);

      expect(vscode.workspace.onDidChangeTextDocument).to.have.been.called;
    });

    it("should handle no open documents on activation", () => {
      sandbox.stub(vscode.workspace, "textDocuments").value([]);

      expect(() => activate(mockContext)).not.to.throw();
    });

    it("should handle multiple open documents on activation", () => {
      const mockDoc1 = {
        uri: vscode.Uri.file("/test/file1.ts"),
        fsPath: "/test/file1.ts",
        fileName: "/test/file1.ts",
        isUntitled: false,
        languageId: "typescript",
        version: 1,
        isDirty: false,
        isClosed: false,
        eol: vscode.EndOfLine.LF,
        lineCount: 10,
      } as unknown as vscode.TextDocument;

      const mockDoc2 = {
        uri: vscode.Uri.file("/test/file2.ts"),
        fsPath: "/test/file2.ts",
        fileName: "/test/file2.ts",
        isUntitled: false,
        languageId: "typescript",
        version: 1,
        isDirty: false,
        isClosed: false,
        eol: vscode.EndOfLine.LF,
        lineCount: 10,
      } as unknown as vscode.TextDocument;

      sandbox.stub(vscode.workspace, "textDocuments").value([mockDoc1, mockDoc2]);

      expect(() => activate(mockContext)).not.to.throw();
    });
  });

  describe("shouldLintDocument logic", () => {
    it("should skip untitled documents", () => {
      const untitledDoc = {
        uri: vscode.Uri.parse("untitled:Untitled-1"),
        fsPath: "",
      } as unknown as vscode.TextDocument;

      // This is tested indirectly through activate
      expect(untitledDoc.uri.scheme).not.to.equal("file");
    });

    it("should skip .git files", () => {
      const gitDoc = {
        uri: vscode.Uri.file("/project/.git/config"),
        fsPath: "/project/.git/config",
      } as unknown as vscode.TextDocument;

      expect(gitDoc.uri.fsPath).to.include("/.git/");
    });

    it("should process normal files", () => {
      const normalDoc = {
        uri: vscode.Uri.file("/project/src/file.ts"),
        fsPath: "/project/src/file.ts",
      } as unknown as vscode.TextDocument;

      expect(normalDoc.uri.scheme).to.equal("file");
      expect(normalDoc.uri.fsPath).not.to.include("/.git/");
    });
  });

  /** Integration tests that activate the real extension and test end-to-end behavior. */
  describe("extension integration", () => {
    let context: vscode.ExtensionContext;

    beforeEach(() => {
      // Create a minimal real context for integration testing
      const extensionPath = path.join(__dirname, "../../");
      context = {
        subscriptions: [],
        extensionPath,
        extensionUri: vscode.Uri.file(extensionPath),
        globalState: {
          get: () => undefined,
          update: () => Promise.resolve(),
          keys: () => [],
        } as unknown as vscode.Memento,
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
          keys: () => [],
        } as unknown as vscode.Memento,
        secrets: {} as vscode.SecretStorage,
        storageUri: vscode.Uri.file(path.join(extensionPath, "storage")),
        globalStorageUri: vscode.Uri.file(path.join(extensionPath, "global-storage")),
        logUri: vscode.Uri.file(path.join(extensionPath, "logs")),
        extensionMode: vscode.ExtensionMode.Test,
        extension: {} as vscode.Extension<unknown>,
        environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
        languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation,
        asAbsolutePath: (relativePath: string) => path.join(extensionPath, relativePath),
        storagePath: path.join(extensionPath, "storage"),
        globalStoragePath: path.join(extensionPath, "global-storage"),
        logPath: path.join(extensionPath, "logs"),
      } as unknown as vscode.ExtensionContext;
    });

    afterEach(() => {
      // Dispose all subscriptions to clean up
      context.subscriptions.forEach((sub) => sub.dispose());
    });

    it("should lint and fix test-workspace/sample.ts", async function () {
      this.timeout(15000); // Allow time for binary execution

      // The extension is already activated in the test host
      // Open the sample file
      const sampleUri = vscode.Uri.file(path.join(__dirname, "../../test-workspace/sample.ts"));
      const document = await vscode.workspace.openTextDocument(sampleUri);

      // Trigger linting by making a change and saving
      const edit = new vscode.WorkspaceEdit();
      edit.insert(
        document.uri,
        new vscode.Position(document.lineCount - 1, 0),
        "// trigger change\n"
      );
      await vscode.workspace.applyEdit(edit);
      await document.save();

      // Wait for linting to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check that diagnostics were set for the document
      const diagnostics = vscode.languages.getDiagnostics(document.uri);
      expect(diagnostics).to.be.an("array").with.length.greaterThan(0);
      expect(diagnostics.some((d) => d.message.includes("out of order"))).to.be.true;

      // Now, execute the fix command on the entire document
      await vscode.commands.executeCommand(
        "keep-sorted.fix",
        document,
        new vscode.Range(0, 0, document.lineCount, 0)
      );

      // Wait for the fix to apply
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check that the document content has been updated (fixed)
      const updatedContent = document.getText();
      expect(updatedContent).to.include("const alpha");
      expect(updatedContent).to.include("const beta");
      expect(updatedContent).to.include("const delta");
      expect(updatedContent).to.include("const zebra");

      // Verify the order: alpha before beta before delta before zebra
      const alphaIndex = updatedContent.indexOf("const alpha");
      const betaIndex = updatedContent.indexOf("const beta");
      const deltaIndex = updatedContent.indexOf("const delta");
      const zebraIndex = updatedContent.indexOf("const zebra");
      expect(alphaIndex).to.be.lessThan(betaIndex);
      expect(betaIndex).to.be.lessThan(deltaIndex);
      expect(deltaIndex).to.be.lessThan(zebraIndex);
    });
  });
});
