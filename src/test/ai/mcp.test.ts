import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as os from "os";
import * as path from "path";
import { DiskToolHost, serverLayout, workspaceRoot } from "../../ai/mcp";
import {
  dirtyFileName,
  runTool,
  TOOL_SPECS,
  ToolInputError,
  USER_SETTINGS_FILE,
} from "../../ai/tools";
import { EXT_WORKSPACE_DIR } from "../testing";

use(chaiAsPromised);

const VERSION = "9.9.9";
const UNSORTED = "# keep-sorted start\nb\na\n# keep-sorted end\n";

describe("mcp", () => {
  let root: string;
  let stateDir: string;

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-mcp-"));
    root = path.join(base, "workspace");
    stateDir = path.join(base, "state");
    fs.mkdirSync(root);
    fs.mkdirSync(stateDir);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(root), { recursive: true, force: true });
  });

  function host(): DiskToolHost {
    return new DiskToolHost(root, { installRoot: EXT_WORKSPACE_DIR, stateDir }, VERSION);
  }

  function write(relativePath: string, content: string): string {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  }

  describe("serverLayout", () => {
    it("should use the extension root for a build in dist", () => {
      // Act
      const layout = serverLayout(path.join(EXT_WORKSPACE_DIR, "dist"));

      // Assert
      expect(layout.installRoot).to.equal(EXT_WORKSPACE_DIR);
    });

    it("should use its own directory for an installed copy", () => {
      // Arrange
      const server = path.join(root, "server");
      fs.mkdirSync(path.join(server, "docs", "ai"), { recursive: true });

      // Act
      const layout = serverLayout(server);

      // Assert
      expect(layout).to.deep.equal({ installRoot: server, stateDir: path.join(root, "state") });
    });
  });

  describe("workspaceRoot", () => {
    [
      { argv: ["--root", "proj"], env: {}, expected: path.resolve("/cwd", "proj") },
      { argv: [], env: { CLAUDE_PROJECT_DIR: "/claude" }, expected: "/claude" },
      { argv: [], env: {}, expected: "/cwd" },
    ].forEach(({ argv, env, expected }) => {
      it(`should pick ${expected}`, () => {
        // Act & Assert
        expect(workspaceRoot(argv, env, "/cwd")).to.equal(expected);
      });
    });
  });

  describe("DiskToolHost", () => {
    [
      {
        name: "a path outside the root",
        input: "../escape.py",
        error: /outside the workspace root/,
      },
      { name: "a missing file", input: "missing.py", error: /is not a file/ },
    ].forEach(({ name, input, error }) => {
      it(`should refuse ${name}`, async () => {
        // Act & Assert
        await expect(host().resolve(input)).to.be.rejectedWith(ToolInputError, error);
      });
    });

    it("should resolve a file URI to a workspace-relative path and language", async () => {
      // Arrange
      const file = write("pkg/deps.py", "a\n");

      // Act
      const resolved = await host().resolve(`file://${file}`);

      // Assert
      expect(resolved).to.include({ relativePath: "pkg/deps.py", languageId: "python" });
    });

    it("should merge user and workspace preferences, workspace winning", async () => {
      // Arrange
      fs.writeFileSync(
        path.join(stateDir, USER_SETTINGS_FILE),
        JSON.stringify({
          "keep-sorted.wrap.preferences": { options: { case: "no", numeric: "yes" } },
        })
      );
      write(
        ".vscode/settings.json",
        '{\n  // JSONC comments are allowed\n  "keep-sorted.wrap.preferences": { "options": { "case": "yes" } },\n}\n'
      );

      // Act
      const result = await host().preferences();

      // Assert
      expect(result.preferences.options).to.deep.equal({ case: "yes", numeric: "yes" });
      expect(result.problems).to.deep.equal([]);
    });

    it("should refuse to write a file with unsaved changes in a live window", async () => {
      // Arrange
      const file = write("a.py", UNSORTED);
      fs.writeFileSync(path.join(stateDir, dirtyFileName(process.pid)), JSON.stringify([file]));

      // Act & Assert
      await expect(
        runTool("keepSorted_run", { scope: "file", uri: "a.py" }, host())
      ).to.be.rejectedWith(ToolInputError, /unsaved changes/);
      expect(fs.readFileSync(file, "utf8")).to.equal(UNSORTED);
    });

    it("should ignore unsaved-file lists from windows that have exited", async () => {
      // Arrange
      const file = write("a.py", UNSORTED);
      const deadPid = 2 ** 22 + 12345;
      fs.writeFileSync(path.join(stateDir, dirtyFileName(deadPid)), JSON.stringify([file]));

      // Act
      await runTool("keepSorted_run", { scope: "file", uri: "a.py" }, host());

      // Assert
      expect(fs.readFileSync(file, "utf8")).to.equal(
        "# keep-sorted start\na\nb\n# keep-sorted end\n"
      );
    });

    it("should sort every file with blocks when git is unavailable", async () => {
      // Arrange
      write("one.py", UNSORTED);
      write("nested/two.py", UNSORTED);
      write("node_modules/skip.py", UNSORTED);
      write("plain.py", "b\na\n");

      // Act
      const result = await host().sortWorkspace();

      // Assert
      expect(result.changed.sort()).to.deep.equal(["nested/two.py", "one.py"]);
      expect(fs.readFileSync(path.join(root, "node_modules/skip.py"), "utf8")).to.equal(UNSORTED);
    });

    describe("keep-sorted.exclude", () => {
      const userExclude = (patterns: string[]): void =>
        fs.writeFileSync(
          path.join(stateDir, USER_SETTINGS_FILE),
          JSON.stringify({ "keep-sorted.exclude": patterns })
        );
      const workspaceExclude = (patterns: string[]): void => {
        write(".vscode/settings.json", JSON.stringify({ "keep-sorted.exclude": patterns }));
      };

      [
        { name: "workspace", setUp: () => workspaceExclude(["^generated/"]) },
        { name: "user", setUp: () => userExclude(["^generated/"]) },
      ].forEach(({ name, setUp }) => {
        it(`should refuse a file the ${name} setting excludes`, async () => {
          // Arrange
          write("generated/deps.py", UNSORTED);
          setUp();

          // Act & Assert
          await expect(host().resolve("generated/deps.py")).to.be.rejectedWith(
            ToolInputError,
            /excluded by keep-sorted.exclude/
          );
        });
      });

      it("should let the workspace value replace the user value, as VS Code does", async () => {
        // Arrange
        write("generated/deps.py", UNSORTED);
        userExclude(["^generated/"]);
        workspaceExclude(["^vendor/"]);

        // Act
        const resolved = await host().resolve("generated/deps.py");

        // Assert
        expect(resolved.relativePath).to.equal("generated/deps.py");
      });

      it("should skip excluded files when sorting the workspace", async () => {
        // Arrange
        write("one.py", UNSORTED);
        write("docs/example.md", UNSORTED);
        workspaceExclude(["docs/**"]);

        // Act
        const result = await host().sortWorkspace();

        // Assert
        expect(result.changed).to.deep.equal(["one.py"]);
        expect(fs.readFileSync(path.join(root, "docs/example.md"), "utf8")).to.equal(UNSORTED);
      });
    });
  });

  describe("bundled server over stdio", () => {
    let client: Client;

    beforeEach(async function () {
      this.timeout(15000);
      client = new Client({ name: "keep-sorted-test", version: VERSION });
      // Tests run inside VS Code, whose executable acts as Node with ELECTRON_RUN_AS_NODE.
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [path.join(EXT_WORKSPACE_DIR, "dist", "mcp.js"), "--root", root],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } as Record<string, string>,
          stderr: "pipe",
        })
      );
    });

    afterEach(async () => {
      await client.close();
    });

    it("should list every tool", async () => {
      // Act
      const { tools } = await client.listTools();

      // Assert
      expect(tools.map((tool) => tool.name)).to.deep.equal(TOOL_SPECS.map((spec) => spec.name));
    });

    it("should resolve glob preferences for a file", async () => {
      // Arrange
      write("deploy/versions.txt", "b\na\n");
      write(
        ".vscode/settings.json",
        JSON.stringify({
          "keep-sorted.wrap.preferences": { files: { "**/versions.txt": { numeric: "yes" } } },
        })
      );

      // Act
      const result = await client.callTool({
        name: "keepSorted_getPreferences",
        arguments: { uri: "deploy/versions.txt" },
      });

      // Assert
      const text = (result.content as { text: string }[])[0].text;
      expect(JSON.parse(text).resolvedOptions).to.deep.equal({ numeric: "yes" });
    });

    it("should wrap and sort a file", async () => {
      // Arrange
      const file = write("deps.py", "DEPS = [\n    'requests',\n    'attrs',\n]\n");

      // Act
      await client.callTool({
        name: "keepSorted_wrapRange",
        arguments: { uri: "deps.py", startLine: 2, endLine: 3 },
      });
      await client.callTool({
        name: "keepSorted_run",
        arguments: { scope: "file", uri: "deps.py" },
      });

      // Assert
      expect(fs.readFileSync(file, "utf8")).to.equal(
        "DEPS = [\n    # keep-sorted start\n    'attrs',\n    'requests',\n    # keep-sorted end\n]\n"
      );
    });

    it("should report invalid input as a tool error", async () => {
      // Arrange
      write("deps.py", "b\na\n");

      // Act
      const result = await client.callTool({
        name: "keepSorted_wrapRange",
        arguments: { uri: "deps.py", startLine: 1, endLine: 2, options: { order: "up" } },
      });

      // Assert
      expect(result.isError).to.equal(true);
      expect((result.content as { text: string }[])[0].text).to.include("Valid values: asc, desc");
    });
  });
});
