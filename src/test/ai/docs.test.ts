import { expect } from "chai";
import * as fs from "fs";
import { describe, it } from "mocha";
import * as os from "os";
import * as path from "path";
import {
  GUIDE_TOPICS,
  isGuideTopic,
  markdownTable,
  readGuide,
  renderLanguageTable,
  renderOptionReference,
  runAiDocsCli,
  staleGeneratedDocs,
} from "../../ai/docs";
import { bundledBinaryPath, KeepSortedBinary } from "../../keepsortedbin";
import {
  END_DIRECTIVE,
  KEEP_SORTED_OPTS,
  START_DIRECTIVE,
  validateOptions,
} from "../../keepsortedopt";
import { EXT_WORKSPACE_DIR } from "../testing";

const DOCS_DIR = path.join(EXT_WORKSPACE_DIR, "docs", "ai");
const DOC_FILES = Object.values(GUIDE_TOPICS);

function readDoc(file: string): string {
  return fs.readFileSync(path.join(DOCS_DIR, file), "utf8");
}

/** Pairs of fenced code blocks that follow a `<!-- verify -->` comment: before, then after. */
function verifiedExamples(markdown: string): { before: string; after: string }[] {
  return markdown
    .split("<!-- verify -->")
    .slice(1)
    .map((section) => {
      const blocks = [...section.matchAll(/```[\w-]*\n([\s\S]*?)```/g)].map((match) => match[1]);
      return { before: blocks[0], after: blocks[1] };
    });
}

/** `key=value` pairs written in code spans and fenced blocks, tokenized like a start line. */
function optionPairs(markdown: string): { key: string; value: string }[] {
  return (
    [...markdown.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)]
      .flatMap((code) => [...code[0].matchAll(/\b(\w+)=(\[[^\]]*\]|[^\s`]+)/g)])
      .map((match) => ({ key: match[1], value: match[2] }))
      // Underscored keys look like options, so a misspelled or invented one is still checked.
      .filter(
        ({ key, value }) => (KEEP_SORTED_OPTS.has(key) || key.includes("_")) && value !== "..."
      )
  );
}

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");
}

describe("aidocs", () => {
  describe("shipped docs", () => {
    it("should match the code they are generated from", () => {
      // Act
      const stale = staleGeneratedDocs(DOCS_DIR);

      // Assert
      expect(stale, "run npm run gen:ai-docs").to.deep.equal([]);
    });

    it("should have a guide topic for every doc", () => {
      // Arrange
      const files = fs.readdirSync(DOCS_DIR).filter((file) => file.endsWith(".md"));

      // Act & Assert
      expect([...files].sort()).to.deep.equal([...DOC_FILES].sort());
    });

    DOC_FILES.forEach((file) => {
      describe(file, () => {
        const markdown = readDoc(file);

        verifiedExamples(markdown).forEach(({ before, after }, index) => {
          it(`should sort verified example ${index + 1} as shown`, () => {
            // Arrange
            const binary = new KeepSortedBinary(bundledBinaryPath(EXT_WORKSPACE_DIR));

            // Act
            const sorted = binary.fix(before, file);

            // Assert
            expect(before).to.not.equal(after);
            expect(sorted).to.equal(after);
          });
        });

        it("should name only real options with valid values", () => {
          // Arrange
          const pairs = optionPairs(markdown);

          // Act
          const problems = pairs.flatMap(({ key, value }) => validateOptions({ [key]: value }));

          // Assert
          expect(problems).to.deep.equal([]);
        });

        it("should link only to files and headings that exist", () => {
          // Arrange
          const links = [...markdown.matchAll(/\]\(([^)#\s]+\.md)(?:#([\w-]+))?\)/g)];

          // Act
          const broken = links
            .filter(([, target, fragment]) => {
              if (!fs.existsSync(path.join(DOCS_DIR, target))) {
                return true;
              }
              const headings = [...readDoc(target).matchAll(/^#+ (.+)$/gm)].map((m) =>
                anchor(m[1])
              );
              return fragment !== undefined && !headings.includes(fragment);
            })
            .map(([link]) => link);

          // Assert
          expect(broken).to.deep.equal([]);
        });
      });
    });
  });

  describe("install templates", () => {
    ["SKILL.md", "agents-section.md"].forEach((file) => {
      it(`should keep ${file} free of marker text, which would count as a block in a workspace`, () => {
        // Act
        const text = fs.readFileSync(path.join(DOCS_DIR, "install", file), "utf8");

        // Assert
        expect(text).to.not.include(START_DIRECTIVE);
        expect(text).to.not.include(END_DIRECTIVE);
      });
    });
  });

  describe("isGuideTopic", () => {
    [
      { value: "overview", expected: true },
      { value: "when-not-to-wrap", expected: true },
      { value: "README.md", expected: false },
      { value: "toString", expected: false },
      { value: 3, expected: false },
    ].forEach(({ value, expected }) => {
      it(`should return ${expected} for ${String(value)}`, () => {
        // Act & Assert
        expect(isGuideTopic(value)).to.equal(expected);
      });
    });
  });

  describe("readGuide", () => {
    it("should return the topic's file", () => {
      // Act
      const guide = readGuide(DOCS_DIR, "verification");

      // Assert
      expect(guide).to.equal(readDoc("verification.md"));
    });
  });

  describe("markdownTable", () => {
    it("should pad columns like Prettier", () => {
      // Act
      const table = markdownTable(["A", "Long"], [["x", "y"]]);

      // Assert
      expect(table).to.equal("| A   | Long |\n| --- | ---- |\n| x   | y    |");
    });
  });

  describe("renderOptionReference", () => {
    it("should document every option once", () => {
      // Act
      const reference = renderOptionReference();

      // Assert
      const documented = [...reference.matchAll(/^\| `(\w+)` +\|/gm)].map((match) => match[1]);
      expect(documented).to.deep.equal([...KEEP_SORTED_OPTS.keys()]);
    });
  });

  describe("renderLanguageTable", () => {
    it("should mark comment-less formats", () => {
      // Act
      const table = renderLanguageTable();

      // Assert
      expect(table).to.match(/none: cannot hold markers +\| `json`/);
    });
  });

  describe("runAiDocsCli", () => {
    it("should pass the check for current docs", () => {
      // Act & Assert
      expect(runAiDocsCli(["--check"], DOCS_DIR)).to.equal(0);
    });

    it("should fail the check for a stale doc", () => {
      // Arrange
      const copy = fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-docs-"));
      fs.cpSync(DOCS_DIR, copy, { recursive: true });
      fs.writeFileSync(path.join(copy, "options.md"), "stale\n");

      // Act
      const code = runAiDocsCli(["--check"], copy);

      // Assert
      fs.rmSync(copy, { recursive: true, force: true });
      expect(code).to.equal(1);
    });
  });
});
