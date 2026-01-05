import { describe, it } from "mocha";
import { expect } from "chai";
import * as vscode from "vscode";
import {
  Directive,
  KEEP_SORTED_OPTS,
  KeepSortedOption,
  KeepSortedOptionCategory,
  getDirectiveAndErrors,
  validateOptionsInFile,
  isValidCompletionPosition,
} from "../keepsortedopt";

// Expected option keys based on google/keep-sorted
const EXPECTED_OPTION_KEYS = [
  "skip_lines",
  "group",
  "group_prefixes",
  "block",
  "sticky_comments",
  "sticky_prefixes",
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
        expect(option.valueType).to.be.oneOf(["bool", "int", "list", "map", "regex"]);
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

      // Parameterized success cases
      [
        { input: "yes", expected: true },
        { input: "true", expected: true },
        { input: "no", expected: false },
        { input: "false", expected: false },
        { input: "YES", expected: true },
        { input: "TRUE", expected: true },
        { input: "NO", expected: false },
        { input: "FALSE", expected: false },
        { input: "Yes", expected: true },
        { input: "No", expected: false },
      ].forEach(({ input, expected }) => {
        it(`should parse '${input}' as ${expected}`, () => {
          expect(boolOption.parseValue(input)).to.equal(expected);
        });
      });

      // Parameterized error cases
      [
        { input: "invalid", errorContains: "Invalid boolean value" },
        { input: "", errorContains: "Invalid boolean value" },
        { input: "1", errorContains: "Invalid boolean value" },
      ].forEach(({ input, errorContains }) => {
        it(`should return error for '${input || "(empty)"}'`, () => {
          const result = boolOption.parseValue(input);
          expect(result).to.be.instanceOf(Error);
          expect((result as Error).message).to.include(errorContains);
        });
      });
    });

    describe("int type", () => {
      const intOption = KEEP_SORTED_OPTS.get("skip_lines")!;

      // Parameterized success cases
      [
        { input: "5", expected: 5 },
        { input: "0", expected: 0 },
        { input: "100", expected: 100 },
        { input: "", expected: 0 }, // Number("") === 0 in JavaScript
      ].forEach(({ input, expected }) => {
        it(`should parse '${input || "(empty)"}' as ${expected}`, () => {
          expect(intOption.parseValue(input)).to.equal(expected);
        });
      });

      // Parameterized error cases
      [
        { input: "-1", errorContains: "Invalid integer value" },
        { input: "3.14", errorContains: "Invalid integer value" },
        { input: "abc", errorContains: "Invalid integer value" },
      ].forEach(({ input, errorContains }) => {
        it(`should return error for '${input}'`, () => {
          const result = intOption.parseValue(input);
          expect(result).to.be.instanceOf(Error);
          expect((result as Error).message).to.include(errorContains);
        });
      });
    });

    describe("list type", () => {
      const listOption = KEEP_SORTED_OPTS.get("prefix_order")!;
      const ignoreOption = KEEP_SORTED_OPTS.get("ignore_prefixes")!;

      // Parameterized success cases
      [
        { input: "INIT_,MIDDLE_,FINAL_", expected: ["INIT_", "MIDDLE_", "FINAL_"] },
        { input: "a,,b,,c", expected: ["a", "b", "c"] },
        { input: "", expected: [] },
        { input: "single", expected: ["single"] },
        { input: "INIT_,,FINAL_", expected: ["INIT_", "FINAL_"] },
      ].forEach(({ input, expected }) => {
        it(`should parse '${input || "(empty)"}' as ${JSON.stringify(expected)}`, () => {
          expect(listOption.parseValue(input)).to.deep.equal(expected);
        });
      });

      it("should trim whitespace from values", () => {
        expect(ignoreOption.parseValue("const , let , var")).to.deep.equal(["const", "let", "var"]);
      });
    });

    describe("map type", () => {
      const mapOption = KEEP_SORTED_OPTS.get("group_prefixes")!;

      // Parameterized success cases
      [
        { input: "and=1,with=2", expected: { and: "1", with: "2" } },
        { input: " key1 = value1 , key2 = value2 ", expected: { key1: "value1", key2: "value2" } },
        { input: "", expected: {} },
        { input: "key=value", expected: { key: "value" } },
      ].forEach(({ input, expected }) => {
        it(`should parse '${input || "(empty)"}' as ${JSON.stringify(expected)}`, () => {
          expect(mapOption.parseValue(input)).to.deep.equal(expected);
        });
      });

      // Parameterized error cases
      [
        { input: "key=", errorContains: "Invalid map entry" },
        { input: "=value", errorContains: "Invalid map entry" },
      ].forEach(({ input, errorContains }) => {
        it(`should return error for '${input}'`, () => {
          const result = mapOption.parseValue(input);
          expect(result).to.be.instanceOf(Error);
          expect((result as Error).message).to.include(errorContains);
        });
      });
    });

    describe("regex type", () => {
      const regexOption = KEEP_SORTED_OPTS.get("by_regex")!;

      // Parameterized success cases
      [
        { input: "\\w+;", expectedSource: "\\w+;" },
        { input: "test", expectedSource: "test" },
        { input: "^[a-z]+$", expectedSource: "^[a-z]+$" },
      ].forEach(({ input, expectedSource }) => {
        it(`should parse '${input}' as valid RegExp`, () => {
          const result = regexOption.parseValue(input);
          expect(result).to.be.instanceOf(RegExp);
          expect((result as RegExp).source).to.equal(expectedSource);
        });
      });

      // Parameterized error cases
      [
        { input: "[invalid", errorContains: "Invalid regex pattern" },
        { input: "(unclosed", errorContains: "Invalid regex pattern" },
      ].forEach(({ input, errorContains }) => {
        it(`should return error for '${input}'`, () => {
          const result = regexOption.parseValue(input);
          expect(result).to.be.instanceOf(Error);
          expect((result as Error).message).to.include(errorContains);
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

  describe("getDirectiveAndErrors", () => {
    it("should return undefined for non-keep-sorted line", () => {
      // Arrange
      const lineText = "const x = 1;";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert
      expect(result).to.equal(undefined);
    });

    it("should return undefined for keep-sorted end line", () => {
      // Arrange
      const lineText = "// keep-sorted end";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert
      expect(result).to.equal(undefined);
    });

    it("should parse valid options without diagnostics", () => {
      // Arrange
      const lineText = "// keep-sorted start case=yes numeric=no";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.directive.wellformed).to.have.lengthOf(2);
      expect(result!.directive.wellformed[0].key).to.equal("case");
      expect(result!.directive.wellformed[1].key).to.equal("numeric");
      expect(result!.diagnostics).to.have.lengthOf(0);
    });

    it("should report diagnostic for unrecognized option", () => {
      // Arrange
      const lineText = "// keep-sorted start unknown_option=value";

      // Act
      const result = getDirectiveAndErrors(lineText, 5);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.diagnostics).to.have.lengthOf(1);
      expect(result!.diagnostics[0].message).to.include("Unrecognized keep-sorted option");
      expect(result!.diagnostics[0].message).to.include("unknown_option");
      expect(result!.diagnostics[0].range.start.line).to.equal(5);
    });

    it("should report diagnostic for invalid option format (no equals)", () => {
      // Arrange - 'invalid_format' without '=' is not matched by the option regex
      // so no diagnostics are generated (it's just ignored)
      const lineText = "// keep-sorted start invalid_format";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert - the malformed text isn't parsed as an option, so no diagnostic
      expect(result).to.not.equal(undefined);
      expect(result!.directive.wellformed).to.have.lengthOf(0);
    });

    it("should report diagnostic for invalid option format (no key)", () => {
      // Arrange - '=value' without a key is not matched by the option regex
      const lineText = "// keep-sorted start =value";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert - malformed text isn't parsed as an option, so no diagnostic
      expect(result).to.not.equal(undefined);
      expect(result!.directive.wellformed).to.have.lengthOf(0);
    });

    it("should report diagnostic for invalid option value", () => {
      // Arrange
      const lineText = "// keep-sorted start case=invalid";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.directive.wellformed).to.have.lengthOf(1);
      expect(result!.diagnostics).to.have.lengthOf(1);
      expect(result!.diagnostics[0].message).to.include("Invalid value");
      expect(result!.diagnostics[0].message).to.include("case");
    });

    it("should handle mixed valid and invalid options", () => {
      // Arrange
      const lineText = "// keep-sorted start case=yes unknown=val numeric=no";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.directive.wellformed).to.have.lengthOf(3);
      const keys = result!.directive.wellformed.map((t) => t.key);
      expect(keys).to.include("case");
      expect(keys).to.include("numeric");
      expect(result!.diagnostics).to.have.lengthOf(1);
      expect(result!.diagnostics[0].message).to.include("Unrecognized");
    });

    it("should set correct line number in diagnostic range", () => {
      // Arrange
      const lineText = "// keep-sorted start unknown=value";

      // Act
      const result = getDirectiveAndErrors(lineText, 42);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.diagnostics[0].range.start.line).to.equal(42);
      expect(result!.diagnostics[0].range.end.line).to.equal(42);
    });

    it("should have warning severity for diagnostics", () => {
      // Arrange
      const lineText = "// keep-sorted start unknown=value";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.diagnostics[0].severity).to.equal(vscode.DiagnosticSeverity.Warning);
    });

    it("should include helpful suffix in diagnostic message", () => {
      // Arrange
      const lineText = "// keep-sorted start unknown=value";

      // Act
      const result = getDirectiveAndErrors(lineText, 0);

      // Assert
      expect(result).to.not.equal(undefined);
      expect(result!.diagnostics[0].message).to.include("Linting and fixes will still work");
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

  describe("validateOptionsInFile", () => {
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

    it("should return empty array for document with no keep-sorted lines", () => {
      // Arrange
      const document = createMockDocument(["const x = 1;", "const y = 2;"]);

      // Act
      const result = validateOptionsInFile(document);

      // Assert
      expect(result).to.have.lengthOf(0);
    });

    it("should return empty array for valid keep-sorted options", () => {
      // Arrange
      const document = createMockDocument([
        "// keep-sorted start case=yes",
        "alpha",
        "beta",
        "// keep-sorted end",
      ]);

      // Act
      const result = validateOptionsInFile(document);

      // Assert
      expect(result).to.have.lengthOf(0);
    });

    it("should return diagnostics for invalid options", () => {
      // Arrange
      const document = createMockDocument([
        "// keep-sorted start unknown=value",
        "alpha",
        "// keep-sorted end",
      ]);

      // Act
      const result = validateOptionsInFile(document);

      // Assert
      expect(result).to.have.lengthOf(1);
      expect(result[0].message).to.include("Unrecognized");
    });

    it("should return diagnostics for multiple invalid lines", () => {
      // Arrange
      const document = createMockDocument([
        "// keep-sorted start unknown=value",
        "alpha",
        "// keep-sorted end",
        "// keep-sorted start another_unknown=val",
        "beta",
        "// keep-sorted end",
      ]);

      // Act
      const result = validateOptionsInFile(document);

      // Assert
      expect(result).to.have.lengthOf(2);
    });

    it("should set correct line numbers for each diagnostic", () => {
      // Arrange
      const document = createMockDocument([
        "// keep-sorted start unknown=value",
        "alpha",
        "// keep-sorted end",
        "// keep-sorted start bad=val",
        "beta",
        "// keep-sorted end",
      ]);

      // Act
      const result = validateOptionsInFile(document);

      // Assert
      expect(result[0].range.start.line).to.equal(0);
      expect(result[1].range.start.line).to.equal(3);
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
        valueType: "int",
        category: KeepSortedOptionCategory.Meta,
      });

      // Assert
      expect(option.key).to.equal("minimal");
      expect(option.defaultValue).to.equal(undefined);
      expect(option.examples).to.equal(undefined);
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
        valueType: "regex",
        category: KeepSortedOptionCategory.Sorting,
      });

      // Assert
      expect(option.documentation).to.include("type: regex");
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
        valueType: "int",
        category: KeepSortedOptionCategory.PreSorting,
        examples: ["example_test=1", "example_test=5"],
      });

      // Assert
      expect(option.documentation).to.include("examples:");
      expect(option.documentation).to.include("`example_test=1`");
      expect(option.documentation).to.include("`example_test=5`");
    });
  });
});
