import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import * as workspace from "../workspace";
import * as configuration from "../configuration";

use(sinonChai);

/* eslint-disable @typescript-eslint/no-unused-expressions */

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
      expect(result).to.be.false;
    });

    it("returns true for file scheme when not excluded", () => {
      // Arrange
      const uri = vscode.Uri.file("/project/file.ts");
      // Stub configuration.excluded to return null (not excluded)
      sandbox.stub(configuration, "excluded").withArgs(uri).returns(null);

      // Act
      const result = workspace.isInScope(uri);

      // Assert
      expect(result).to.be.true;
    });

    it("returns false when excluded by configuration", () => {
      // Arrange
      const uri = vscode.Uri.file("/project/ignore.me");
      const fakeRegex = /ignore/;
      sandbox.stub(configuration, "excluded").withArgs(uri).returns(fakeRegex);

      // Act
      const result = workspace.isInScope(uri);

      // Assert
      expect(result).to.be.false;
    });
  });

  describe("inScopeUris", () => {
    it("filters non-file URI", async () => {
      // Arrange
      const file1 = vscode.Uri.parse("git:/repo/one.ts");
      const file2 = vscode.Uri.file("/a/two.ts");
      sandbox.stub(vscode.workspace, "findFiles").resolves([file1, file2]);

      // Act
      const results = (await workspace.inScopeUris()).map((uri) => uri.fsPath);

      // Assert
      expect(results).to.contain.members([file2.fsPath]);
    });

    it("filters excluded URIs", async () => {
      // Arrange
      const file1 = vscode.Uri.parse("git:/repo/one.ts");
      const file2 = vscode.Uri.file("/a/two.ts");
      sandbox.stub(vscode.workspace, "findFiles").resolves([file1, file2]);
      sandbox.stub(configuration, "excluded").withArgs(file2).returns(/two/);

      // Act
      const results = (await workspace.inScopeUris()).map((uri) => uri.fsPath);

      // Assert
      expect(results).to.not.contain.members([file2.fsPath]);
    });
  });
});
