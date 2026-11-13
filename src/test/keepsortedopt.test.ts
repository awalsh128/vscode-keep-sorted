import { expect } from "chai";
import { describe, it } from "mocha";
import * as vscode from "vscode";
import {
  Directive,
  formatOptions,
  isValidCompletionPosition,
  KEEP_SORTED_OPTS,
  KeepSortedOption,
  KeepSortedOptionCategory,
  validateOptions,
} from "../keepsortedopt";

// Expected option keys based on google/keep-sorted
const EXPECTED_OPTION_KEYS = [
  "skip_lines",
  "group",
  "group_prefixes",
  "block",
  "sticky_comments",
  "sticky_prefixes",
  "group_start_regex",
  "group_end_regex",
  "order",
  "case",
  "numeric",
  "prefix_order",
  "ignore_prefixes",
  "by_regex",
  "newline_separated",
  "remove_duplicates",
  "allow_yaml_lists",
];

describe("keepsortedopt", () => {
  describe("KEEP_SORTED_OPTIONS", () => {
    it("should contain exactly all expected option keys", () => {
      // Arrange & Act
      const keys = Array.from(KEEP_SORTED_OPTS.keys());

      // Assert
      expect(keys).to.deep.equal(EXPECTED_OPTION_KEYS);
    });

    Array.from(KEEP_SORTED_OPTS.values()).forEach((option) => {
      it(`should have all option values populated for '${option.key}'`, () => {
        expect(option.key).to.be.a("string").and.to.have.length.greaterThan(0);
        expect(option.description).to.be.a("string").and.to.have.length.greaterThan(0);
        expect(option.valueType).to.be.oneOf([
          "bool",
          "intOrBool",
          "intList",
          "list",
          "regexList",
          "enum",
        ]);
        expect(option.documentation).to.be.a("string").and.to.have.length.greaterThan(0);
        expect(option.category).to.be.oneOf(Object.values(KeepSortedOptionCategory));
        // defaultValue is optional - only validate if present
        if (option.defaultValue !== undefined) {
          expect(option.defaultValue).to.be.a("string").and.to.have.length.greaterThan(0);
        }
      });
    });
  });

  describe("KeepSortedOption.parseValue", () => {
    describe("bool type", () => {
      const boolOption = KEEP_SORTED_OPTS.get("case")!;

      [
        { input: "yes", expected: true },
        { input: "true", expected: true },
        { input: "no", expected: false },
        { input: "false", expected: false },
      ].forEach(({ input, expected }) => {
        it(`should parse '${input}' as ${expected}`, () => {
          expect(boolOption.parseValue(input)).to.equal(expected);
        });
      });

      // keep-sorted matches bool keywords case-sensitively
      ["invalid", "", "1", "YES", "No"].forEach((input) => {
        it(`should return error for '${input || "(empty)"}'`, () => {
          const result = boolOption.parseValue(input);
          expect(result).to.be.instanceOf(Error);
          expect((result as Error).message).to.include("Invalid boolean value");
        });
      });
    });

    describe("intOrBool type", () => {
      const option = KEEP_SORTED_OPTS.get("newline_separated")!;

      [
        { input: "yes", expected: 1 },
        { input: "no", expected: 0 },
        { input: "0", expected: 0 },
        { input: "2", expected: 2 },
      ].forEach(({ input, expected }) => {
        it(`should parse '${input}' as ${expected}`, () => {
          expect(option.parseValue(input)).to.equal(expected);
        });
      });

      ["-1", "1.5", "", "maybe"].forEach((input) => {
        it(`should return error for '${input || "(empty)"}'`, () => {
          expect(option.parseValue(input)).to.be.instanceOf(Error);
        });
      });
    });

    describe("intList type", () => {
      const option = KEEP_SORTED_OPTS.get("skip_lines")!;

      [
        { input: "1", expected: [1] },
        { input: "1,-1", expected: [1, -1] },
        { input: "", expected: [] },
        { input: "[2, -3]", expected: [2, -3] },
      ].forEach(({ input, expected }) => {
        it(`should parse '${input || "(empty)"}' as ${JSON.stringify(expected)}`, () => {
          expect(option.parseValue(input)).to.deep.equal(expected);
        });
      });

      ["abc", "1,x", "1.5"].forEach((input) => {
        it(`should return error for '${input}'`, () => {
          const result = option.parseValue(input);
          expect(result).to.be.instanceOf(Error);
          expect((result as Error).message).to.include("Invalid integer list");
        });
      });
    });

    describe("list type", () => {
      const listOption = KEEP_SORTED_OPTS.get("prefix_order")!;

      [
        { input: "INIT_,MIDDLE_,FINAL_", expected: ["INIT_", "MIDDLE_", "FINAL_"] },
        // Empty items are meaningful: prefix_order uses them to position unmatched lines
        { input: "INIT_,,FINAL_", expected: ["INIT_", "", "FINAL_"] },
        { input: "", expected: [] },
        { input: "single", expected: ["single"] },
        { input: "[a, 'b c', \"d\"]", expected: ["a", "b c", "d"] },
        { input: "[]", expected: [] },
      ].forEach(({ input, expected }) => {
        it(`should parse '${input || "(empty)"}' as ${JSON.stringify(expected)}`, () => {
          expect(listOption.parseValue(input)).to.deep.equal(expected);
        });
      });

      it("should parse set options as lists", () => {
        expect(KEEP_SORTED_OPTS.get("group_prefixes")!.parseValue("and,with")).to.deep.equal([
          "and",
          "with",
        ]);
      });
    });

    describe("regexList type", () => {
      const regexOption = KEEP_SORTED_OPTS.get("by_regex")!;

      [
        { input: "\\w+;", expectedSources: ["\\w+;"] },
        { input: "^[a-z]+$,\\d+", expectedSources: ["^[a-z]+$", "\\d+"] },
        // Go inline flags have no JavaScript equivalent and are dropped for validation
        { input: "(?i)foo", expectedSources: ["foo"] },
      ].forEach(({ input, expectedSources }) => {
        it(`should parse '${input}' as valid RegExps`, () => {
          const result = regexOption.parseValue(input) as RegExp[];
          expect(result.map((r) => r.source)).to.deep.equal(expectedSources);
        });
      });

      it("should leave YAML pattern-to-template items for keep-sorted to validate", () => {
        expect(regexOption.parseValue("['(\\d+)': '${1}']")).to.deep.equal(["'(\\d+)': '${1}'"]);
      });

      ["[invalid", "(unclosed", "ok,(bad"].forEach((input) => {
        it(`should return error for '${input}'`, () => {
          const result = regexOption.parseValue(input);
          expect(result).to.be.instanceOf(Error);
          expect((result as Error).message).to.include("Invalid regex pattern");
        });
      });
    });

    describe("enum type", () => {
      [
        { key: "order", valid: ["asc", "desc"], invalid: ["ASC", "up"] },
        {
          key: "remove_duplicates",
          valid: ["yes", "true", "no", "false", "keep_first_comment", "merge_comments"],
          invalid: ["merge"],
        },
      ].forEach(({ key, valid, invalid }) => {
        const option = KEEP_SORTED_OPTS.get(key)!;
        valid.forEach((input) => {
          it(`should accept '${key}=${input}'`, () => {
            expect(option.parseValue(input)).to.equal(input);
          });
        });
        invalid.forEach((input) => {
          it(`should reject '${key}=${input}'`, () => {
            expect(option.parseValue(input)).to.be.instanceOf(Error);
          });
        });
      });
    });
  });

  describe("Directive.create", () => {
    it("should return undefined for non-keep-sorted line", () => {
      // Arrange
      const lineText = "const x = 1;";

      // Act
      const result = Directive.create(lineText);

      // Assert
      expect(result).to.equal(undefined);
    });

    it("should return directive with empty optionsText for line without options", () => {
      // Arrange
      const lineText = "// keep-sorted start";

      // Act
      const result = Directive.create(lineText);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.optionsText.trim()).to.equal("");
      expect(result!.wellformed).to.have.lengthOf(0);
    });

    it("should extract single option", () => {
      // Arrange
      const lineText = "// keep-sorted start case=yes";

      // Act
      const result = Directive.create(lineText);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.wellformed).to.have.lengthOf(1);
      expect(result!.wellformed[0].key).to.equal("case");
      expect(result!.wellformed[0].value).to.equal("yes");
    });

    it("should extract multiple options", () => {
      // Arrange
      const lineText = "// keep-sorted start case=yes numeric=no skip_lines=1";

      // Act
      const result = Directive.create(lineText);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.wellformed).to.have.lengthOf(3);
      const keys = result!.wellformed.map((t) => t.key);
      expect(keys).to.include("case");
      expect(keys).to.include("numeric");
      expect(keys).to.include("skip_lines");
    });

    it("should handle leading whitespace", () => {
      // Arrange
      const lineText = "  // keep-sorted start case=yes";

      // Act
      const result = Directive.create(lineText);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.wellformed).to.have.lengthOf(1);
      expect(result!.wellformed[0].key).to.equal("case");
    });

    it("should parse options even with invalid entries mixed in", () => {
      // Arrange - 'invalid' without equals is not matched by the regex
      const lineText = "// keep-sorted start case=yes numeric=no";

      // Act
      const result = Directive.create(lineText);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.wellformed).to.have.lengthOf(2);
    });

    it("should handle extra whitespace between options", () => {
      // Arrange
      const lineText = "// keep-sorted start   case=yes    numeric=no";

      // Act
      const result = Directive.create(lineText);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.wellformed).to.have.lengthOf(2);
    });

    it("should return undefined for keep-sorted end line", () => {
      // Arrange
      const lineText = "// keep-sorted end";

      // Act
      const result = Directive.create(lineText);

      // Assert
      expect(result).to.equal(undefined);
    });
  });

  describe("isValidCompletionPosition", () => {
    // Helper to create a mock document with given lines
    function createMockDocument(lines: string[]): vscode.TextDocument {
      return {
        lineAt: (lineNumber: number) => ({
          text: lines[lineNumber] || "",
          range: new vscode.Range(lineNumber, 0, lineNumber, (lines[lineNumber] || "").length),
          rangeIncludingLineBreak: new vscode.Range(
            lineNumber,
            0,
            lineNumber,
            (lines[lineNumber] || "").length + 1
          ),
          firstNonWhitespaceCharacterIndex: 0,
          isEmptyOrWhitespace: false,
          lineNumber: lineNumber,
        }),
        lineCount: lines.length,
      } as vscode.TextDocument;
    }

    it("should return false for non-keep-sorted line", () => {
      // Arrange
      const document = createMockDocument(["const x = 1;"]);
      const position = new vscode.Position(0, 5);

      // Act
      const result = isValidCompletionPosition(document, position);

      // Assert
      expect(result).to.equal(false);
    });

    it("should return true when cursor is after 'start' keyword", () => {
      // Arrange
      const document = createMockDocument(["// keep-sorted start "]);
      const position = new vscode.Position(0, 21);

      // Act
      const result = isValidCompletionPosition(document, position);

      // Assert
      expect(result).to.equal(true);
    });

    it("should return false when cursor is before 'start' keyword", () => {
      // Arrange
      const document = createMockDocument(["// keep-sorted start"]);
      const position = new vscode.Position(0, 5);

      // Act
      const result = isValidCompletionPosition(document, position);

      // Assert
      expect(result).to.equal(false);
    });

    it("should return true when cursor is at end of start keyword", () => {
      // Arrange
      const document = createMockDocument(["// keep-sorted start"]);
      const position = new vscode.Position(0, 20);

      // Act
      const result = isValidCompletionPosition(document, position);

      // Assert
      expect(result).to.equal(true);
    });

    it("should return false for keep-sorted end line", () => {
      // Arrange
      const document = createMockDocument(["// keep-sorted end"]);
      const position = new vscode.Position(0, 18);

      // Act
      const result = isValidCompletionPosition(document, position);

      // Assert
      expect(result).to.equal(false);
    });

    it("should handle indented keep-sorted line", () => {
      // Arrange
      const document = createMockDocument(["  // keep-sorted start "]);
      const position = new vscode.Position(0, 23);

      // Act
      const result = isValidCompletionPosition(document, position);

      // Assert
      expect(result).to.equal(true);
    });

    it("should return true when cursor is after existing options", () => {
      // Arrange
      const document = createMockDocument(["// keep-sorted start case=yes "]);
      const position = new vscode.Position(0, 30);

      // Act
      const result = isValidCompletionPosition(document, position);

      // Assert
      expect(result).to.equal(true);
    });
  });

  describe("KeepSortedOptionCategory", () => {
    it("should have correct category values", () => {
      expect(KeepSortedOptionCategory.PreSorting).to.equal("Pre-Sorting");
      expect(KeepSortedOptionCategory.Sorting).to.equal("Sorting");
      expect(KeepSortedOptionCategory.PostSorting).to.equal("Post-Sorting");
      expect(KeepSortedOptionCategory.Meta).to.equal("Meta");
    });
  });

  describe("KeepSortedOption constructor", () => {
    it("should create option with all properties", () => {
      // Arrange & Act
      const option = new KeepSortedOption({
        key: "test_option",
        description: "Test description",
        valueType: "bool",
        category: KeepSortedOptionCategory.Sorting,
        defaultValue: "yes",
        examples: ["test_option=yes", "test_option=no"],
      });

      // Assert
      expect(option.key).to.equal("test_option");
      expect(option.description).to.equal("Test description");
      expect(option.valueType).to.equal("bool");
      expect(option.category).to.equal(KeepSortedOptionCategory.Sorting);
      expect(option.defaultValue).to.equal("yes");
      expect(option.examples).to.deep.equal(["test_option=yes", "test_option=no"]);
    });

    it("should create option without optional properties", () => {
      // Arrange & Act
      const option = new KeepSortedOption({
        key: "minimal",
        description: "Minimal option",
        valueType: "list",
        category: KeepSortedOptionCategory.Meta,
      });

      // Assert
      expect(option.key).to.equal("minimal");
      expect(option.defaultValue).to.equal(undefined);
      expect(option.examples).to.equal(undefined);
      expect(option.values).to.equal(undefined);
    });

    it("should suggest yes and no for bool-like options", () => {
      expect(KEEP_SORTED_OPTS.get("case")!.values).to.deep.equal(["yes", "no"]);
      expect(KEEP_SORTED_OPTS.get("newline_separated")!.values).to.deep.equal(["yes", "no"]);
    });

    it("should document values and conflicts", () => {
      const option = KEEP_SORTED_OPTS.get("by_regex")!;
      expect(option.documentation).to.include("conflicts with: `ignore_prefixes`");
      expect(KEEP_SORTED_OPTS.get("order")!.documentation).to.include("values: `asc` | `desc`");
    });

    it("should separate documentation blocks so Markdown renders them separately", () => {
      // Single newlines would merge the description and details into one paragraph
      const blocks = KEEP_SORTED_OPTS.get("order")!.documentation.split("\n\n");
      expect(blocks).to.deep.equal([
        "**order**: Sort in ascending or descending order",
        [
          "- type: `enum`",
          "- category: sorting",
          "- values: `asc` | `desc`",
          "- default: `asc`",
        ].join("\n"),
        "Examples:\n- `order=desc`",
      ]);
    });

    it("should declare conflicts symmetrically", () => {
      for (const option of KEEP_SORTED_OPTS.values()) {
        for (const other of option.conflicts ?? []) {
          expect(KEEP_SORTED_OPTS.get(other)!.conflicts).to.include(option.key);
        }
      }
    });

    it("should generate documentation with key in bold", () => {
      // Arrange & Act
      const option = new KeepSortedOption({
        key: "doc_test",
        description: "Documentation test",
        valueType: "bool",
        category: KeepSortedOptionCategory.Sorting,
      });

      // Assert
      expect(option.documentation).to.include("**doc_test**");
    });

    it("should include type in documentation", () => {
      // Arrange & Act
      const option = new KeepSortedOption({
        key: "type_test",
        description: "Type test",
        valueType: "regexList",
        category: KeepSortedOptionCategory.Sorting,
      });

      // Assert
      expect(option.documentation).to.include("type: `regexList`");
    });

    it("should include default value in documentation when provided", () => {
      // Arrange & Act
      const option = new KeepSortedOption({
        key: "default_test",
        description: "Default test",
        valueType: "bool",
        category: KeepSortedOptionCategory.Sorting,
        defaultValue: "no",
      });

      // Assert
      expect(option.documentation).to.include("default: `no`");
    });

    it("should include examples in documentation when provided", () => {
      // Arrange & Act
      const option = new KeepSortedOption({
        key: "example_test",
        description: "Example test",
        valueType: "intList",
        category: KeepSortedOptionCategory.PreSorting,
        examples: ["example_test=1", "example_test=5"],
      });

      // Assert
      expect(option.documentation).to.include("Examples:");
      expect(option.documentation).to.include("`example_test=1`");
      expect(option.documentation).to.include("`example_test=5`");
    });
  });

  describe("validateOptions", () => {
    it("should accept valid options", () => {
      // Act
      const problems = validateOptions({ numeric: "yes", skip_lines: "1", prefix_order: "[a, b]" });

      // Assert
      expect(problems).to.deep.equal([]);
    });

    const invalid: { name: string; options: Record<string, string>; problem: RegExp }[] = [
      { name: "an unknown key", options: { sort: "yes" }, problem: /Valid options: skip_lines,/ },
      { name: "a bad bool", options: { case: "maybe" }, problem: /Valid values: yes, no/ },
      { name: "a bad enum", options: { order: "up" }, problem: /Valid values: asc, desc/ },
      { name: "a bad integer list", options: { skip_lines: "one" }, problem: /integer list/ },
      {
        name: "whitespace outside a YAML list",
        options: { group_prefixes: "a b" },
        problem: /YAML list/,
      },
      {
        name: "conflicting options",
        options: { group_start_regex: "^a", group_end_regex: "b$" },
        problem: /"group_end_regex" and "group_start_regex" conflict/,
      },
    ];
    invalid.forEach(({ name, options, problem }) => {
      it(`should report ${name}`, () => {
        // Act
        const problems = validateOptions(options);

        // Assert
        expect(problems).to.have.lengthOf(1);
        expect(problems[0]).to.match(problem);
      });
    });
  });

  describe("formatOptions", () => {
    it("should order options like KEEP_SORTED_OPTS", () => {
      // Act
      const text = formatOptions({ remove_duplicates: "no", block: "yes", numeric: "yes" });

      // Assert
      expect(text).to.equal("block=yes numeric=yes remove_duplicates=no");
    });

    it("should return an empty string without options", () => {
      // Act & Assert
      expect(formatOptions({})).to.equal("");
    });
  });
});
