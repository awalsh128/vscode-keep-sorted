import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import * as winston from "winston";
import { contextualizeLogger, logger, setLogLevel } from "../instrumentation";

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

  describe("setLogLevel", () => {
    it("should set the logger and transport levels", () => {
      // Arrange
      const transport = new winston.transports.Console({ level: "info", silent: true });
      const testLogger = winston.createLogger({ level: "info", transports: [transport] });

      // Act
      setLogLevel(testLogger, "debug");

      // Assert
      expect(testLogger.level).to.equal("debug");
      expect(transport.level).to.equal("debug");
    });
  });

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

    describe("logged lines", () => {
      // Child loggers pass their metadata to the shared logger's write().
      let write: sinon.SinonSpy;
      const written = (): Record<string, unknown>[] => write.args.map(([info]) => info);

      beforeEach(() => {
        write = sandbox.spy(logger, "write");
      });

      it("should build lazy debug messages only when logging them", () => {
        // Arrange
        sandbox.stub(logger, "isLevelEnabled").returns(true);
        const child = contextualizeLogger(mockDocument.uri);

        // Act
        child.debugLazy(() => "built message");

        // Assert
        expect(written()).to.have.lengthOf(1);
        expect(written()[0]).to.include({ level: "debug", message: "built message" });
      });

      ["error", "warn", "info"].forEach((level) => {
        it(`should include the document path and range in ${level} lines`, () => {
          // Arrange
          const range = new vscode.Range(1, 0, 3, 0);
          const child = contextualizeLogger(mockDocument.uri, range);

          // Act
          (child[level as "error" | "warn" | "info"] as (message: string) => void)("message");

          // Assert
          expect(written()).to.have.lengthOf(1);
          expect(written()[0]).to.include({
            message: "message",
            documentRelativePath: vscode.workspace.asRelativePath(mockDocument.uri),
            range: "[2:3]",
          });
        });
      });
    });

    it("should log document path without range", () => {
      // Act
      const child = contextualizeLogger(mockDocument.uri);

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
      const child = contextualizeLogger(mockDocument.uri, range);

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
      const child = contextualizeLogger(mockDocument.uri);

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
