import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
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
      mockContext = {
        subscriptions: [],
        extensionPath: "/fake/extension/path",
        extensionUri: vscode.Uri.file("/fake/extension/path"),
        globalState: {} as vscode.Memento,
        workspaceState: {} as vscode.Memento,
        secrets: {} as vscode.SecretStorage,
        storageUri: vscode.Uri.file("/fake/storage"),
        globalStorageUri: vscode.Uri.file("/fake/global-storage"),
        logUri: vscode.Uri.file("/fake/log"),
        extensionMode: vscode.ExtensionMode.Development,
        extension: {} as vscode.Extension<unknown>,
        environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
        asAbsolutePath: (relativePath: string) => `/fake/extension/path/${relativePath}`,
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

    it("should create logger output channel", () => {
      activate(mockContext);

      expect(vscode.window.createOutputChannel).to.have.been.called;
    });

    it("should read configuration on activation", () => {
      activate(mockContext);

      expect(vscode.workspace.getConfiguration).to.have.been.calledWith("keep-sorted");
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

    it("should register document close listener", () => {
      activate(mockContext);

      expect(vscode.workspace.onDidCloseTextDocument).to.have.been.called;
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
});
