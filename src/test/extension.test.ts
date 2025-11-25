import { describe, it } from "mocha";
import { expect } from "chai";
import * as vscode from "vscode";
import * as path from "path";
import { TEST_WORKSPACE_DIR } from "./testing";
import * as workspace from "../workspace";
import { FixFileCommandHandler, FixWorkspaceCommandHandler } from "../commands";

/* eslint-disable @typescript-eslint/no-unused-expressions */

describe("extension", () => {
  const SAMPLE_TS_FILENAME = "sample.ts";
  const SAMPLE_SORTED_TS_FILENAME = "sample_sorted.ts";

  it("should complete activation successfully", async () => {
    // Arrange
    const extension = vscode.extensions.getExtension("awalsh128.keep-sorted")!;

    // Act & Assert
    expect(extension.activate()).to.not.be.rejected.and.not.null;
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
      const document = await getDocument(SAMPLE_TS_FILENAME);

      // Ensure the document is opened and set as active
      await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

      await waitForDiagnostics(document.uri);

      // Act - Execute the fix command
      await vscode.commands.executeCommand(FixFileCommandHandler.COMMAND.command);

      // Wait for async fix processing
      await delay(2000);

      // Assert - Verify document content has been changed

      expect(document.getText()).to.equal(
        await getDocument(SAMPLE_SORTED_TS_FILENAME).then((doc) => doc.getText())
      );
    });

    it("should not contain any diagnostics after fix workspace", async () => {
      // Arrange - nothing to setup

      // Act
      await vscode.commands.executeCommand(FixWorkspaceCommandHandler.COMMAND.command);

      // Wait for async fix processing
      await delay(3000);

      // Assert - Verify all documents are fixed
      (await workspace.inScopeUris()).forEach(async (uri) => {
        expect(vscode.languages.getDiagnostics(uri)).to.be.empty;
      });
    });
  });
});
