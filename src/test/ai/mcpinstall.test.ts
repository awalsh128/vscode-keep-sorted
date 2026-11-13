import { expect } from "chai";
import { randomUUID } from "crypto";
import * as fs from "fs";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { McpServerInstaller } from "../../ai/mcpinstall";
import { DIRTY_FILE_PREFIX, USER_PREFERENCES_FILE } from "../../ai/tools";
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

  it("should mirror user preferences and remove them when unset", () => {
    // Arrange
    const file = path.join(installer.stateDir, USER_PREFERENCES_FILE);

    // Act
    installer.writeUserPreferences({ options: { case: "no" } });
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    installer.writeUserPreferences(undefined);

    // Assert
    expect(written).to.deep.equal({ options: { case: "no" } });
    expect(fs.existsSync(file)).to.equal(false);
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
      fs.readFileSync(
        path.join(installer.stateDir, `${DIRTY_FILE_PREFIX}${process.pid}.json`),
        "utf8"
      )
    );
    expect(dirty).to.include(document.uri.fsPath);
  });
});
