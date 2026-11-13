import { expect } from "chai";
import * as fs from "fs";
import { describe, it } from "mocha";
import * as os from "os";
import * as path from "path";
import {
  dedent,
  errorMessage,
  isRecord,
  oneLine,
  prettyJson,
  readJsonc,
  writeFileAtomic,
} from "../common";

describe("common", () => {
  describe("isRecord", () => {
    [
      { value: {}, expected: true },
      { value: { a: 1 }, expected: true },
      { value: [], expected: false },
      { value: null, expected: false },
      { value: "text", expected: false },
    ].forEach(({ value, expected }) => {
      it(`should return ${expected} for ${JSON.stringify(value)}`, () => {
        // Act & Assert
        expect(isRecord(value)).to.equal(expected);
      });
    });
  });

  describe("errorMessage", () => {
    [
      { value: new Error("broken"), expected: "broken" },
      { value: "plain", expected: "plain" },
      { value: 42, expected: "42" },
    ].forEach(({ value, expected }) => {
      it(`should return ${expected}`, () => {
        // Act & Assert
        expect(errorMessage(value)).to.equal(expected);
      });
    });
  });

  describe("prettyJson", () => {
    it("should indent by two spaces", () => {
      // Act & Assert
      expect(prettyJson({ a: [1] })).to.equal('{\n  "a": [\n    1\n  ]\n}');
    });
  });

  describe("readJsonc", () => {
    it("should parse comments and trailing commas", () => {
      // Arrange
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-")), "a.json");
      fs.writeFileSync(file, '{\n  // note\n  "a": 1,\n}\n');

      // Act
      const value = readJsonc(file);

      // Assert
      expect(value).to.deep.equal({ a: 1 });
    });

    it("should return undefined for a missing file", () => {
      // Act & Assert
      expect(readJsonc(path.join(os.tmpdir(), "missing-keep-sorted.json"))).to.equal(undefined);
    });
  });

  describe("writeFileAtomic", () => {
    [
      { name: "a new file in a missing directory", existing: undefined },
      { name: "an existing file", existing: "old\n" },
    ].forEach(({ name, existing }) => {
      it(`should write ${name} without leaving a temporary file`, () => {
        // Arrange
        const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-")), "nested");
        const file = path.join(dir, "state.json");
        if (existing !== undefined) {
          fs.mkdirSync(dir);
          fs.writeFileSync(file, existing);
        }

        // Act
        writeFileAtomic(file, "new\n");

        // Assert
        expect(fs.readFileSync(file, "utf8")).to.equal("new\n");
        expect(fs.readdirSync(dir)).to.deep.equal(["state.json"]);
      });
    });
  });

  describe("oneLine", () => {
    it("should join source lines with single spaces", () => {
      // Act
      const text = oneLine`
        First half,
        ${"middle"} and
        last.`;

      // Assert
      expect(text).to.equal("First half, middle and last.");
    });

    it("should keep line breaks inside values", () => {
      // Act & Assert
      expect(oneLine`a ${"b\nc"} d`).to.equal("a b\nc d");
    });
  });

  describe("dedent", () => {
    it("should remove the shared indentation and keep relative indentation", () => {
      // Act
      const text = dedent`
        line one
          ${"value"}
        line three
      `;

      // Assert
      expect(text).to.equal("line one\n  value\nline three");
    });

    it("should leave multi-line values as written", () => {
      // Act
      const text = dedent`
        head
        ${"a\n    b"}`;

      // Assert
      expect(text).to.equal("head\na\n    b");
    });
  });
});
