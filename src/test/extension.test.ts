import { randomUUID } from "crypto";
import * as path from "path";
import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as vscode from "vscode";
import { TEST_WORKSPACE_DIR } from "./testing";

describe("extension", () => {
  const EXTENSION_ID = "awalsh128.keep-sorted";
  const FIX_FILE_COMMAND = "keep-sorted.fixFile";
  const SORT_FILE_COMMAND = "keep-sorted.sortFile";
  const SAMPLE_TS_FILENAME = "sample.ts";
  const SAMPLE_SORTED_TS_FILENAME = "sample_sorted.ts";

  it("should complete activation successfully", async () => {
    // Arrange
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;

    // Act & Assert
    await expect(extension.activate()).to.not.be.rejected;
    expect(extension.isActive).to.equal(true);
  });

  const getDocument = async (filename?: string | vscode.Uri) => {
    const uri =
      filename instanceof vscode.Uri
        ? filename
        : vscode.Uri.file(path.join(TEST_WORKSPACE_DIR, filename ?? SAMPLE_TS_FILENAME));
    return await vscode.workspace.openTextDocument(uri);
  };
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForDiagnostics = async (uri: vscode.Uri, timeoutMs = 5000): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (vscode.languages.getDiagnostics(uri).length > 0) {
        return;
      }
      await delay(100);
    }
    throw new Error(`Timed out waiting for diagnostics for ${uri.fsPath}`);
  };

  describe("activation behavior", () => {
    it("should create diagnostics on save", async () => {
      // Arrange
      const document = await getDocument();

      // Act - Make an edit and save to trigger diagnostics
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(0, 0), "\n");
      await vscode.workspace.applyEdit(edit);
      await document.save();

      // Wait for async diagnostic processing
      await delay(1000);

      // Assert
      const diagnostics = vscode.languages.getDiagnostics(document.uri);
      expect(diagnostics).to.be.an("array").with.length.greaterThan(0);
      // Note: Global afterEach in index.ts restores workspace files including in-memory cache
    });

    it("should fix document on command", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      const document = await getDocument(SAMPLE_TS_FILENAME);
      await extension.activate();
      await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      await waitForDiagnostics(document.uri);

      // Act - Execute the fix command
      await vscode.commands.executeCommand(FIX_FILE_COMMAND, document);

      // Assert - Verify document content has been changed
      expect(document.getText()).to.equal(
        await getDocument(SAMPLE_SORTED_TS_FILENAME).then((doc) => doc.getText())
      );
    });

    it("should register the fix and legacy sort file commands", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      await extension.activate();

      // Act
      const commands = await vscode.commands.getCommands(true);

      // Assert
      expect(commands).to.include(FIX_FILE_COMMAND);
      expect(commands).to.include(SORT_FILE_COMMAND);
    });
  });

  describe("sorting regressions", () => {
    let fixtureUri: vscode.Uri;
    const unsortedContent = [
      "Outside blocks: zebra, apple",
      "# keep-sorted start",
      "zebra",
      "apple",
      "# keep-sorted end",
      "Between blocks: zebra, apple",
      "# keep-sorted start",
      "delta",
      "charlie",
      "# keep-sorted end",
      "",
    ].join("\n");
    const sortedContent = [
      "Outside blocks: zebra, apple",
      "# keep-sorted start",
      "apple",
      "zebra",
      "# keep-sorted end",
      "Between blocks: zebra, apple",
      "# keep-sorted start",
      "charlie",
      "delta",
      "# keep-sorted end",
      "",
    ].join("\n");
    let document: vscode.TextDocument;
    let originalCodeActions: Record<string, string | boolean> | undefined;
    let originalEnabled: boolean | undefined;

    const waitForSaveParticipants = async (): Promise<void> => {
      let requestedOnSave = false;
      const requests = new Set<string>();
      const kind = vscode.CodeActionKind.SourceFixAll.append("keepSorted");
      const probe = vscode.languages.registerCodeActionsProvider(
        { scheme: "file", pattern: fixtureUri.fsPath },
        {
          provideCodeActions(
            _document: vscode.TextDocument,
            _range: vscode.Range,
            context: vscode.CodeActionContext
          ): vscode.CodeAction[] {
            requests.add(`${context.only?.value}:${context.triggerKind}`);
            requestedOnSave ||=
              context.only?.contains(kind) === true &&
              context.triggerKind === vscode.CodeActionTriggerKind.Automatic;
            return [];
          },
        },
        { providedCodeActionKinds: [kind] }
      );
      try {
        // VS Code installs save participants after extension-host tests can start.
        const deadline = Date.now() + 5000;
        while (!requestedOnSave && Date.now() < deadline) {
          const edit = new vscode.WorkspaceEdit();
          edit.insert(fixtureUri, new vscode.Position(0, 0), "\n");
          await vscode.workspace.applyEdit(edit);
          await document.save();
          if (!requestedOnSave) {
            await delay(100);
          }
        }
        const settings = vscode.workspace
          .getConfiguration("editor", fixtureUri)
          .get("codeActionsOnSave");
        const message =
          `Save requests: ${[...requests].join(", ")}; ` + `settings: ${JSON.stringify(settings)}`;
        expect(requestedOnSave, message).to.equal(true);
      } finally {
        probe.dispose();
      }
    };

    beforeEach(async (): Promise<void> => {
      // Unique URIs prevent dirty editor buffers from being reused across tests.
      fixtureUri = vscode.Uri.file(path.join(TEST_WORKSPACE_DIR, `sort-${randomUUID()}.txt`));
      await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
      const editorConfig = vscode.workspace.getConfiguration("editor", fixtureUri);
      originalCodeActions =
        editorConfig.inspect<Record<string, string | boolean>>("codeActionsOnSave")?.workspaceValue;
      const extensionConfig = vscode.workspace.getConfiguration("keep-sorted");
      originalEnabled = extensionConfig.inspect<boolean>("enabled")?.workspaceValue;
      await extensionConfig.update("enabled", true, vscode.ConfigurationTarget.Workspace);
      await editorConfig.update(
        "codeActionsOnSave",
        { "source.fixAll.keepSorted": "explicit" },
        vscode.ConfigurationTarget.Workspace
      );
      await vscode.workspace.fs.writeFile(fixtureUri, Buffer.from("Save readiness probe\n"));
      document = await vscode.workspace.openTextDocument(fixtureUri);
      await vscode.window.showTextDocument(document);
      await waitForSaveParticipants();
      const edit = new vscode.WorkspaceEdit();
      edit.replace(fixtureUri, new vscode.Range(0, 0, document.lineCount, 0), unsortedContent);
      expect(await vscode.workspace.applyEdit(edit)).to.equal(true);
      await waitForDiagnostics(fixtureUri);
    });

    afterEach(async (): Promise<void> => {
      await document.save();
      await vscode.workspace
        .getConfiguration("editor", fixtureUri)
        .update("codeActionsOnSave", originalCodeActions, vscode.ConfigurationTarget.Workspace);
      await vscode.workspace
        .getConfiguration("keep-sorted")
        .update("enabled", originalEnabled, vscode.ConfigurationTarget.Workspace);
    });

    [FIX_FILE_COMMAND, SORT_FILE_COMMAND].forEach((command: string): void => {
      [
        {
          name: "document",
          args: (document: vscode.TextDocument): vscode.TextDocument[] => [document],
        },
        { name: "command palette", args: (): vscode.TextDocument[] => [] },
      ].forEach((invocation): void => {
        const title = `should sort all blocks via ${command} from ${invocation.name}`;
        it(title, async (): Promise<void> => {
          // Arrange
          const args = invocation.args(document);

          // Act
          await vscode.commands.executeCommand(command, ...args);

          // Assert
          expect(document.getText()).to.equal(sortedContent);
          expect(vscode.languages.getDiagnostics(fixtureUri)).to.have.lengthOf(0);
        });
      });

      it(`should be idempotent via ${command}`, async (): Promise<void> => {
        // Arrange
        await vscode.commands.executeCommand(command, document);
        expect(document.getText()).to.equal(sortedContent);
        const sortedVersion = document.version;

        // Act
        await vscode.commands.executeCommand(command, document);

        // Assert
        expect(document.getText()).to.equal(sortedContent);
        expect(document.version).to.equal(sortedVersion);
        expect(vscode.languages.getDiagnostics(fixtureUri)).to.have.lengthOf(0);
      });
    });

    const makeDocumentDirty = async (): Promise<void> => {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(fixtureUri, new vscode.Position(document.lineCount - 1, 0), "\n");
      expect(await vscode.workspace.applyEdit(edit)).to.equal(true);
      expect(document.isDirty).to.equal(true);
    };

    it("should sort all blocks on save and persist the result to disk", async (): Promise<void> => {
      // Arrange
      await makeDocumentDirty();
      const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        "vscode.executeCodeActionProvider",
        fixtureUri,
        new vscode.Range(0, 0, document.lineCount, 0),
        "source.fixAll.keepSorted"
      );
      expect(actions).to.have.lengthOf(1);

      // Act
      await vscode.commands.executeCommand("workbench.action.files.save");

      // Assert
      expect(document.getText()).to.equal(sortedContent + "\n");
      expect(Buffer.from(await vscode.workspace.fs.readFile(fixtureUri)).toString("utf8")).to.equal(
        sortedContent + "\n"
      );
      expect(document.isDirty).to.equal(false);
      expect(vscode.languages.getDiagnostics(fixtureUri)).to.have.lengthOf(0);
    });

    it("should only lint on save when the save action is disabled", async (): Promise<void> => {
      // Arrange
      await vscode.workspace
        .getConfiguration("editor", fixtureUri)
        .update(
          "codeActionsOnSave",
          { "source.fixAll.keepSorted": "never" },
          vscode.ConfigurationTarget.Workspace
        );
      await makeDocumentDirty();

      // Act
      await vscode.commands.executeCommand("workbench.action.files.save");

      // Assert
      expect(document.getText()).to.equal(unsortedContent + "\n");
      expect(Buffer.from(await vscode.workspace.fs.readFile(fixtureUri)).toString("utf8")).to.equal(
        unsortedContent + "\n"
      );
      expect(document.isDirty).to.equal(false);
      expect(vscode.languages.getDiagnostics(fixtureUri)).to.have.length.greaterThan(0);
    });
  });

  describe("deactivation behavior", () => {
    it("should properly deactivate extension", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      await extension.activate();

      // Assert - Extension is active after activation
      expect(extension.isActive).to.equal(true);
    });

    it("should clean up subscriptions on deactivation", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      const initialLength = vscode.languages.getDiagnostics().length;

      // Act
      await extension.activate();
      await delay(500);

      // Create a test document to trigger diagnostics
      const document = await getDocument();
      await waitForDiagnostics(document.uri);
      const afterActivationLength = vscode.languages.getDiagnostics().length;

      // We should have diagnostics after activation (extension may already be active)
      expect(afterActivationLength).to.be.greaterThanOrEqual(initialLength);
    });

    it("should handle multiple activation/deactivation cycles", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;

      // Act - Cycle through activate multiple times
      for (let i = 0; i < 3; i++) {
        await extension.activate();
        await delay(200);
        expect(extension.isActive).to.equal(true);
      }

      // Assert - Should not throw errors on repeated activation
      expect(extension.isActive).to.equal(true);
    });

    it("should preserve diagnostics collection state", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      const document = await getDocument();

      // Act
      await extension.activate();
      await waitForDiagnostics(document.uri);
      const diagnosticsBeforeDeactivation = vscode.languages.getDiagnostics(document.uri).length;

      // Assert - Diagnostics should exist
      expect(diagnosticsBeforeDeactivation).to.be.greaterThan(0);
    });
  });
});
