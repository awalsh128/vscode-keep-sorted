import { ChildProcess } from "child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import * as path from "path";
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as sinon from "sinon";
import { DEV_PROFILE_SETTINGS, devCachePath, launchDevelopment } from "../dev";

use(chaiAsPromised);

describe("development launcher", (): void => {
  let root: string;
  let child: ChildProcess;
  let download: sinon.SinonStub;
  let start: sinon.SinonStub;

  beforeEach((): void => {
    root = mkdtempSync(path.join(tmpdir(), "keep-sorted-dev-"));
    mkdirSync(path.join(root, "out"));
    writeFileSync(path.join(root, "out", "extension.js"), "");
    child = new ChildProcess();
    download = sinon.stub().resolves(path.join(tmpdir(), "vscode", "code"));
    start = sinon.stub().callsFake((): ChildProcess => {
      setImmediate((): void => {
        child.emit("exit", 0, null);
      });
      return child;
    });
  });

  afterEach((): void => {
    rmSync(root, { recursive: true, force: true });
  });

  it("should launch the local build with isolated state", async (): Promise<void> => {
    // Arrange
    const env = { ELECTRON_RUN_AS_NODE: "1", DISPLAY: ":0" };

    // Act
    await launchDevelopment(root, { download, start }, env);

    // Assert
    expect(download.calledOnce).to.equal(true);
    expect(start.firstCall.args).to.deep.equal([
      path.join(tmpdir(), "vscode", "code"),
      [
        "--new-window",
        `--extensionDevelopmentPath=${root}`,
        `--user-data-dir=${path.join(root, ".vscode-test", "dev-user-data")}`,
        `--extensions-dir=${path.join(root, ".vscode-test", "dev-extensions")}`,
        "--disable-extensions",
        "--log=awalsh128.keep-sorted:debug",
        path.join(root, "test-workspace"),
      ],
      { DISPLAY: ":0" },
    ]);
    expect(env.ELECTRON_RUN_AS_NODE).to.equal("1");
  });

  describe("profile settings", (): void => {
    const settingsPath = (): string =>
      path.join(root, ".vscode-test", "dev-user-data", "User", "settings.json");
    const readSettings = (): Record<string, unknown> =>
      JSON.parse(readFileSync(settingsPath(), "utf-8"));

    it("should set the color theme in a new profile", async (): Promise<void> => {
      // Act
      await launchDevelopment(root, { download, start });

      // Assert
      expect(readSettings()).to.deep.equal(DEV_PROFILE_SETTINGS);
    });

    it("should override a theme chosen earlier and keep other settings", async (): Promise<void> => {
      // Arrange
      mkdirSync(path.dirname(settingsPath()), { recursive: true });
      writeFileSync(
        settingsPath(),
        JSON.stringify({ "workbench.colorTheme": "Visual Studio Dark", "editor.tabSize": 4 })
      );

      // Act
      await launchDevelopment(root, { download, start });

      // Assert
      expect(readSettings()).to.deep.equal({ ...DEV_PROFILE_SETTINGS, "editor.tabSize": 4 });
    });

    it("should leave settings with comments unchanged and still launch", async (): Promise<void> => {
      // Arrange
      const original = '{\n  // keep\n  "editor.tabSize": 4\n}\n';
      mkdirSync(path.dirname(settingsPath()), { recursive: true });
      writeFileSync(settingsPath(), original);
      const warn = sinon.stub(console, "warn");

      try {
        // Act
        await launchDevelopment(root, { download, start });
      } finally {
        warn.restore();
      }

      // Assert
      expect(readFileSync(settingsPath(), "utf-8")).to.equal(original);
      expect(start.calledOnce).to.equal(true);
    });

    it("should not write settings when the build is missing", async (): Promise<void> => {
      // Arrange
      rmSync(path.join(root, "out"), { recursive: true });

      // Act
      await expect(launchDevelopment(root, { download, start })).to.be.rejected;

      // Assert
      expect(existsSync(settingsPath())).to.equal(false);
    });
  });

  it("should reject a VS Code install inside the extension folder", async (): Promise<void> => {
    // Arrange - VS Code would treat its built-in themes as the extension's and ignore the setting
    download.resolves(path.join(root, ".vscode-test", "vscode-linux-x64", "code"));

    // Act
    const result = launchDevelopment(root, { download, start });

    // Assert
    await expect(result).to.be.rejectedWith("inside the extension folder");
    expect(start.called).to.equal(false);
  });

  [
    {
      name: "XDG_CACHE_HOME",
      env: { XDG_CACHE_HOME: "/xdg" },
      expected: "/xdg/vscode-keep-sorted",
    },
    {
      name: "the home cache folder",
      env: {},
      expected: path.join(homedir(), ".cache", "vscode-keep-sorted"),
    },
  ].forEach(({ name, env, expected }): void => {
    it(`should download VS Code under ${name}`, (): void => {
      expect(devCachePath(env)).to.equal(expected);
    });
  });

  it("should reject missing builds before downloading VS Code", async (): Promise<void> => {
    // Arrange
    rmSync(path.join(root, "out"), { recursive: true });

    // Act
    const result = launchDevelopment(root, { download, start });

    // Assert
    await expect(result).to.be.rejectedWith("Local build missing");
    expect(download.called).to.equal(false);
  });

  it("should propagate download failures", async (): Promise<void> => {
    // Arrange
    download.rejects(new Error("Download unavailable"));

    // Act
    const result = launchDevelopment(root, { download, start });

    // Assert
    await expect(result).to.be.rejectedWith("Download unavailable");
    expect(start.called).to.equal(false);
  });

  [
    { event: "error", value: new Error("Launch failed") },
    { event: "exit", value: 1 },
    { event: "exit", value: null },
  ].forEach(({ event, value }): void => {
    it(`should report process ${event} failures`, async (): Promise<void> => {
      // Arrange
      start.callsFake((): ChildProcess => {
        setImmediate((): void => {
          child.emit(event, value, "SIGTERM");
        });
        return child;
      });

      // Act
      const result = launchDevelopment(root, { download, start });

      // Assert
      await expect(result).to.be.rejected;
    });
  });
});
