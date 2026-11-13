import { expect } from "chai";
import { randomUUID } from "crypto";
import * as fs from "fs";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { McpServerInstaller } from "../../ai/mcpinstall";
import { dirtyFileName, USER_SETTINGS_FILE } from "../../ai/tools";
import { extensionId } from "../../instrumentation";
import { bundledBinaryPath } from "../../keepsortedbin";
import { EXT_WORKSPACE_DIR, TEST_WORKSPACE_DIR } from "../testing";

describe("mcpinstall", () => {
  let storage: string;
  let installer: McpServerInstaller;

  beforeEach(() => {
    storage = fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-storage-"));
    installer = new McpServerInstaller(EXT_WORKSPACE_DIR, storage);
  });

  afterEach(() => {
    fs.rmSync(storage, { recursive: true, force: true });
  });

  it("should stay disabled until enabled", async () => {
    // Act
    const disposable = await installer.register();
    disposable.dispose();

    // Assert
    expect(installer.installed).to.equal(false);
    expect(fs.existsSync(path.join(storage, "mcp"))).to.equal(false);
  });

  it("should install the server, docs, and this platform's binary", () => {
    // Act
    installer.enable();

    // Assert
    const binary = path.join(installer.serverDir, "bin", path.basename(bundledBinaryPath("")));
    expect(installer.installed).to.equal(true);
    expect(fs.existsSync(path.join(installer.serverDir, "docs", "ai", "README.md"))).to.equal(true);
    expect(fs.statSync(binary).mode & 0o111).to.not.equal(0);
    expect(fs.readFileSync(path.join(installer.serverDir, "version.txt"), "utf8")).to.equal(
      extensionId.version
    );
  });

  it("should leave a current copy in place", () => {
    // Arrange
    installer.install();
    const marker = path.join(installer.serverDir, "marker");
    fs.writeFileSync(marker, "");

    // Act
    installer.install();

    // Assert
    expect(fs.existsSync(marker)).to.equal(true);
  });

  it("should replace an outdated copy", () => {
    // Arrange
    installer.install();
    fs.writeFileSync(path.join(installer.serverDir, "version.txt"), "0.0.1");
    const marker = path.join(installer.serverDir, "marker");
    fs.writeFileSync(marker, "");

    // Act
    installer.install();

    // Assert
    expect(fs.existsSync(marker)).to.equal(false);
  });

  it("should launch the installed script with node", () => {
    // Act & Assert
    expect(installer.launchCommand()).to.deep.equal({
      command: "node",
      args: [path.join(storage, "mcp", "server", "mcp.js")],
    });
  });

  it("should mirror the user-level settings the server reads", async function () {
    this.timeout(10000);
    // Arrange
    const file = path.join(installer.stateDir, USER_SETTINGS_FILE);
    const config = vscode.workspace.getConfiguration("keep-sorted");
    const global = vscode.ConfigurationTarget.Global;
    try {
      await config.update("wrap.preferences", { options: { case: "no" } }, global);
      await config.update("exclude", ["generated/"], global);

      // Act
      installer.writeUserSettings();
      const written = JSON.parse(fs.readFileSync(file, "utf8"));

      // Assert
      expect(written).to.deep.equal({
        "keep-sorted.wrap.preferences": { options: { case: "no" } },
        "keep-sorted.exclude": ["generated/"],
      });
    } finally {
      await config.update("wrap.preferences", undefined, global);
      await config.update("exclude", undefined, global);
    }
  });

  it("should mirror nothing when no user-level settings are set", () => {
    // Act
    installer.writeUserSettings();

    // Assert
    const written = JSON.parse(
      fs.readFileSync(path.join(installer.stateDir, USER_SETTINGS_FILE), "utf8")
    );
    expect(written).to.deep.equal({});
  });

  it("should record files with unsaved changes", async () => {
    // Arrange
    const uri = vscode.Uri.file(path.join(TEST_WORKSPACE_DIR, `mcpinstall-${randomUUID()}.txt`));
    await vscode.workspace.fs.writeFile(uri, Buffer.from("saved\n"));
    const document = await vscode.workspace.openTextDocument(uri);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 0), "unsaved ");
    await vscode.workspace.applyEdit(edit);

    // Act
    installer.writeDirtyFiles(true);

    // Assert
    const dirty = JSON.parse(
      fs.readFileSync(path.join(installer.stateDir, dirtyFileName(process.pid)), "utf8")
    );
    expect(dirty).to.include(document.uri.fsPath);
  });
});
