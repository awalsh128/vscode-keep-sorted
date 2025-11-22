import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import { contextualizeLogger } from "../instrumentation";

use(sinonChai);

describe("instrumentation", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const relativePath = "relative/path/to/file.ts";

  describe("contextualizeLogger", () => {
    let mockDocument: vscode.TextDocument;
    let mockUri: vscode.Uri;

    beforeEach(() => {
      mockUri = vscode.Uri.file("/test/file.ts");
      mockDocument = {
        uri: mockUri,
        fsPath: "/test/file.ts",
      } as unknown as vscode.TextDocument;
    });

    it("should log document path without range", () => {
      // Act
      const child = contextualizeLogger(mockDocument);

      // Assert
      const relativePath = vscode.workspace.asRelativePath(mockDocument.uri);
      expect(child.defaultMeta).to.deep.equal({
        documentRelativePath: relativePath,
        range: "",
      });
    });

    it("should log document path with range", () => {
      // Arrange
      const range = new vscode.Range(1, 0, 3, 0);

      // Act
      const child = contextualizeLogger(mockDocument, range);

      // Assert
      const relativePath = vscode.workspace.asRelativePath(mockDocument.uri);
      expect(child.defaultMeta).to.deep.equal({
        documentRelativePath: relativePath,
        range: "[2:3]",
      });
    });

    it("should log relative path when workspace folder available", () => {
      // Arrange
      sandbox
        .stub(vscode.workspace, "asRelativePath")
        .withArgs(mockDocument.uri)
        .returns(relativePath);

      // Act
      const child = contextualizeLogger(mockDocument);

      // Assert
      expect(child.defaultMeta).to.deep.equal({
        documentRelativePath: relativePath,
        range: "",
      });
    });

    it("should accept URI directly without document", () => {
      // Arrange
      const uri = vscode.Uri.file("/test/direct.ts");

      // Act
      const child = contextualizeLogger(uri);

      // Assert
      expect(child.defaultMeta).to.deep.equal({
        documentRelativePath: vscode.workspace.asRelativePath(uri),
        range: "",
      });
    });

    it("should handle URI with workspace folder", () => {
      // Arrange
      const expectedRelativePath = "folder/file.ts";
      const workspaceFolder = "/test/workspace";
      const uri = vscode.Uri.file(workspaceFolder + "/" + expectedRelativePath);
      sandbox.stub(vscode.workspace, "asRelativePath").withArgs(uri).returns(expectedRelativePath);

      // Act
      const child = contextualizeLogger(uri);

      // Assert
      expect(child.defaultMeta).to.deep.equal({
        documentRelativePath: expectedRelativePath,
        range: "",
      });
    });
  });
});
