import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as os from "os";
import * as path from "path";
import { DiskToolHost } from "../../../ai/mcp";
import { runTool, ToolInputError } from "../../../ai/tools";
import { EXT_WORKSPACE_DIR } from "../../testing";
import { EVAL_CASES, EvalCase } from "./cases";
import { grade, main } from "./grade";

use(chaiAsPromised);

/*
 * Automated layer of the agent evals: replays each case's reference action through the shared
 * tools on a scratch workspace and grades the result, and checks the grader rejects wrong outputs.
 * Agent behavior itself is graded by hand; see README.md beside this file.
 */

describe("ai evals", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-evals-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Writes the case's file and preferences to the scratch workspace. */
  function setUp(evalCase: EvalCase): { host: DiskToolHost; file: string } {
    const file = path.join(root, evalCase.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, evalCase.input);
    if (evalCase.preferences) {
      fs.mkdirSync(path.join(root, ".vscode"));
      fs.writeFileSync(
        path.join(root, ".vscode", "settings.json"),
        JSON.stringify({ "keep-sorted.wrap.preferences": evalCase.preferences })
      );
    }
    const layout = { installRoot: EXT_WORKSPACE_DIR, stateDir: path.join(root, ".state") };
    return { host: new DiskToolHost(root, layout, "0.0.0"), file };
  }

  it("should have between 12 and 16 cases with unique ids", () => {
    // Act
    const ids = EVAL_CASES.map((evalCase) => evalCase.id);

    // Assert
    expect(ids.length).to.be.within(12, 16);
    expect(new Set(ids).size).to.equal(ids.length);
  });

  describe("reference actions through the tools", () => {
    EVAL_CASES.filter((c) => c.wrap !== null && c.category !== "markers").forEach((evalCase) => {
      it(`should pass ${evalCase.id}`, async () => {
        // Arrange
        const { host, file } = setUp(evalCase);
        const explicit = evalCase.category === "preferences" ? {} : evalCase.wrap!.options;

        // Act
        await runTool(
          "keepSorted_wrapRange",
          { uri: evalCase.file, ...evalCase.wrap, options: explicit },
          host
        );
        await runTool("keepSorted_run", { scope: "file", uri: evalCase.file }, host);

        // Assert
        expect(grade(evalCase, fs.readFileSync(file, "utf8"))).to.deep.equal([]);
      });
    });

    EVAL_CASES.filter((c) => c.wrap === null).forEach((evalCase) => {
      it(`should leave ${evalCase.id} unchanged when no tool is called`, () => {
        // Act & Assert
        expect(grade(evalCase, evalCase.input)).to.deep.equal([]);
      });
    });

    EVAL_CASES.filter((c) => c.repaired !== undefined).forEach((evalCase) => {
      it(`should accept the repaired ${evalCase.id} and reject the input`, () => {
        // Act & Assert
        expect(grade(evalCase, evalCase.repaired!)).to.deep.equal([]);
        expect(grade(evalCase, evalCase.input)).to.not.deep.equal([]);
      });
    });

    it("should refuse to wrap inside a file with an unpaired marker", async () => {
      // Arrange
      const evalCase = EVAL_CASES.find((c) => c.id === "unbalanced-marker")!;
      const { host } = setUp(evalCase);

      // Act & Assert
      await expect(
        runTool("keepSorted_wrapRange", { uri: evalCase.file, startLine: 3, endLine: 4 }, host)
      ).to.be.rejectedWith(ToolInputError, /without a partner/);
    });
  });

  describe("grader negative controls", () => {
    EVAL_CASES.filter((c) => c.wrap === null).forEach((evalCase) => {
      it(`should reject wrapping and sorting ${evalCase.id}`, async () => {
        // Arrange
        const { host, file } = setUp(evalCase);
        const lastLine = evalCase.input.trimEnd().split("\n").length;

        // Act
        await runTool(
          "keepSorted_wrapRange",
          { uri: evalCase.file, startLine: 1, endLine: lastLine },
          host
        ).catch(() => undefined);
        await runTool("keepSorted_run", { scope: "file", uri: evalCase.file }, host);

        // Assert
        expect(grade(evalCase, fs.readFileSync(file, "utf8"))).to.not.deep.equal([]);
      });
    });

    [
      {
        name: "another language's comment syntax",
        id: "python-dependency-list",
        output:
          '[\n    // keep-sorted start\n    "attrs",\n    "numpy",\n    "requests",\n    // keep-sorted end\n]\n',
        problem: /comment syntax/,
      },
      {
        name: "a missing numeric option",
        id: "yaml-version-list",
        output:
          'versions:\n  # keep-sorted start\n  - "1.10.0"\n  - "1.2.0"\n  - "1.9.2"\n  # keep-sorted end\n',
        problem: /needs numeric=yes/,
      },
      {
        name: "an option the preferences do not ask for",
        id: "preferences-default",
        output: "# keep-sorted start case=no\nads\nBilling\nsearch\n# keep-sorted end\n",
        problem: /do not ask for: case/,
      },
      {
        name: "a lost line",
        id: "preferences-file-glob",
        output: "# keep-sorted start remove_duplicates=no\nalpha\nbeta\n# keep-sorted end\n",
        problem: /added, removed, or changed/,
      },
    ].forEach(({ name, id, output, problem }) => {
      it(`should reject ${name}`, () => {
        // Arrange
        const evalCase = EVAL_CASES.find((c) => c.id === id)!;

        // Act
        const problems = grade(evalCase, output);

        // Assert
        expect(problems.join(" ")).to.match(problem);
      });
    });
  });

  describe("grade CLI", () => {
    it("should pass a correct output file and fail an unchanged one", () => {
      // Arrange
      const evalCase = EVAL_CASES.find((c) => c.id === "unbalanced-marker")!;
      const good = path.join(root, "good.py");
      const bad = path.join(root, "bad.py");
      fs.writeFileSync(good, evalCase.repaired!);
      fs.writeFileSync(bad, evalCase.input);

      // Act & Assert
      expect(main(["grade", evalCase.id, good])).to.equal(0);
      expect(main(["grade", evalCase.id, bad])).to.equal(1);
      expect(main(["grade", "no-such-case", good])).to.equal(2);
    });
  });
});
