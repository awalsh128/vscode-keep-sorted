import { describe, it, beforeEach } from "mocha";
import { expect, use } from "chai";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { KeepSortedCompletionProvider } from "../completion";
import { KEEP_SORTED_OPTS } from "../keepsortedopt";

use(sinonChai);

// Test constants
const KEEP_SORTED_START_LINE = "// keep-sorted start";
const KEEP_SORTED_START_WITH_OPTIONS = "// keep-sorted start case=no";
const REGULAR_CODE_LINE = "const foo = 'bar';";
const KEEP_SORTED_END_LINE = "// keep-sorted end";

describe("completion", () => {
  describe("KEEP_SORTED_OPTIONS", () => {
    it("should contain all expected options from options.go", () => {
      // Arrange - Known options from google/keep-sorted
      const expectedKeys = [
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

      // Act
      const actualKeys = Array.from(KEEP_SORTED_OPTS.keys());

      // Assert
      expect(actualKeys).to.include.members(expectedKeys);
    });

    describe("should have valid structure for option", () => {
      for (const [, option] of KEEP_SORTED_OPTS) {
        it(`'${option.key}'`, () => {
          expect(option.key).to.be.a("string");
          expect(option.key.length).to.be.greaterThan(0);
          expect(option.description).to.be.a("string");
          expect(option.description.length).to.be.greaterThan(0);
          expect(option.valueType).to.be.oneOf(["bool", "int", "list", "map", "regex"]);
          if (option.examples) {
            expect(option.examples).to.be.an("array");
            expect(option.examples.length).to.be.greaterThan(0);
          }
        });
      }
    });

    describe("should have examples containing the option key", () => {
      for (const [, option] of KEEP_SORTED_OPTS) {
        if (option.examples) {
          option.examples.forEach((example: string, index: number) => {
            it(`'${option.key}' example ${index + 1}`, () => {
              expect(example).to.include(option.key);
            });
          });
        }
      }
    });

    it("should return correct option for known key", () => {
      // Arrange
      const key = "case";

      // Act
      const option = KEEP_SORTED_OPTS.get(key);

      // Assert
      expect(option).to.not.equal(undefined);
      expect(option!.key).to.equal(key);
      expect(option!.valueType).to.equal("bool");
    });
  });

  describe("KeepSortedCompletionProvider", () => {
    let provider: KeepSortedCompletionProvider;
    let sandbox: sinon.SinonSandbox;
    let mockToken: vscode.CancellationToken;
    let mockContext: vscode.CompletionContext;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      provider = new KeepSortedCompletionProvider();

      // Create mock cancellation token
      mockToken = {
        isCancellationRequested: false,
        onCancellationRequested: sandbox.stub(),
      } as unknown as vscode.CancellationToken;

      // Create mock completion context
      mockContext = {
        triggerKind: vscode.CompletionTriggerKind.Invoke,
        triggerCharacter: undefined,
      };
    });

    afterEach(() => {
      sandbox.restore();
    });

    /** Creates a mock document from an array of lines. */
    function createMockDocument(lines: string[]): vscode.TextDocument {
      return {
        lineAt: (line: number) => ({
          text: lines[line] || "",
          range: new vscode.Range(line, 0, line, (lines[line] || "").length),
        }),
        getWordRangeAtPosition: (_position: vscode.Position, _regex?: RegExp) => undefined,
        getText: (_range?: vscode.Range) => lines.join("\n"),
        uri: vscode.Uri.file("/test/file.ts"),
      } as unknown as vscode.TextDocument;
    }

    /** Gets completion items for a line at the end position. */
    function getCompletionsAtEndOfLine(line: string): vscode.CompletionItem[] | undefined {
      const mockDocument = createMockDocument([line]);
      const position = new vscode.Position(0, line.length);
      const result = provider.provideCompletionItems(
        mockDocument,
        position,
        mockToken,
        mockContext
      );
      return result as vscode.CompletionItem[] | undefined;
    }

    /** Gets completion items for a line at a specific column. */
    function getCompletionsAt(line: string, column: number): vscode.CompletionItem[] | undefined {
      const mockDocument = createMockDocument([line]);
      const position = new vscode.Position(0, column);
      const result = provider.provideCompletionItems(
        mockDocument,
        position,
        mockToken,
        mockContext
      );
      return result as vscode.CompletionItem[] | undefined;
    }

    describe("provideCompletionItems", () => {
      it("should return completions on keep-sorted start line", () => {
        // Act
        const items = getCompletionsAtEndOfLine(KEEP_SORTED_START_LINE);

        // Assert
        expect(items).to.be.an("array");
        expect(items!.length).to.be.greaterThan(0);
      });

      it("should return undefined on regular code line", () => {
        // Act
        const result = getCompletionsAt(REGULAR_CODE_LINE, 10);

        // Assert
        expect(result).to.equal(undefined);
      });

      it("should return undefined on keep-sorted end line", () => {
        // Act
        const result = getCompletionsAt(KEEP_SORTED_END_LINE, 10);

        // Assert
        expect(result).to.equal(undefined);
      });

      it("should exclude options already on the line", () => {
        // Act
        const items = getCompletionsAtEndOfLine(KEEP_SORTED_START_WITH_OPTIONS);

        // Assert
        expect(items).to.be.an("array");
        const caseItem = items!.find((item) => item.label === "case");
        expect(caseItem).to.equal(undefined);
      });

      it("should return all options minus existing ones", () => {
        // Act
        const items = getCompletionsAtEndOfLine(KEEP_SORTED_START_WITH_OPTIONS);

        // Assert
        expect(items).to.be.an("array");
        expect(items!.length).to.equal(KEEP_SORTED_OPTS.size - 1);
      });

      describe("completion item properties", () => {
        let items: vscode.CompletionItem[];

        beforeEach(() => {
          // Arrange
          items = getCompletionsAtEndOfLine(KEEP_SORTED_START_LINE)!;
        });

        it("should have Property kind for all items", () => {
          // Assert
          items.forEach((item) => {
            expect(item.kind).to.equal(vscode.CompletionItemKind.Property);
          });
        });

        it("should have snippet insert text for all items", () => {
          // Assert
          items.forEach((item) => {
            expect(item.insertText).to.be.instanceOf(vscode.SnippetString);
          });
        });

        it("should have documentation for all items", () => {
          // Assert
          items.forEach((item) => {
            expect(item.documentation).to.be.instanceOf(vscode.MarkdownString);
          });
        });
      });

      describe("insert text format", () => {
        let items: vscode.CompletionItem[];

        beforeEach(() => {
          // Arrange
          items = getCompletionsAtEndOfLine(KEEP_SORTED_START_LINE)!;
        });

        it("should provide correct insert text for bool options", () => {
          // Act
          const numericItem = items.find((item) => item.label === "numeric");

          // Assert
          expect(numericItem).to.not.equal(undefined);
          const snippet = numericItem!.insertText as vscode.SnippetString;
          expect(snippet.value).to.include("numeric=");
        });

        it("should provide correct insert text for int options", () => {
          // Act
          const skipLinesItem = items.find((item) => item.label === "skip_lines");

          // Assert
          expect(skipLinesItem).to.not.equal(undefined);
          const snippet = skipLinesItem!.insertText as vscode.SnippetString;
          expect(snippet.value).to.include("skip_lines=");
        });
      });

      describe("comment style compatibility", () => {
        [
          { name: "C-style", line: "// keep-sorted start" },
          { name: "uppercase", line: "// KEEP-SORTED START" },
          { name: "Python-style", line: "# keep-sorted start" },
          { name: "HTML-style", line: "<!-- keep-sorted start -->" },
        ].forEach(({ name, line }) => {
          it(`should work with ${name} comments`, () => {
            // Act
            const items = getCompletionsAtEndOfLine(line);

            // Assert
            expect(items).to.be.an("array");
            expect(items!.length).to.be.greaterThan(0);
          });
        });
      });

      describe("register method", () => {
        it("should return a Disposable on successful registration", async () => {
          // Arrange
          const registerStub = sinon.stub(vscode.languages, "registerCompletionItemProvider");
          const fakeDisposable = { dispose: sinon.stub() };
          registerStub.returns(fakeDisposable as unknown as vscode.Disposable);

          // Act
          const result = await provider.register();

          // Assert
          expect(result).to.equal(fakeDisposable);
          sinon.assert.called(registerStub);

          // Cleanup
          registerStub.restore();
        });

        it("should register completion provider for all document types", async () => {
          // Arrange
          const registerStub = sinon.stub(vscode.languages, "registerCompletionItemProvider");
          registerStub.returns({ dispose: sinon.stub() } as unknown as vscode.Disposable);

          // Act
          await provider.register();

          // Assert - Verify registration with proper selector
          sinon.assert.called(registerStub);
          const [selector, providerInstance] = registerStub.firstCall.args;
          expect(selector).to.equal(null); // Null selector means all document types
          expect(providerInstance).to.equal(provider);

          // Cleanup
          registerStub.restore();
        });

        it("should be disposable when returned from register", async () => {
          // Arrange
          const fakeDisposable = { dispose: sinon.stub() };
          const registerStub = sinon.stub(vscode.languages, "registerCompletionItemProvider");
          registerStub.returns(fakeDisposable as unknown as vscode.Disposable);

          // Act
          const disposable = await provider.register();
          disposable.dispose();

          // Assert
          sinon.assert.called(fakeDisposable.dispose);

          // Cleanup
          registerStub.restore();
        });
      });
    });
  });
});
