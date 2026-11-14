import { expect, use } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import { contextualizeLogger, logger } from "../instrumentation";

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
            documentPath: vscode.workspace.asRelativePath(mockDocument.uri),
            range: "[2:3]",
          });
        });
      });
    });

    describe("document and range metadata", () => {
      let write: sinon.SinonSpy;

      beforeEach(() => {
        write = sandbox.spy(logger, "write");
      });

      const cases: { name: string; uri: () => vscode.Uri; range?: vscode.Range; text: string }[] = [
        { name: "without range", uri: () => mockUri, text: "" },
        {
          name: "with range",
          uri: () => mockUri,
          range: new vscode.Range(1, 0, 3, 0),
          text: "[2:3]",
        },
      ];

      cases.forEach(({ name, uri, range, text }) => {
        it(`should log the document path ${name}`, () => {
          // Arrange
          const child = contextualizeLogger(uri(), range);

          // Act
          child.info("message");

          // Assert
          expect(write.args[0][0]).to.include({
            documentPath: vscode.workspace.asRelativePath(mockUri),
            range: text,
          });
        });
      });

      it("should log relative path when workspace folder available", () => {
        // Arrange
        sandbox
          .stub(vscode.workspace, "asRelativePath")
          .withArgs(mockDocument.uri)
          .returns(relativePath);

        // Act
        contextualizeLogger(mockDocument.uri).info("message");

        // Assert
        expect(write.args[0][0]).to.include({ documentPath: relativePath, range: "" });
      });
    });
  });
});
