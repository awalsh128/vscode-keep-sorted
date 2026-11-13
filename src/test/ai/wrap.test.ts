import { expect } from "chai";
import { describe, it } from "mocha";
import {
  findBlocks,
  languageIdForPath,
  markers,
  mergeWrapPreferences,
  parseWrapPreferences,
  resolveOptions,
  WrapError,
  wrapLines,
  WrapPreferences,
} from "../../ai/wrap";

const NO_OPTIONS = {};

describe("wrap", () => {
  describe("languageIdForPath", () => {
    [
      { file: "src/main.go", expected: "go" },
      { file: "go.mod", expected: "go.mod" },
      { file: "app/models.py", expected: "python" },
      { file: "requirements-dev.txt", expected: "pip-requirements" },
      { file: "tsconfig.json", expected: "jsonc" },
      { file: "package.json", expected: "json" },
      { file: ".gitignore", expected: "ignore" },
      { file: "Dockerfile", expected: "dockerfile" },
      { file: "styles/site.css", expected: "css" },
      { file: "notes.unknownext", expected: undefined },
    ].forEach(({ file, expected }) => {
      it(`should infer ${String(expected)} for ${file}`, () => {
        // Act & Assert
        expect(languageIdForPath(file)).to.equal(expected);
      });
    });
  });

  describe("markers", () => {
    [
      { languageId: "python", start: "# keep-sorted start", end: "# keep-sorted end" },
      { languageId: "typescript", start: "// keep-sorted start", end: "// keep-sorted end" },
      { languageId: "sql", start: "-- keep-sorted start", end: "-- keep-sorted end" },
      { languageId: "css", start: "/* keep-sorted start */", end: "/* keep-sorted end */" },
      {
        languageId: "markdown",
        start: "<!-- keep-sorted start -->",
        end: "<!-- keep-sorted end -->",
      },
      { languageId: "vb", start: "' keep-sorted start", end: "' keep-sorted end" },
    ].forEach(({ languageId, start, end }) => {
      it(`should use ${languageId} comment syntax`, () => {
        // Act
        const result = markers(languageId, NO_OPTIONS);

        // Assert
        expect(result).to.deep.equal({ start, end });
      });
    });

    it("should write options in a stable order with indentation", () => {
      // Act
      const result = markers("go", { numeric: "yes", block: "yes" }, "\t");

      // Assert
      expect(result.start).to.equal("\t// keep-sorted start block=yes numeric=yes");
    });

    [
      { languageId: "json", message: /cannot contain comments/ },
      { languageId: "brainfork", message: /No comment syntax is known/ },
    ].forEach(({ languageId, message }) => {
      it(`should refuse ${languageId}`, () => {
        // Act & Assert
        expect(() => markers(languageId, NO_OPTIONS)).to.throw(WrapError, message);
      });
    });
  });

  describe("findBlocks", () => {
    it("should pair nested markers", () => {
      // Arrange
      const lines = [
        "# keep-sorted start",
        "# keep-sorted start",
        "a",
        "# keep-sorted end",
        "#",
        "# keep-sorted end",
      ];

      // Act
      const result = findBlocks(lines);

      // Assert
      expect(result).to.deep.equal({
        blocks: [
          { start: 2, end: 4 },
          { start: 1, end: 6 },
        ],
        unbalanced: [],
      });
    });

    it("should report unpaired markers", () => {
      // Arrange
      const lines = ["# keep-sorted end", "a", "# keep-sorted start"];

      // Act
      const result = findBlocks(lines);

      // Assert
      expect(result.unbalanced).to.deep.equal([1, 3]);
    });
  });

  describe("wrapLines", () => {
    const python = "deps = [\n    'b',\n    'a',\n]\n";

    it("should insert indented markers around the lines", () => {
      // Act
      const result = wrapLines(python, {
        startLine: 2,
        endLine: 3,
        languageId: "python",
        options: { case: "no" },
      });

      // Assert
      expect(result.text).to.equal(
        "deps = [\n    # keep-sorted start case=no\n    'b',\n    'a',\n    # keep-sorted end\n]\n"
      );
      expect([result.startMarkerLine, result.endMarkerLine]).to.deep.equal([2, 5]);
    });

    it("should keep CRLF line endings", () => {
      // Arrange
      const text = "b\r\na\r\n";

      // Act
      const result = wrapLines(text, {
        startLine: 1,
        endLine: 2,
        languageId: "python",
        options: {},
      });

      // Assert
      expect(result.text).to.equal("# keep-sorted start\r\nb\r\na\r\n# keep-sorted end\r\n");
    });

    it("should allow a range that contains a whole block", () => {
      // Arrange
      const text = "x\n# keep-sorted start\nb\na\n# keep-sorted end\ny\n";

      // Act
      const result = wrapLines(text, {
        startLine: 1,
        endLine: 6,
        languageId: "python",
        options: {},
      });

      // Assert
      expect(findBlocks(result.text.split("\n")).unbalanced).to.deep.equal([]);
    });

    [
      { name: "a range past the end", startLine: 1, endLine: 9, message: /outside the file/ },
      { name: "a reversed range", startLine: 3, endLine: 2, message: /outside the file/ },
      { name: "a fractional line", startLine: 1.5, endLine: 2, message: /must be integers/ },
    ].forEach(({ name, startLine, endLine, message }) => {
      it(`should refuse ${name}`, () => {
        // Act & Assert
        expect(() =>
          wrapLines(python, { startLine, endLine, languageId: "python", options: {} })
        ).to.throw(WrapError, message);
      });
    });

    [
      {
        name: "blank lines",
        text: "a\n\n\nb\n",
        startLine: 2,
        endLine: 3,
        message: /blank/,
      },
      {
        name: "a partial overlap with a block",
        text: "x\n# keep-sorted start\nb\na\n# keep-sorted end\n",
        startLine: 1,
        endLine: 3,
        message: /partly overlap the block on lines 2-5/,
      },
      {
        name: "a file with an unpaired marker",
        text: "# keep-sorted start\nb\na\n",
        startLine: 2,
        endLine: 3,
        message: /without a partner on lines 1/,
      },
    ].forEach(({ name, text, startLine, endLine, message }) => {
      it(`should refuse ${name}`, () => {
        // Act & Assert
        expect(() =>
          wrapLines(text, { startLine, endLine, languageId: "python", options: {} })
        ).to.throw(WrapError, message);
      });
    });
  });

  describe("parseWrapPreferences", () => {
    it("should accept a well-formed value", () => {
      // Arrange
      const raw = {
        options: { case: "no" },
        languages: { go: { block: "yes", case: null } },
        files: { "**/go.mod": { numeric: "yes" } },
      };

      // Act
      const result = parseWrapPreferences(raw);

      // Assert
      expect(result).to.deep.equal({ preferences: raw, problems: [] });
    });

    [
      { name: "a non-object", raw: "yes", problem: /must be an object/ },
      { name: "an unknown field", raw: { language: {} }, problem: /Unknown preferences field/ },
      {
        name: "an unknown option",
        raw: { options: { sort: "yes" } },
        problem: /Unknown option "sort"/,
      },
      {
        name: "a bad value",
        raw: { options: { order: "up" } },
        problem: /Valid values: asc, desc/,
      },
      {
        name: "a non-string value",
        raw: { options: { case: false } },
        problem: /must be a string or null/,
      },
      {
        name: "conflicting options",
        raw: { options: { by_regex: "x", ignore_prefixes: "y" } },
        problem: /"by_regex" and "ignore_prefixes" conflict/,
      },
    ].forEach(({ name, raw, problem }) => {
      it(`should report ${name}`, () => {
        // Act
        const result = parseWrapPreferences(raw);

        // Assert
        expect(result.problems.join("\n")).to.match(problem);
      });
    });
  });

  describe("mergeWrapPreferences", () => {
    it("should let the narrower scope win key by key", () => {
      // Arrange
      const user: WrapPreferences = {
        options: { case: "no", numeric: "yes" },
        languages: { go: { block: "yes" } },
      };
      const workspace: WrapPreferences = {
        options: { case: "yes" },
        languages: { go: { group: "no" } },
      };

      // Act
      const result = mergeWrapPreferences(user, workspace);

      // Assert
      expect(result).to.deep.equal({
        options: { case: "yes", numeric: "yes" },
        languages: { go: { block: "yes", group: "no" } },
        files: undefined,
      });
    });
  });

  describe("resolveOptions", () => {
    const preferences: WrapPreferences = {
      options: { case: "no", remove_duplicates: "no" },
      languages: { go: { block: "yes" } },
      files: { "**/versions.txt": { numeric: "yes", case: null } },
    };

    const cases: {
      name: string;
      languageId: string;
      file: string;
      explicit: Record<string, string>;
      expected: Record<string, string>;
    }[] = [
      {
        name: "defaults only",
        languageId: "python",
        file: "app/deps.py",
        explicit: {},
        expected: { case: "no", remove_duplicates: "no" },
      },
      {
        name: "a language override",
        languageId: "go",
        file: "main.go",
        explicit: {},
        expected: { case: "no", remove_duplicates: "no", block: "yes" },
      },
      {
        name: "a file override that removes an option",
        languageId: "plaintext",
        file: "deploy/versions.txt",
        explicit: {},
        expected: { remove_duplicates: "no", numeric: "yes" },
      },
      {
        name: "explicit input over preferences",
        languageId: "go",
        file: "main.go",
        explicit: { block: "no" },
        expected: { case: "no", remove_duplicates: "no", block: "no" },
      },
    ];
    cases.forEach(({ name, languageId, file, explicit, expected }) => {
      it(`should resolve ${name}`, () => {
        // Act
        const result = resolveOptions(preferences, languageId, file, explicit);

        // Assert
        expect(result.options).to.deep.equal(expected);
        expect(result.problems).to.deep.equal([]);
      });
    });

    it("should name the layer each option came from", () => {
      // Act
      const result = resolveOptions(preferences, "go", "main.go", { order: "desc" });

      // Assert
      expect(result.sources).to.deep.equal({
        case: "options",
        remove_duplicates: "options",
        block: "languages.go",
        order: "input",
      });
    });

    it("should report conflicts created by merging layers", () => {
      // Arrange
      const conflicting: WrapPreferences = {
        options: { by_regex: "\\w+" },
        languages: { go: { ignore_prefixes: "const" } },
      };

      // Act
      const result = resolveOptions(conflicting, "go", "main.go");

      // Assert
      expect(result.problems).to.have.lengthOf(1);
    });
  });
});
