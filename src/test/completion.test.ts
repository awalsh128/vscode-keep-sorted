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
const KEEP_SORTED_START_WITH_OPTIONS = "// keep-sorted start case=no ";
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
          expect(option.valueType).to.be.oneOf([
            "bool",
            "intOrBool",
            "intList",
            "list",
            "regexList",
            "enum",
          ]);
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

      [
        { name: "inside a list value", line: "// keep-sorted start ignore_prefixes=[a, " },
        { name: "for a free-form option", line: "// keep-sorted start ignore_prefixes=co" },
        { name: "for an unknown option", line: "// keep-sorted start bogus=" },
      ].forEach(({ name, line }) => {
        it(`should return undefined when typing an option value ${name}`, () => {
          // Act
          const result = getCompletionsAtEndOfLine(line);

          // Assert
          expect(result).to.equal(undefined);
        });
      });

      describe("value suggestions", () => {
        [
          { line: "// keep-sorted start numeric=", expected: ["yes", "no"] },
          { line: "// keep-sorted start newline_separated=", expected: ["yes", "no"] },
          { line: "// keep-sorted start order=", expected: ["asc", "desc"] },
          {
            line: "// keep-sorted start remove_duplicates=",
            expected: ["yes", "no", "keep_first_comment", "merge_comments"],
          },
        ].forEach(({ line, expected }) => {
          it(`should suggest ${expected.join(", ")} after '${line.split(" ").pop()}'`, () => {
            // Act
            const items = getCompletionsAtEndOfLine(line);

            // Assert
            expect(items!.map((item) => item.label)).to.deep.equal(expected);
            items!.forEach((item) => {
              expect(item.kind).to.equal(vscode.CompletionItemKind.EnumMember);
            });
          });
        });

        it("should mark the default value", () => {
          // Act
          const items = getCompletionsAtEndOfLine("// keep-sorted start order=");

          // Assert
          expect(items!.find((item) => item.label === "asc")!.detail).to.include("(default)");
          expect(items!.find((item) => item.label === "desc")!.detail).not.to.include("default");
        });

        it("should replace the whole value, including text after the cursor", () => {
          // Arrange - cursor between "y" and "es" in "numeric=yes"
          const line = "// keep-sorted start numeric=yes case=no";
          const column = line.indexOf("=yes") + 2;

          // Act
          const items = getCompletionsAt(line, column);

          // Assert
          const range = items![0].range as vscode.Range;
          expect(range.start.character).to.equal(line.indexOf("=yes") + 1);
          expect(range.end.character).to.equal(line.indexOf(" case"));
        });
      });

      describe("conflicting options", () => {
        [
          { existing: "by_regex=\\w+", hidden: "ignore_prefixes" },
          { existing: "ignore_prefixes=a", hidden: "by_regex" },
          { existing: "group_start_regex=^x", hidden: "group_end_regex" },
          { existing: "group_end_regex=^x", hidden: "group_start_regex" },
        ].forEach(({ existing, hidden }) => {
          it(`should not suggest ${hidden} alongside ${existing}`, () => {
            // Act
            const items = getCompletionsAtEndOfLine(`// keep-sorted start ${existing} `);

            // Assert
            expect(items!.map((item) => item.label)).not.to.include(hidden);
          });
        });
      });

      it("should suggest options after a closed list value", () => {
        // Act
        const items = getCompletionsAtEndOfLine("// keep-sorted start ignore_prefixes=[a, b] gr");

        // Assert
        expect(items!.map((item) => item.label)).to.deep.equal([
          "group",
          "group_prefixes",
          "group_start_regex",
          "group_end_regex",
        ]);
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

        [
          // Non-default values come first because writing the default has no effect
          { key: "numeric", snippet: "numeric=${1|yes,no|}" },
          { key: "case", snippet: "case=${1|no,yes|}" },
          { key: "order", snippet: "order=${1|desc,asc|}" },
          {
            key: "remove_duplicates",
            snippet: "remove_duplicates=${1|no,keep_first_comment,merge_comments,yes|}",
          },
          { key: "skip_lines", snippet: "skip_lines=$1" },
          { key: "group_prefixes", snippet: "group_prefixes=$1" },
        ].forEach(({ key, snippet }) => {
          it(`should insert '${snippet}' for ${key}`, () => {
            // Act
            const item = items.find((item) => item.label === key);

            // Assert
            expect((item!.insertText as vscode.SnippetString).value).to.equal(snippet);
          });
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

          try {
            // Act
            await provider.register();

            // Assert - Verify registration with proper selector
            sinon.assert.called(registerStub);
            const [selector, providerInstance] = registerStub.firstCall.args;
            expect(selector).to.be.an("array").that.has.length.greaterThan(0); // Selector targets specific document schemes
            expect(providerInstance).to.equal(provider);
          } finally {
            // Cleanup
            registerStub.restore();
          }
        });

        it("should trigger on option name characters because comments disable quick suggestions", async () => {
          // Arrange
          const registerStub = sinon.stub(vscode.languages, "registerCompletionItemProvider");
          registerStub.returns({ dispose: sinon.stub() } as unknown as vscode.Disposable);

          try {
            // Act
            await provider.register();

            // Assert
            const triggerCharacters = registerStub.firstCall.args.slice(2);
            expect(triggerCharacters).to.include.members([" ", "=", "_", "a", "z", "A", "Z"]);
          } finally {
            // Cleanup
            registerStub.restore();
          }
        });

        it("should be disposable when returned from register", async () => {
          // Arrange
          const fakeDisposable = { dispose: sinon.stub() };
          const registerStub = sinon.stub(vscode.languages, "registerCompletionItemProvider");
          registerStub.returns(fakeDisposable as unknown as vscode.Disposable);

          try {
            // Act
            const disposable = await provider.register();
            disposable.dispose();

            // Assert
            sinon.assert.called(fakeDisposable.dispose);
          } finally {
            // Cleanup
            registerStub.restore();
          }
        });
      });
    });
  });
});
