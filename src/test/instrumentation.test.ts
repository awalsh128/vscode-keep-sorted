import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import { logger, getLogPrefix, ErrorTracker, displayMaxErrorAndPrompt } from "../instrumentation";

use(sinonChai);

/* eslint-disable @typescript-eslint/no-unused-expressions */

describe("instrumentation", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getLogPrefix", () => {
    let mockDocument: vscode.TextDocument;

    beforeEach(() => {
      mockDocument = {
        uri: vscode.Uri.file("/test/file.ts"),
        fsPath: "/test/file.ts",
      } as unknown as vscode.TextDocument;
    });

    it("should return document path without range", () => {
      // Arrange
      const expectedPrefix = "/test/file.ts";

      // Act
      const result = getLogPrefix(mockDocument);

      // Assert
      expect(result).to.equal(expectedPrefix);
    });

    it("should return document path with range", () => {
      // Arrange
      const range = new vscode.Range(1, 0, 3, 0);
      const expectedPrefix = "/test/file.ts[2:3]";

      // Act
      const result = getLogPrefix(mockDocument, range);

      // Assert
      expect(result).to.equal(expectedPrefix);
    });

    it("should return relative path when workspace folder available", () => {
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
      const result = getLogPrefix(mockDocument);

      // Assert
      expect(result).to.equal(expectedPrefix);
    });
  });

  describe("ErrorTracker", () => {
    let errorTracker: ErrorTracker;
    let mockDocument: vscode.TextDocument;
    let mockError: Error;

    beforeEach(() => {
      errorTracker = new ErrorTracker();
      mockDocument = {
        uri: vscode.Uri.file("/test/file.ts"),
        fsPath: "/test/file.ts",
      } as unknown as vscode.TextDocument;
      mockError = new Error("Test error");
    });

    describe("constructor", () => {
      it("should create ErrorTracker instance", () => {
        // Arrange - No setup needed

        // Act
        const tracker = new ErrorTracker();

        // Assert
        expect(tracker).to.be.instanceOf(ErrorTracker);
      });
    });

    describe("getUniqueErrors", () => {
      it("should return empty array initially", () => {
        // Arrange - No setup needed

        // Act
        const result = errorTracker.getUniqueErrors();

        // Assert
        expect(result).to.be.an("array").that.is.empty;
      });

      it("should return recorded errors", () => {
        // Arrange
        errorTracker.recordError(mockError, mockDocument);

        // Act
        const result = errorTracker.getUniqueErrors();

        // Assert
        expect(result).to.have.length(1);
        expect(result[0].message).to.equal("Test error");
      });
    });

    describe("recordError", () => {
      it("should record error and return true", async () => {
        // Arrange - No setup needed

        // Act
        const result = await errorTracker.recordError(mockError, mockDocument);

        // Assert
        expect(result).to.be.true;
        const errors = errorTracker.getUniqueErrors();
        expect(errors).to.have.length(1);
      });

      it("should record error with range", async () => {
        // Arrange
        const range = new vscode.Range(0, 0, 0, 10);

        // Act
        const result = await errorTracker.recordError(mockError, mockDocument, range);

        // Assert
        expect(result).to.be.true;
      });
    });

    describe("createGithubIssueUrl", () => {
      it("should return undefined when no errors", async () => {
        // Arrange - No errors recorded

        // Act
        const result = await errorTracker.createGithubIssueUrl();

        // Assert
        expect(result).to.be.undefined;
      });

      it("should create GitHub issue URL with errors", async () => {
        // Arrange
        await errorTracker.recordError(mockError, mockDocument);

        // Act
        const result = await errorTracker.createGithubIssueUrl();

        // Assert
        expect(result).to.be.a("string");
        expect(result).to.include("github.com");
        expect(result).to.include("issues/new");
        expect(result).to.include("template=bug_report.md");
        expect(result).to.include(encodeURIComponent("[BUG] Test error"));
      });
    });
  });

  describe("displayMaxErrorAndPrompt", () => {
    let showErrorMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let writeTextStub: sinon.SinonStub;
    let openExternalStub: sinon.SinonStub;
    let loggerShowStub: sinon.SinonStub;

    beforeEach(() => {
      showErrorMessageStub = sandbox.stub(vscode.window, "showErrorMessage");
      showInformationMessageStub = sandbox.stub(vscode.window, "showInformationMessage");
      writeTextStub = sandbox.stub().resolves();
      sandbox.stub(vscode.env, "clipboard").get(() => ({ writeText: writeTextStub }));
      openExternalStub = sandbox.stub(vscode.env, "openExternal");
      loggerShowStub = sandbox.stub(logger, "show");
    });

    it("should show error message with options", async () => {
      // Arrange
      showErrorMessageStub.resolves(undefined);

      // Act
      await displayMaxErrorAndPrompt("https://example.com");

      // Assert
      expect(showErrorMessageStub).to.have.been.calledWith(
        "Keep-sorted extension has encountered a high number of errors.",
        "Report Issue",
        "Copy Logs",
        "View Logs"
      );
    });

    it("should copy logs and open GitHub when Report Issue selected", async () => {
      // Arrange
      showErrorMessageStub.resolves("Report Issue");

      // Act
      await displayMaxErrorAndPrompt("https://example.com");

      // Assert
      expect(writeTextStub).to.have.been.calledWith("https://example.com");
      expect(showInformationMessageStub).to.have.been.calledWith(
        "Error logs copied to clipboard. Opening create issue on GitHub..."
      );
      expect(openExternalStub).to.have.been.calledWith(vscode.Uri.parse("https://example.com"));
    });

    it("should copy logs when Copy Logs selected", async () => {
      // Arrange
      showErrorMessageStub.resolves("Copy Logs");

      // Act
      await displayMaxErrorAndPrompt("https://example.com");

      // Assert
      expect(writeTextStub).to.have.been.calledWith("https://example.com");
      expect(showInformationMessageStub).to.have.been.calledWith(
        "Keep Sorted error logs copied to clipboard."
      );
    });

    it("should show logger when View Logs selected", async () => {
      // Arrange
      showErrorMessageStub.resolves("View Logs");

      // Act
      await displayMaxErrorAndPrompt("https://example.com");

      // Assert
      expect(loggerShowStub).to.have.been.called;
    });
  });
});
