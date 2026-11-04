import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { describe, it } from "mocha";
import * as sinon from "sinon";
import {
  analyzeCommits,
  changeType,
  commitReleaseType,
  nextReleaseType,
  ReleaseType,
} from "../release-version";

use(chaiAsPromised);

describe("release version", (): void => {
  describe("commitReleaseType", (): void => {
    [
      { message: "fix: sort blocks", expected: "patch" },
      { message: "perf(scan): skip large files", expected: "patch" },
      { message: "revert: undo the scan", expected: "patch" },
      { message: "feat: add a command", expected: "minor" },
      { message: "feat(actions)!: rename the command", expected: "major" },
      { message: "fix: drop a setting\n\nBREAKING CHANGE: the setting is gone", expected: "major" },
      { message: "docs: update the README", expected: null },
      { message: "chore(release): 1.2.0 [skip ci]", expected: null },
      { message: "Fix the scan", expected: null },
    ].forEach(({ message, expected }): void => {
      it(`should map "${message.split("\n")[0]}" to ${expected}`, (): void => {
        // Act & Assert
        expect(commitReleaseType(message)).to.equal(expected);
      });
    });
  });

  describe("changeType", (): void => {
    it("should return the largest bump", (): void => {
      // Act & Assert
      expect(changeType(["docs: a", "fix: b", "feat: c", "fix: d"])).to.equal("minor");
    });

    it("should return null when nothing releases", (): void => {
      // Act & Assert
      expect(changeType(["docs: a", "Plain message"])).to.equal(null);
    });
  });

  describe("nextReleaseType", (): void => {
    [
      { last: "1.0.2", preRelease: true, change: "patch", expected: "minor" },
      { last: "1.0.2", preRelease: true, change: "minor", expected: "minor" },
      { last: "1.1.0", preRelease: true, change: "minor", expected: "patch" },
      { last: "1.1.0", preRelease: true, change: null, expected: null },
      { last: "1.1.1", preRelease: false, change: null, expected: "minor" },
      { last: "1.1.1", preRelease: false, change: "minor", expected: "minor" },
      { last: "1.2.0", preRelease: false, change: "patch", expected: "patch" },
      { last: "1.2.0", preRelease: false, change: null, expected: null },
      { last: "1.2.1", preRelease: false, change: "major", expected: "major" },
      { last: undefined, preRelease: false, change: "minor", expected: "minor" },
    ].forEach(({ last, preRelease, change, expected }): void => {
      const run = preRelease ? "pre-release" : "release";
      it(`should bump ${expected} for a ${run} after ${last} with ${change}`, (): void => {
        // Act & Assert
        expect(nextReleaseType(change as ReleaseType | null, last, preRelease)).to.equal(expected);
      });
    });

    [
      { last: "1.2.0", preRelease: false, change: "minor", error: /pre-release first/ },
      { last: "1.1.0", preRelease: true, change: "major", error: /publish them as a release/ },
      { last: undefined, preRelease: true, change: "patch", error: /Tag the last/ },
    ].forEach(({ last, preRelease, change, error }): void => {
      const run = preRelease ? "pre-release" : "release";
      it(`should refuse a ${change} ${run} after ${last}`, (): void => {
        // Act & Assert
        expect(() => nextReleaseType(change as ReleaseType, last, preRelease)).to.throw(error);
      });
    });
  });

  describe("analyzeCommits", (): void => {
    const context = (env: NodeJS.ProcessEnv) => ({
      commits: [{ message: "fix: sort blocks" }],
      lastRelease: { version: "1.0.2" },
      env,
      logger: { log: sinon.stub() },
    });

    [
      { env: { VSCE_PRE_RELEASE: "true" }, expected: "minor" },
      { env: { VSCE_PRE_RELEASE: "1" }, expected: "minor" },
      { env: { VSCE_PRE_RELEASE: "false" }, expected: "patch" },
      { env: {}, expected: "patch" },
    ].forEach(({ env, expected }): void => {
      it(`should bump ${expected} with VSCE_PRE_RELEASE=${env.VSCE_PRE_RELEASE}`, async () => {
        // Act
        const result = await analyzeCommits({}, context(env));

        // Assert
        expect(result).to.equal(expected);
      });
    });
  });
});
