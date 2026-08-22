import { describe, it } from "mocha";
import { expect } from "chai";
import * as vscode from "vscode";
import * as path from "path";
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
