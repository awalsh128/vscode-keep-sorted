import { expect } from "chai";
import * as childProcess from "child_process";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as path from "path";
import * as sinon from "sinon";
import { bundledBinaryPath, KeepSortedBinary } from "../keepsortedbin";
import { EXT_WORKSPACE_DIR } from "./testing";

const LABEL = "sample.ts";
const SORTED_BLOCK = "// keep-sorted start\nalpha\nbeta\n// keep-sorted end\n";
const UNSORTED_BLOCK = "// keep-sorted start\nbeta\nalpha\n// keep-sorted end\n";

/** Builds a spawnSync result with only the fields under test overridden. */
function spawnResult(
  overrides: Partial<childProcess.SpawnSyncReturns<string>>
): childProcess.SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
    ...overrides,
  };
}

describe("keepsortedbin", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("bundledBinaryPath", () => {
    [
      { platform: "linux", arch: "x64", expected: "keep-sorted-linux-amd64" },
      { platform: "darwin", arch: "x64", expected: "keep-sorted-darwin-amd64" },
      { platform: "darwin", arch: "arm64", expected: "keep-sorted-darwin-arm64" },
      { platform: "win32", arch: "x64", expected: "keep-sorted.exe" },
      { platform: "freebsd", arch: "x64", expected: "keep-sorted-linux-amd64" },
    ].forEach(({ platform, arch, expected }) => {
      it(`should pick ${expected} for ${platform} ${arch}`, () => {
        // Act
        const result = bundledBinaryPath("/ext", platform as NodeJS.Platform, arch);

        // Assert
        expect(result.replace(/\\/g, "/")).to.equal(`/ext/bin/${expected}`);
      });
    });
  });

  describe("with the bundled binary", () => {
    const binary = new KeepSortedBinary(bundledBinaryPath(EXT_WORKSPACE_DIR));

    it("should report a finding for an unsorted block", () => {
      // Act
      const findings = binary.lint(UNSORTED_BLOCK, LABEL);

      // Assert
      expect(findings.map((finding) => finding.lines)).to.deep.equal([{ start: 2, end: 3 }]);
    });

    it("should report no findings for a sorted block", () => {
      // Act
      const findings = binary.lint(SORTED_BLOCK, LABEL);

      // Assert
      expect(findings).to.deep.equal([]);
    });

    it("should sort an unsorted block", () => {
      // Act
      const fixed = binary.fix(UNSORTED_BLOCK, LABEL);

      // Assert
      expect(fixed).to.equal(SORTED_BLOCK);
    });

    it("should return sorted content unchanged", () => {
      // Act
      const fixed = binary.fix(SORTED_BLOCK, LABEL);

      // Assert
      expect(fixed).to.equal(SORTED_BLOCK);
    });
  });

  describe("with a stubbed process", () => {
    const binary = new KeepSortedBinary(path.join("/ext", "bin", "keep-sorted-linux-amd64"));

    it("should skip the binary for text without directives", () => {
      // Arrange
      const spawn = sandbox.stub(childProcess, "spawnSync");

      // Act
      const findings = binary.lint("alpha\n", LABEL);

      // Assert
      expect(findings).to.deep.equal([]);
      expect(spawn.called).to.equal(false);
    });

    it("should report the timeout to spawnSync", () => {
      // Arrange
      const spawn = sandbox.stub(childProcess, "spawnSync").returns(spawnResult({ status: 0 }));
      const shortTimeout = new KeepSortedBinary("/ext/bin/keep-sorted-linux-amd64", 5);

      // Act
      shortTimeout.lint(SORTED_BLOCK, LABEL);

      // Assert
      expect(spawn.firstCall.args[2]).to.include({ timeout: 5 });
    });

    [
      {
        name: "unparseable lint output",
        result: spawnResult({ status: 1, stdout: "not json" }),
        expected: /Failed to parse command output/,
      },
      {
        name: "an unexpected exit code",
        result: spawnResult({ status: 2, stderr: "bad flag" }),
        expected: /failed with code 2: bad flag/,
      },
      {
        name: "a spawn error",
        result: spawnResult({ status: null, error: new Error("ENOENT") }),
        expected: /failed to spawn: .*ENOENT/s,
      },
      {
        name: "a terminating signal",
        result: spawnResult({ status: null, signal: "SIGTERM" }),
        expected: /terminated by signal SIGTERM/,
      },
      {
        name: "a missing exit status",
        result: spawnResult({ status: null }),
        expected: /exited without status/,
      },
    ].forEach(({ name, result, expected }) => {
      it(`should throw on ${name}`, () => {
        // Arrange
        sandbox.stub(childProcess, "spawnSync").returns(result);
        const errors: string[] = [];
        const log = { trace: () => {}, debug: () => {}, error: (m: string) => errors.push(m) };

        // Act & Assert
        expect(() => binary.lint(UNSORTED_BLOCK, LABEL, log)).to.throw(Error, expected);
        expect(errors).to.have.length.greaterThan(0);
      });
    });
  });
});
