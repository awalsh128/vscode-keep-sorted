import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { describe, it } from "mocha";
import * as path from "path";
import {
  BlockProblem,
  confirmation,
  dirtyFileName,
  dirtyFilePid,
  excludedFileError,
  findingProblems,
  READ_ONLY_TOOLS,
  runTool,
  SortWorkspaceResult,
  ToolFile,
  ToolHost,
  ToolInputError,
} from "../../ai/tools";
import { languageIdForPath, PreferencesResult, WrapPreferences } from "../../ai/wrap";
import { dedent } from "../../common";
import { bundledBinaryPath, KeepSortedBinary } from "../../keepsortedbin";
import { EXT_WORKSPACE_DIR } from "../testing";

use(chaiAsPromised);

const BINARY = new KeepSortedBinary(bundledBinaryPath(EXT_WORKSPACE_DIR));
const UNSORTED_PY = "DEPS = [\n    'requests',\n    'attrs',\n]\n";

/** An in-memory workspace whose sorting uses the bundled binary. */
class FakeHost implements ToolHost {
  readonly extensionVersion = "9.9.9";
  readonly docsDir = path.join(EXT_WORKSPACE_DIR, "docs", "ai");
  readonly files: Map<string, string>;
  private readonly prefs: WrapPreferences;

  constructor(files: Record<string, string>, prefs: WrapPreferences = {}) {
    this.files = new Map(Object.entries(files));
    this.prefs = prefs;
  }

  async resolve(uri: string): Promise<ToolFile> {
    if (!this.files.has(uri)) {
      throw new ToolInputError(`No file ${uri}.`);
    }
    return { id: uri, relativePath: uri, languageId: languageIdForPath(uri) };
  }

  async readText(file: ToolFile): Promise<string> {
    return this.files.get(file.id)!;
  }

  async writeText(file: ToolFile, text: string): Promise<void> {
    this.files.set(file.id, text);
  }

  async preferences(): Promise<PreferencesResult> {
    return { preferences: this.prefs, problems: [] };
  }

  async problems(file: ToolFile): Promise<BlockProblem[]> {
    return findingProblems(BINARY.lint(this.files.get(file.id)!, file.id));
  }

  async sortFile(file: ToolFile): Promise<boolean> {
    const before = this.files.get(file.id)!;
    const after = BINARY.fix(before, file.id) ?? before;
    this.files.set(file.id, after);
    return after !== before;
  }

  async sortWorkspace(): Promise<SortWorkspaceResult> {
    const changed: string[] = [];
    for (const id of this.files.keys()) {
      if (await this.sortFile({ id, relativePath: id, languageId: undefined })) {
        changed.push(id);
      }
    }
    return { changed, remaining: [] };
  }
}

function parse(text: string): Record<string, unknown> {
  return JSON.parse(text);
}

describe("aitools", () => {
  describe("dirty file names", () => {
    it("should read back the process ID it was named with", () => {
      // Act & Assert
      expect(dirtyFilePid(dirtyFileName(4242))).to.equal(4242);
    });

    ["user-settings.json", "dirty-.json", "dirty-12.json.tmp", "dirty-abc.json"].forEach((name) => {
      it(`should not read a process ID from ${name}`, () => {
        // Act & Assert
        expect(dirtyFilePid(name)).to.equal(undefined);
      });
    });
  });

  describe("excludedFileError", () => {
    it("should name the file and the setting", () => {
      // Act
      const error = excludedFileError("gen/a.py");

      // Assert
      expect(error).to.be.instanceOf(ToolInputError);
      expect(error.message).to.equal(
        "gen/a.py is excluded by keep-sorted.exclude; leave it unchanged."
      );
    });
  });

  describe("input validation", () => {
    [
      { name: "keepSorted_run", input: {}, error: /Missing required input "scope"/ },
      {
        name: "keepSorted_run",
        input: { scope: "repo" },
        error: /must be one of: file, workspace/,
      },
      {
        name: "keepSorted_getGuide",
        input: { topic: "x", extra: 1 },
        error: /Unknown input "extra"/,
      },
      {
        name: "keepSorted_wrapRange",
        input: { uri: "a.py", startLine: "2", endLine: 3 },
        error: /"startLine" must be an integer/,
      },
      { name: "keepSorted_sortAll", input: {}, error: /Unknown tool/ },
    ].forEach(({ name, input, error }) => {
      it(`should reject ${JSON.stringify(input)} for ${name}`, async () => {
        // Act & Assert
        await expect(runTool(name, input, new FakeHost({}))).to.be.rejectedWith(
          ToolInputError,
          error
        );
      });
    });
  });

  describe("keepSorted_getGuide", () => {
    it("should return the guide with the versions it matches", async () => {
      // Act
      const text = await runTool("keepSorted_getGuide", { topic: "overview" }, new FakeHost({}));

      // Assert
      expect(text).to.match(
        /^<!-- Keep Sorted 9\.9\.9, keep-sorted v\d+\.\d+\.\d+, topic "overview"/
      );
      expect(text).to.include("# keep-sorted for agents");
    });

    it("should list the topics for an unknown topic", async () => {
      // Act & Assert
      await expect(
        runTool("keepSorted_getGuide", { topic: "faq" }, new FakeHost({}))
      ).to.be.rejectedWith(ToolInputError, /when-not-to-wrap/);
    });
  });

  describe("keepSorted_getPreferences", () => {
    const prefs: WrapPreferences = {
      options: { case: "no" },
      files: { "**/requirements*.txt": { remove_duplicates: "no" } },
    };

    it("should return the preferences alone without a file", async () => {
      // Act
      const result = parse(await runTool("keepSorted_getPreferences", {}, new FakeHost({}, prefs)));

      // Assert
      expect(result).to.deep.equal({ preferences: prefs, problems: [] });
    });

    it("should resolve options for a file", async () => {
      // Arrange
      const host = new FakeHost({ "requirements.txt": "b\na\n" }, prefs);

      // Act
      const result = parse(
        await runTool("keepSorted_getPreferences", { uri: "requirements.txt" }, host)
      );

      // Assert
      expect(result.resolvedOptions).to.deep.equal({ case: "no", remove_duplicates: "no" });
      expect(result.optionSources).to.deep.equal({
        case: "options",
        remove_duplicates: 'files["**/requirements*.txt"]',
      });
    });
  });

  describe("keepSorted_wrapRange", () => {
    it("should wrap with preferences and report the unsorted block", async () => {
      // Arrange
      const host = new FakeHost({ "deps.py": UNSORTED_PY }, { options: { case: "no" } });

      // Act
      const result = parse(
        await runTool("keepSorted_wrapRange", { uri: "deps.py", startLine: 2, endLine: 3 }, host)
      );

      // Assert
      const expected = dedent`
        DEPS = [
            # keep-sorted start case=no
            'requests',
            'attrs',
            # keep-sorted end
        ]`;
      expect(host.files.get("deps.py")).to.equal(`${expected}\n`);
      expect(result.blockProblems).to.have.lengthOf(1);
      expect(result.next).to.match(/keepSorted_run/);
    });

    it("should let explicit options override preferences", async () => {
      // Arrange
      const host = new FakeHost({ "deps.py": UNSORTED_PY }, { options: { case: "no" } });

      // Act
      const result = parse(
        await runTool(
          "keepSorted_wrapRange",
          { uri: "deps.py", startLine: 2, endLine: 3, options: { case: "yes", numeric: "yes" } },
          host
        )
      );

      // Assert
      expect(result.options).to.deep.equal({ case: "yes", numeric: "yes" });
    });

    it("should skip preferences when asked", async () => {
      // Arrange
      const host = new FakeHost({ "deps.py": UNSORTED_PY }, { options: { case: "no" } });

      // Act
      const result = parse(
        await runTool(
          "keepSorted_wrapRange",
          { uri: "deps.py", startLine: 2, endLine: 3, usePreferences: false },
          host
        )
      );

      // Assert
      expect(result.options).to.deep.equal({});
    });

    const refusals: {
      name: string;
      files: Record<string, string>;
      input: Record<string, unknown>;
      error: RegExp;
    }[] = [
      {
        name: "an invalid option value",
        files: { "deps.py": UNSORTED_PY },
        input: { uri: "deps.py", startLine: 2, endLine: 3, options: { order: "up" } },
        error: /Valid values: asc, desc/,
      },
      {
        name: "an invented option",
        files: { "deps.py": UNSORTED_PY },
        input: { uri: "deps.py", startLine: 2, endLine: 3, options: { sort: "yes" } },
        error: /Unknown option "sort". Valid options: skip_lines/,
      },
      {
        name: "a JSON file",
        files: { "package.json": '{\n  "b": 1,\n  "a": 2\n}\n' },
        input: { uri: "package.json", startLine: 2, endLine: 3 },
        error: /cannot contain comments/,
      },
      {
        name: "a range crossing a block",
        files: { "a.py": "x\n# keep-sorted start\nb\na\n# keep-sorted end\n" },
        input: { uri: "a.py", startLine: 1, endLine: 3 },
        error: /partly overlap/,
      },
    ];
    refusals.forEach(({ name, files, input, error }) => {
      it(`should refuse ${name} without changing the file`, async () => {
        // Arrange
        const host = new FakeHost(files);
        const before = new Map(host.files);

        // Act & Assert
        await expect(runTool("keepSorted_wrapRange", input, host)).to.be.rejectedWith(
          ToolInputError,
          error
        );
        expect(host.files).to.deep.equal(before);
      });
    });

    it("should refuse preferences that conflict once merged", async () => {
      // Arrange
      const host = new FakeHost(
        { "deps.py": UNSORTED_PY },
        { options: { by_regex: "\\w+" }, languages: { python: { ignore_prefixes: "x" } } }
      );

      // Act & Assert
      await expect(
        runTool("keepSorted_wrapRange", { uri: "deps.py", startLine: 2, endLine: 3 }, host)
      ).to.be.rejectedWith(ToolInputError, /usePreferences: false/);
    });
  });

  describe("keepSorted_run", () => {
    it("should sort a file and report what remains", async () => {
      // Arrange
      const host = new FakeHost({ "a.py": "# keep-sorted start\nb\na\n# keep-sorted end\n" });

      // Act
      const result = parse(await runTool("keepSorted_run", { scope: "file", uri: "a.py" }, host));

      // Assert
      expect(result).to.include({ file: "a.py", changed: true });
      expect(result.remaining).to.deep.equal([]);
      expect(host.files.get("a.py")).to.equal("# keep-sorted start\na\nb\n# keep-sorted end\n");
    });

    it("should report an unpaired marker as remaining", async () => {
      // Arrange
      const host = new FakeHost({ "a.py": "# keep-sorted start\nb\na\n" });

      // Act
      const result = parse(await runTool("keepSorted_run", { scope: "file", uri: "a.py" }, host));

      // Assert
      expect(JSON.stringify(result.remaining)).to.include("matching 'keep-sorted end'");
    });

    it("should require a uri for scope file", async () => {
      // Act & Assert
      await expect(
        runTool("keepSorted_run", { scope: "file" }, new FakeHost({}))
      ).to.be.rejectedWith(ToolInputError, /needs a uri/);
    });

    it("should sort the workspace", async () => {
      // Arrange
      const host = new FakeHost({ "a.py": "# keep-sorted start\nb\na\n# keep-sorted end\n" });

      // Act
      const result = parse(await runTool("keepSorted_run", { scope: "workspace" }, host));

      // Assert
      expect(result).to.deep.equal({ changed: ["a.py"], remaining: [] });
    });
  });

  describe("confirmation", () => {
    [
      {
        name: "keepSorted_wrapRange",
        input: { uri: "a.py", startLine: 1, endLine: 2 },
        text: /lines 1-2 of a\.py/,
      },
      { name: "keepSorted_run", input: { scope: "workspace" }, text: /every file/ },
      { name: "keepSorted_run", input: { scope: "file", uri: "a.py" }, text: /in a\.py/ },
    ].forEach(({ name, input, text }) => {
      it(`should describe ${name} ${JSON.stringify(input)}`, () => {
        // Act & Assert
        expect(confirmation(name, input)?.message).to.match(text);
      });
    });

    it("should mark only the read tools as read-only", () => {
      // Act & Assert
      expect(READ_ONLY_TOOLS).to.deep.equal(["keepSorted_getGuide", "keepSorted_getPreferences"]);
    });
  });
});
