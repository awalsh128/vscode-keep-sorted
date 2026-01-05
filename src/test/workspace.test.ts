import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import * as workspace from "../workspace";
import * as configuration from "../configuration";
import * as path from "path";

use(sinonChai);

describe("workspace", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
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
    it("filters non-file URI", async () => {
      // Arrange - Open a real document so it appears in textDocuments
      const testFilePath = path.join(__dirname, "..", "..", "test-workspace", "sample.ts");
      const testDoc = await vscode.workspace.openTextDocument(testFilePath);

      // Stub configuration.excluded to return null (not excluded)
      sandbox.stub(configuration, "excluded").returns(null);

      // Act - inScopeDocuments uses vscode.workspace.textDocuments
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
});
