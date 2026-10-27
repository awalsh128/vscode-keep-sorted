import { ChildProcess } from "child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import * as path from "path";
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as sinon from "sinon";
import {
  DEV_PROFILE_SETTINGS,
  ReadFile,
  checkBundledVersion,
  checkCommands,
  checkConsistency,
  checkSettings,
  devCachePath,
  launchDevelopment,
  setupDev,
} from "../dev";

use(chaiAsPromised);

describe("development launcher", (): void => {
  let root: string;
  let child: ChildProcess;
  let download: sinon.SinonStub;
  let start: sinon.SinonStub;

  beforeEach((): void => {
    root = mkdtempSync(path.join(tmpdir(), "keep-sorted-dev-"));
    mkdirSync(path.join(root, "dist"));
    writeFileSync(path.join(root, "dist", "extension.js"), "");
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
      rmSync(path.join(root, "dist"), { recursive: true });

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
    rmSync(path.join(root, "dist"), { recursive: true });

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

describe("consistency checks", (): void => {
  const repoRoot = path.resolve(
    __dirname,
    existsSync(path.join(__dirname, "../../package.json")) ? "../.." : "../../.."
  );
  let overrides: Record<string, string>;
  const read: ReadFile = (relativePath) =>
    overrides[relativePath] ?? readFileSync(path.join(repoRoot, relativePath), "utf-8");

  /** Overrides a repository file with an edit of its current contents. */
  const edit = (relativePath: string, change: (contents: string) => string): void => {
    overrides[relativePath] = change(read(relativePath));
  };
  interface Manifest {
    contributes: {
      commands: { command: string; title: string }[];
      configuration: { properties: Record<string, { default: unknown }> };
      menus: { commandPalette: { command: string }[] };
    };
  }
  const editManifest = (change: (manifest: Manifest) => void): void => {
    edit("package.json", (contents) => {
      const manifest = JSON.parse(contents);
      change(manifest);
      return JSON.stringify(manifest);
    });
  };

  beforeEach((): void => {
    overrides = {};
  });

  it("should find no problems in the repository", (): void => {
    // Act & Assert
    expect(checkConsistency(read)).to.deep.equal([]);
  });

  it("should report a doc naming another keep-sorted version", (): void => {
    // Arrange
    overrides["NOTES.md"] = "Install keep-sorted@v0.9.0.";

    // Act
    const problems = checkBundledVersion(read, ["NOTES.md"]);

    // Assert
    expect(problems).to.have.lengthOf(1);
    expect(problems[0]).to.contain("NOTES.md: names keep-sorted v0.9.0");
  });

  it("should report a README default that differs from package.json", (): void => {
    // Arrange
    edit("README.md", (contents) =>
      contents.replace(
        "| `keep-sorted.enabled`      | `true` ",
        "| `keep-sorted.enabled`      | `false`"
      )
    );

    // Act & Assert
    expect(checkSettings(read)).to.deep.equal([
      "README.md: keep-sorted.enabled default is false, but package.json has true.",
    ]);
  });

  it("should report a setting missing from the README and the interface", (): void => {
    // Arrange
    editManifest((manifest): void => {
      manifest.contributes.configuration.properties["keep-sorted.extra"] = { default: 1 };
    });

    // Act & Assert
    expect(checkSettings(read)).to.deep.equal([
      "README.md: setting keep-sorted.extra is missing from the settings table.",
      "src/configuration.ts: KeepSortedConfiguration is missing extra.",
    ]);
  });

  it("should report settings documented or typed but not defined", (): void => {
    // Arrange
    editManifest((manifest): void => {
      delete manifest.contributes.configuration.properties["keep-sorted.autoComplete"];
    });

    // Act & Assert
    expect(checkSettings(read)).to.deep.equal([
      "README.md: settings table lists keep-sorted.autoComplete, which package.json does not define.",
      "src/configuration.ts: KeepSortedConfiguration has autoComplete, which package.json does not define.",
    ]);
  });

  it("should report an undocumented command outside the Command Palette", (): void => {
    // Arrange
    editManifest((manifest): void => {
      manifest.contributes.commands.push({ command: "keep-sorted.extra", title: "Extra" });
    });

    // Act & Assert
    expect(checkCommands(read)).to.deep.equal([
      "package.json: keep-sorted.extra is missing from menus.commandPalette.",
      "README.md: command ID keep-sorted.extra is not documented.",
      'README.md: command title "Extra" is not documented.',
    ]);
  });

  it("should report a Command Palette entry for an undeclared command", (): void => {
    // Arrange
    editManifest((manifest): void => {
      manifest.contributes.menus.commandPalette.push({ command: "keep-sorted.extra" });
    });

    // Act & Assert
    expect(checkCommands(read)).to.deep.equal([
      "package.json: menus.commandPalette lists undeclared command keep-sorted.extra.",
    ]);
  });
});

describe("development setup", (): void => {
  const read: ReadFile = () => JSON.stringify({ recommendations: ["a.one", "b.two"] });

  it("should enable hooks, install extensions, and compile", (): void => {
    // Arrange
    const run = sinon.stub();

    // Act
    setupDev(read, run, (): void => {});

    // Assert
    expect(run.args).to.deep.equal([
      ["git", ["config", "core.hooksPath", ".githooks"]],
      ["code", ["--install-extension", "a.one"]],
      ["code", ["--install-extension", "b.two"]],
      ["npm", ["run", "compile"]],
    ]);
  });

  it("should list the extensions and still compile without the code CLI", (): void => {
    // Arrange
    const run = sinon.stub();
    run.withArgs("code").throws(new Error("spawn code ENOENT"));
    const log = sinon.stub();

    // Act
    setupDev(read, run, log);

    // Assert
    expect(run.lastCall.args).to.deep.equal(["npm", ["run", "compile"]]);
    expect(log.args.flat().join("\n")).to.contain("Extensions view instead: a.one, b.two.");
  });

  it("should stop when Git hooks cannot be enabled", (): void => {
    // Arrange
    const run = sinon.stub();
    run.withArgs("git").throws(new Error("not a git repository"));

    // Act & Assert
    expect(() => setupDev(read, run, (): void => {})).to.throw("not a git repository");
    expect(run.calledOnce).to.equal(true);
  });
});
