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

  describe("toJson", () => {
    it("prints getter values", () => {
      const value = {
        get name() {
          return "zebra";
        },
      };

      expect(workspace.toJson(value)).to.contain("[Getter: 'zebra']");
    });
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

  describe("WorkspaceScanner", () => {
    const DIRECTIVE_TEXT = "# keep-sorted start\nb\na\n# keep-sorted end\n";
    const PLAIN_TEXT = "no directives here\n";
    let files: Map<string, string>;
    let openDocuments: vscode.TextDocument[];
    let editFactory: {
      refreshDiagnostics: sinon.SinonStub;
      refreshFileDiagnostics: sinon.SinonStub;
    };
    let host: workspace.ScanHost & { readFile: sinon.SinonSpy };
    let scanner: workspace.WorkspaceScanner;

    const fileUri = (name: string): vscode.Uri => vscode.Uri.file(`/project/${name}`);
    const openDocument = (name: string, text: string): vscode.TextDocument =>
      ({ uri: fileUri(name), getText: () => text }) as unknown as vscode.TextDocument;

    beforeEach(() => {
      files = new Map();
      openDocuments = [];
      editFactory = { refreshDiagnostics: sandbox.stub(), refreshFileDiagnostics: sandbox.stub() };
      host = {
        findFiles: async () => [...files.keys()].map((name) => fileUri(name)),
        textDocuments: () => openDocuments,
        stat: async (uri) =>
          ({ size: files.get(path.basename(uri.path))!.length }) as vscode.FileStat,
        readFile: sandbox.spy(async (uri: vscode.Uri) =>
          new TextEncoder().encode(files.get(path.basename(uri.path)))
        ),
      };
      sandbox.stub(configuration, "excluded").returns(null);
      scanner = new workspace.WorkspaceScanner(
        editFactory as unknown as workspace.EditFactory,
        host
      );
    });

    it("should lint files with directives from disk without opening them", async () => {
      // Arrange
      files.set("sorted.txt", DIRECTIVE_TEXT);
      files.set("plain.txt", PLAIN_TEXT);
      const openTextDocument = sandbox.spy(vscode.workspace, "openTextDocument");

      // Act
      const result = await scanner.scan();

      // Assert
      expect(result).to.deep.equal({ files: 2, linted: 1 });
      expect(editFactory.refreshFileDiagnostics.callCount).to.equal(1);
      const [uri, text] = editFactory.refreshFileDiagnostics.firstCall.args;
      expect([uri.toString(), text]).to.deep.equal([
        fileUri("sorted.txt").toString(),
        DIRECTIVE_TEXT,
      ]);
      expect(openTextDocument.called).to.equal(false);
    });

    it("should lint open documents from their buffers instead of disk", async () => {
      // Arrange
      files.set("open.txt", PLAIN_TEXT);
      const document = openDocument("open.txt", DIRECTIVE_TEXT);
      openDocuments.push(document);

      // Act
      const result = await scanner.scan();

      // Assert
      expect(result).to.deep.equal({ files: 1, linted: 1 });
      expect(editFactory.refreshDiagnostics).to.have.been.calledOnceWithExactly(document);
      expect(host.readFile.called).to.equal(false);
    });

    [
      {
        name: "files over the size limit",
        text: "x".repeat(workspace.MAX_SCAN_BYTES) + "keep-sorted",
      },
      { name: "binary content", text: `\0${DIRECTIVE_TEXT}` },
    ].forEach(({ name, text }) => {
      it(`should skip ${name}`, async () => {
        // Arrange
        files.set("skipped.bin", text);

        // Act
        const result = await scanner.scan();

        // Assert
        expect(result).to.deep.equal({ files: 1, linted: 0 });
        expect(editFactory.refreshFileDiagnostics.called).to.equal(false);
      });
    });

    it("should drop a disk result when the file opens during the read", async () => {
      // Arrange
      files.set("racing.txt", DIRECTIVE_TEXT);
      const read = host.readFile;
      host.readFile = sandbox.spy(async (uri: vscode.Uri) => {
        openDocuments.push(openDocument("racing.txt", DIRECTIVE_TEXT));
        return read(uri);
      });

      // Act
      const result = await scanner.scan();

      // Assert
      expect(result).to.deep.equal({ files: 1, linted: 0 });
      expect(editFactory.refreshFileDiagnostics.called).to.equal(false);
    });

    it("should stop applying results once cancelled", async () => {
      // Arrange
      files.set("first.txt", DIRECTIVE_TEXT);
      files.set("second.txt", DIRECTIVE_TEXT);
      const read = host.readFile;
      host.readFile = sandbox.spy(async (uri: vscode.Uri) => {
        scanner.cancel();
        return read(uri);
      });

      // Act
      const result = await scanner.scan();

      // Assert
      expect(result).to.equal(undefined);
      expect(editFactory.refreshFileDiagnostics.called).to.equal(false);
    });

    it("should keep scanning after a file fails to lint", async () => {
      // Arrange
      files.set("failing.txt", DIRECTIVE_TEXT);
      files.set("passing.txt", DIRECTIVE_TEXT);
      editFactory.refreshFileDiagnostics.onFirstCall().throws(new Error("lint failed"));

      // Act
      const result = await scanner.scan();

      // Assert
      expect(result).to.deep.equal({ files: 2, linted: 1 });
      expect(editFactory.refreshFileDiagnostics.callCount).to.equal(2);
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
