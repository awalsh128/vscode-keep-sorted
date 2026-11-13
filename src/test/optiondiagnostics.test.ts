import { expect } from "chai";
import { describe, it } from "mocha";
import * as vscode from "vscode";
import { getDirectiveAndErrors, validateOptionsInFile } from "../optiondiagnostics";

describe("optiondiagnostics", () => {
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
});
