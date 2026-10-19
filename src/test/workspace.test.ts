import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import * as workspace from "../workspace";
import * as configuration from "../configuration";
import * as path from "path";
import { KeepSorted } from "../keepsorted";

use(sinonChai);

describe("workspace", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("EditFactory diagnostics", (): void => {
    let diagnostics: vscode.DiagnosticCollection;
    let linter: KeepSorted;
    let factory: workspace.EditFactory;
    let document: vscode.TextDocument;

    beforeEach(async (): Promise<void> => {
      diagnostics = vscode.languages.createDiagnosticCollection("refresh-regression");
      linter = new KeepSorted(process.cwd());
      factory = new workspace.EditFactory(linter, diagnostics);
      document = await vscode.workspace.openTextDocument({ content: "already sorted" });
    });

    afterEach((): void => {
      diagnostics.dispose();
    });

    it("should remove stale findings even when no edit is needed", (): void => {
      // Arrange
      diagnostics.set(document.uri, [
        new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), "Stale problem"),
      ]);
      sandbox.stub(linter, "lintDocument").returns([]);
      const fix = sandbox.stub(linter, "fixDocument");

      // Act
      const result = factory.create(document);

      // Assert
      expect(result).to.equal(null);
      expect(diagnostics.get(document.uri)).to.deep.equal([]);
      expect(fix.called).to.equal(false);
    });

    it("should refresh only the requested file and this diagnostic collection", (): void => {
      // Arrange
      const otherUri = vscode.Uri.file("/other-file.txt");
      const otherFinding = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), "Other file");
      const remaining = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), "Current problem");
      diagnostics.set(otherUri, [otherFinding]);
      sandbox.stub(linter, "lintDocument").returns([remaining]);

      // Act
      factory.refreshDiagnostics(document);

      // Assert
      expect(diagnostics.get(document.uri)).to.deep.equal([remaining]);
      expect(diagnostics.get(otherUri)).to.deep.equal([otherFinding]);
    });
  });

  describe("isInScope", () => {
    it("returns false for non-file schemes", () => {
      // Arrange
      const uri = vscode.Uri.parse("git:/repo/file.ts");

      // Act
      const result = workspace.isInScope(uri);

      // Assert
      expect(result).to.equal(false);
    });

    it("returns true for file scheme when not excluded", () => {
      // Arrange
      const uri = vscode.Uri.file("/project/file.ts");
      // Stub configuration.excluded to return null (not excluded)
      sandbox.stub(configuration, "excluded").withArgs(uri).returns(null);

      // Act
      const result = workspace.isInScope(uri);

      // Assert
      expect(result).to.equal(true);
    });

    it("returns false when excluded by configuration", () => {
      // Arrange
      const uri = vscode.Uri.file("/project/ignore.me");
      const fakeRegex = /ignore/;
      sandbox.stub(configuration, "excluded").withArgs(uri).returns(fakeRegex);

      // Act
      const result = workspace.isInScope(uri);

      // Assert
      expect(result).to.equal(false);
    });
  });

  describe("inScopeUris", () => {
    it("skips files that cannot be opened as text", async () => {
      // Arrange
      const textUri = vscode.Uri.file("/project/text.ts");
      const binaryUri = vscode.Uri.file("/project/logo.png");
      const textDoc = await vscode.workspace.openTextDocument({ content: "text" });
      sandbox.stub(vscode.workspace, "findFiles").resolves([binaryUri, textUri]);
      sandbox.stub(configuration, "excluded").returns(null);
      sandbox
        .stub(vscode.workspace, "openTextDocument")
        .callsFake(async (uri?: unknown) =>
          uri === binaryUri ? Promise.reject(new Error("File seems to be binary")) : textDoc
        );

      // Act
      const results = await workspace.inScopeDocuments();

      // Assert
      expect(results).to.deep.equal([textDoc]);
    });

    it("filters non-file URI", async () => {
      // Arrange - Open a real document so it appears in textDocuments
      const testFilePath = path.join(__dirname, "..", "..", "test-workspace", "sample.ts");
      const testDoc = await vscode.workspace.openTextDocument(testFilePath);

      // Stub configuration.excluded to return null (not excluded)
      sandbox.stub(configuration, "excluded").returns(null);

      // Act
      const results = (await workspace.inScopeDocuments()).map((doc) => doc.uri.fsPath);

      // Assert - Should contain the opened file (file scheme)
      expect(results).to.contain(testDoc.uri.fsPath);
    });

    it("filters excluded URIs", async () => {
      // Arrange - Open a real document
      const testFilePath = path.join(__dirname, "..", "..", "test-workspace", "sample.ts");
      const testDoc = await vscode.workspace.openTextDocument(testFilePath);

      // Stub configuration.excluded to return a regex that matches the file
      sandbox.stub(configuration, "excluded").returns(/sample/);

      // Act
      const results = (await workspace.inScopeDocuments()).map((doc) => doc.uri.fsPath);

      // Assert - Should NOT contain the excluded file
      expect(results).to.not.contain(testDoc.uri.fsPath);
    });
  });

  describe("ExtensionSubscriptionsHandler", (): void => {
    const createRegistrant = (id: string) => {
      const disposable = { dispose: sinon.stub() };
      const register = sinon.stub().resolves(disposable);
      return { registrant: { id, register }, register, disposable };
    };

    it("should not register when enabling a registrant before registration", async () => {
      // Arrange
      const handler = new workspace.ExtensionSubscriptionsHandler([]);
      const { registrant, register } = createRegistrant("a");
      handler.addRegistrant(registrant, false);

      // Act - e.g. autoComplete turned on while the extension is disabled
      await handler.setEnabled("a", true);

      // Assert
      sinon.assert.notCalled(register);
    });

    it("should register only enabled registrants", async () => {
      // Arrange
      const subscriptions: vscode.Disposable[] = [];
      const handler = new workspace.ExtensionSubscriptionsHandler(subscriptions);
      const enabled = createRegistrant("enabled");
      const disabled = createRegistrant("disabled");
      handler.addRegistrant(enabled.registrant);
      handler.addRegistrant(disabled.registrant, false);

      // Act
      await handler.registerAllEnabled();

      // Assert
      sinon.assert.calledOnce(enabled.register);
      sinon.assert.notCalled(disabled.register);
      expect(subscriptions).to.deep.equal([enabled.disposable]);
    });

    it("should apply enable changes while registered", async () => {
      // Arrange
      const handler = new workspace.ExtensionSubscriptionsHandler([]);
      const { registrant, register, disposable } = createRegistrant("a");
      handler.addRegistrant(registrant);
      await handler.registerAllEnabled();

      // Act
      await handler.setEnabled("a", false);

      // Assert
      sinon.assert.calledOnce(disposable.dispose);
      sinon.assert.calledOnce(register);
    });

    it("should not re-register after unregistering all", async () => {
      // Arrange
      const handler = new workspace.ExtensionSubscriptionsHandler([]);
      const { registrant, register, disposable } = createRegistrant("a");
      handler.addRegistrant(registrant);
      await handler.registerAllEnabled();

      // Act
      handler.unregisterAll();
      await handler.setEnabled("a", true);

      // Assert
      sinon.assert.calledOnce(disposable.dispose);
      sinon.assert.calledOnce(register);
    });
  });
});
