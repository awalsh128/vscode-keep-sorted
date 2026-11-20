import { expect } from "chai";
import { describe, it } from "mocha";
import { compileExcludePatterns, exactFilePattern, matchingExclude } from "../exclusion";

describe("exclusion", () => {
  describe("compileExcludePatterns", () => {
    [
      { pattern: ".*\\.test\\.ts$", path: "src/a.test.ts", expected: true },
      { pattern: "^generated/", path: "src/generated/a.ts", expected: false },
      // Not a valid regular expression, so it is read as a glob.
      { pattern: "**/*.gen.ts", path: "src/a.gen.ts", expected: true },
      { pattern: "**/*.gen.ts", path: "src/a.ts", expected: false },
    ].forEach(({ pattern, path, expected }) => {
      it(`should ${expected ? "" : "not "}match ${path} with ${pattern}`, () => {
        // Act
        const [regex] = compileExcludePatterns([pattern]);

        // Assert
        expect(regex.test(path)).to.equal(expected);
      });
    });

    it("should warn about a pattern that is neither and match nothing with it", () => {
      // Arrange
      const warnings: string[] = [];

      // Act
      const [regex] = compileExcludePatterns(["[a-"], (message) => warnings.push(message));

      // Assert
      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.include('Invalid exclusion pattern "[a-"');
      expect(regex.test("[a-")).to.equal(false);
    });
  });

  describe("matchingExclude", () => {
    const patterns = compileExcludePatterns(["^docs/", "^/abs/", "^README\\.md$"]);

    [
      { name: "workspace-relative path", relative: "docs/a.md", full: "/w/docs/a.md", index: 0 },
      { name: "full path", relative: "x.md", full: "/abs/x.md", index: 1 },
      { name: "file name", relative: "pkg/README.md", full: "/w/pkg/README.md", index: 2 },
    ].forEach(({ name, relative, full, index }) => {
      it(`should match by ${name}`, () => {
        // Act & Assert
        expect(matchingExclude(patterns, relative, full)).to.equal(patterns[index]);
      });
    });

    it("should return null when nothing matches", () => {
      // Act & Assert
      expect(matchingExclude(patterns, "src/a.ts", "/w/src/a.ts")).to.equal(null);
    });
  });

  describe("exactFilePattern", () => {
    [
      { name: "the file", file: "src/a.ts", other: "src/a.ts", expected: true },
      {
        name: "a file whose name only ends the same",
        file: "a.ts",
        other: "data.ts",
        expected: false,
      },
      {
        name: "a file where a dot stands for another character",
        file: "a.ts",
        other: "aXts",
        expected: false,
      },
      {
        name: "a file in a directory with the same name",
        file: "src",
        other: "src/a.ts",
        expected: false,
      },
      {
        name: "a path with regular expression characters",
        file: "a+(b)[c].ts",
        other: "a+(b)[c].ts",
        expected: true,
      },
      { name: "a Windows path", file: "C:\\w\\a.ts", other: "C:\\w\\a.ts", expected: true },
    ].forEach(({ name, file, other, expected }) => {
      it(`should ${expected ? "" : "not "}match ${name}`, () => {
        // Arrange
        const [regex] = compileExcludePatterns([exactFilePattern(file)]);

        // Act & Assert
        expect(regex.test(other)).to.equal(expected);
      });
    });
  });
});
