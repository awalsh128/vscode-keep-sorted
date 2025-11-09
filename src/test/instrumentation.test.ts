import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import { logger, contextualizeLogger } from "../instrumentation";

use(sinonChai);

describe("instrumentation", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("contextualizeLogger", () => {
    const anyLogMessage = "test log message";
    let infoMethod: sinon.SinonStub;
    let mockDocument: vscode.TextDocument;
    let mockUri: vscode.Uri;

    beforeEach(() => {
      mockUri = vscode.Uri.file("/test/file.ts");
      mockDocument = {
        uri: mockUri,
        fsPath: "/test/file.ts",
      } as unknown as vscode.TextDocument;
      infoMethod = sandbox.stub();
      logger.info = infoMethod;
    });

    it("should log document path without range", () => {
      // Arrange
      const expectedPrefix = "/test/file.ts";

      // Act
      logger.info = infoMethod;
      contextualizeLogger(mockDocument).info(anyLogMessage);

      // Assert
      expect(infoMethod).to.have.been.calledWith(`${expectedPrefix} ${anyLogMessage}`);
    });

    it("should log document path with range", () => {
      // Arrange
      const range = new vscode.Range(1, 0, 3, 0);
      const expectedPrefix = "/test/file.ts[2:3]";

      // Act
      contextualizeLogger(mockDocument, range).info(anyLogMessage);

      // Assert
      expect(infoMethod).to.have.been.calledWith(`${expectedPrefix} ${anyLogMessage}`);
    });

    it("should log relative path when workspace folder available", () => {
      // Arrange
      const workspaceFolder = {
        uri: vscode.Uri.file("/test"),
        name: "test",
        index: 0,
      };
      sandbox
        .stub(vscode.workspace, "getWorkspaceFolder")
        .withArgs(mockDocument.uri)
        .returns(workspaceFolder);
      const expectedPrefix = "file.ts";

      // Act
      contextualizeLogger(mockDocument).info(anyLogMessage);

      // Assert
      expect(infoMethod).to.have.been.calledWith(`${expectedPrefix} ${anyLogMessage}`);
    });

    it("should accept URI directly without document", () => {
      // Arrange
      const uri = vscode.Uri.file("/test/direct.ts");

      // Act
      contextualizeLogger(uri).info(anyLogMessage);

      // Assert
      expect(infoMethod).to.have.been.calledWith(`/test/direct.ts ${anyLogMessage}`);
    });

    it("should handle URI with workspace folder", () => {
      // Arrange
      const uri = vscode.Uri.file("/test/workspace/file.ts");
      const workspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "workspace",
        index: 0,
      };
      sandbox.stub(vscode.workspace, "getWorkspaceFolder").withArgs(uri).returns(workspaceFolder);

      // Act
      contextualizeLogger(uri).info(anyLogMessage);

      // Assert
      expect(infoMethod).to.have.been.calledWith(`file.ts ${anyLogMessage}`);
    });
  });
});
