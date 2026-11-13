import * as fs from "fs";
import * as path from "path";
import { dedent } from "../common";
import { KEEP_SORTED_OPTS, KeepSortedOptionCategory } from "../keepsortedopt";
import { LANGUAGES } from "./wrap";

/*
 * The agent docs shipped in docs/ai/: topic lookup for the guide tools, and the sections generated
 * from code so they cannot drift. gencli.ts runs the generator. Free of `vscode` imports for the
 * MCP server.
 */

/** Guide topics and the docs/ai file each one returns. */
export const GUIDE_TOPICS = {
  overview: "README.md",
  "when-not-to-wrap": "when-not-to-wrap.md",
  "choosing-options": "choosing-options.md",
  "markers-and-languages": "markers-and-languages.md",
  preferences: "preferences.md",
  verification: "verification.md",
  options: "options.md",
} as const;

/** A guide topic name. */
export type GuideTopic = keyof typeof GUIDE_TOPICS;

/**
 * Checks whether a value names a guide topic.
 *
 * @param value The value to check.
 *
 * @returns True when the value is a topic.
 */
export function isGuideTopic(value: unknown): value is GuideTopic {
  return typeof value === "string" && Object.hasOwn(GUIDE_TOPICS, value);
}

/**
 * Reads one guide.
 *
 * @param docsDir The docs/ai directory.
 * @param topic The topic to read.
 *
 * @returns The guide's Markdown.
 */
export function readGuide(docsDir: string, topic: GuideTopic): string {
  return fs.readFileSync(path.join(docsDir, GUIDE_TOPICS[topic]), "utf8");
}

/**
 * Renders a Markdown table padded the way Prettier formats it, so formatting the generated file
 * leaves it unchanged.
 *
 * @param header The column headings.
 * @param rows The cells of each row, already escaped.
 *
 * @returns The table's lines joined with newlines.
 */
export function markdownTable(
  header: readonly string[],
  rows: readonly (readonly string[])[]
): string {
  const widths = header.map((heading, column) =>
    Math.max(3, heading.length, ...rows.map((row) => row[column].length))
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`;
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join(
    "\n"
  );
}

/**
 * Renders every option as a Markdown reference, the content of docs/ai/options.md.
 *
 * @returns The Markdown document.
 */
export function renderOptionReference(): string {
  const code = (text: string): string => `\`${text.replace(/\|/g, "\\|")}\``;
  const sections = Object.values(KeepSortedOptionCategory).map((category) => {
    const rows = [...KEEP_SORTED_OPTS.values()]
      .filter((option) => option.category === category)
      .map((option) => [
        code(option.key),
        option.description.replace(/\|/g, "\\|"),
        code(option.valueType),
        option.defaultValue ? code(option.defaultValue) : "",
        (option.values ?? []).map(code).join(", "),
        (option.conflicts ?? []).map(code).join(", "),
        (option.examples ?? []).map(code).join(", "),
      ]);
    const header = ["Option", "Meaning", "Type", "Default", "Values", "Conflicts with", "Examples"];
    return `## ${category}\n\n${markdownTable(header, rows)}\n`;
  });
  const intro = dedent`
    # keep-sorted option reference

    <!-- Generated from KEEP_SORTED_OPTS in src/keepsortedopt.ts by npm run gen:ai. -->

    This lists every option the bundled keep-sorted accepts.

    - Options follow \`start\` on the start line, separated by spaces.
    - \`bool\` options take \`yes\` or \`no\`; \`true\` and \`false\` also work.
    - \`list\` and \`regexList\` options take comma-separated items, or a YAML list such as \`[a, b]\`.
    - \`intList\` takes comma-separated integers; \`intOrBool\` takes an integer or \`yes\`/\`no\`.`;
  return `${intro}\n\n${sections.join("\n")}`;
}

/**
 * Renders the comment syntax table from `LANGUAGES`, grouped by comment style.
 *
 * @returns The Markdown table.
 */
export function renderLanguageTable(): string {
  const byComment = new Map<string, string[]>();
  for (const language of LANGUAGES) {
    const comment = language.comment;
    const key = !comment
      ? "none: cannot hold markers"
      : comment.line
        ? `\`${comment.line}\``
        : `\`${comment.block![0]}\` ... \`${comment.block![1]}\``;
    byComment.set(key, [...(byComment.get(key) ?? []), ...language.ids]);
  }
  const rows = [...byComment.entries()].map(([comment, ids]) => [
    comment,
    ids.map((id) => `\`${id}\``).join(", "),
  ]);
  return markdownTable(["Comment", "VS Code language IDs"], rows);
}

/** A docs section generated between two HTML comments. */
interface GeneratedSection {
  /** The docs/ai file. */
  readonly file: string;
  /** The comment line that opens the section. */
  readonly begin: string;
  /** The comment line that closes the section. */
  readonly finish: string;
  /** Renders the section's content. */
  readonly render: () => string;
}

const SECTIONS: readonly GeneratedSection[] = [
  {
    file: "markers-and-languages.md",
    begin: "<!-- generated:languages begin -->",
    finish: "<!-- generated:languages finish -->",
    render: renderLanguageTable,
  },
];

/** Files rendered whole from code. */
const WHOLE_FILES: Readonly<Record<string, () => string>> = {
  "options.md": renderOptionReference,
};

/**
 * Renders every generated file and section.
 *
 * @param docsDir The docs/ai directory.
 *
 * @returns The expected content of each generated file, keyed by file name.
 */
export function renderGeneratedDocs(docsDir: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [file, render] of Object.entries(WHOLE_FILES)) {
    result.set(file, render());
  }
  for (const section of SECTIONS) {
    const current =
      result.get(section.file) ?? fs.readFileSync(path.join(docsDir, section.file), "utf8");
    const begin = current.indexOf(section.begin);
    const finish = current.indexOf(section.finish);
    if (begin < 0 || finish < begin) {
      throw new Error(`${section.file} is missing "${section.begin}" or "${section.finish}".`);
    }
    result.set(
      section.file,
      `${current.slice(0, begin + section.begin.length)}\n\n${section.render()}\n\n${current.slice(finish)}`
    );
  }
  return result;
}

/**
 * Lists generated docs whose content differs from what the code renders.
 *
 * @param docsDir The docs/ai directory.
 *
 * @returns The stale file names.
 */
export function staleGeneratedDocs(docsDir: string): string[] {
  return [...renderGeneratedDocs(docsDir).entries()]
    .filter(([file, expected]) => {
      const target = path.join(docsDir, file);
      return !fs.existsSync(target) || fs.readFileSync(target, "utf8") !== expected;
    })
    .map(([file]) => file);
}

/**
 * Writes every generated doc.
 *
 * @param docsDir The docs/ai directory.
 */
export function writeGeneratedDocs(docsDir: string): void {
  for (const [file, content] of renderGeneratedDocs(docsDir)) {
    fs.writeFileSync(path.join(docsDir, file), content, "utf8");
  }
}
