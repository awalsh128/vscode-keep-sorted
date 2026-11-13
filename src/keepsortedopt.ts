// Type-only so this module, which the standalone MCP server bundles, never loads `vscode`.
import type * as vscode from "vscode";

/**
 * Matches a block's start directive after one of these comment markers:
 *
 * - `//` (C-style)
 * - `#` (Python/shell)
 * - `/*` (block comments)
 * - `--` (SQL)
 * - `;` (Assembly/Lisp)
 * - `<!--` (HTML/XML)
 *
 * Avoid writing the directive itself in comments: keep-sorted treats any line containing it as a
 * block start, even in prose. The match is case-sensitive, as in keep-sorted, so
 * `KEEP-SORTED START` is not a directive.
 *
 * Creates a new regex everytime to avoid issues with global regex state like current index.
 */
const directiveStartRegex = () => /^\s*(?:\/\/|#|\/\*|--|;|<!--)\s*keep-sorted\s+start\b/;
const directiveOptsRegex = () => /([\w_]+)=((?:\[[^\]]*\])|(?:[^\s]+))/g;

/** Text that every keep-sorted directive contains. */
const DIRECTIVE_MARKER = "keep-sorted";

/** Keep-sorted recognizes a block's start by this exact text, whatever comment precedes it. */
export const START_DIRECTIVE = `${DIRECTIVE_MARKER} start`;

/** Keep-sorted recognizes a block's end by this exact text, whatever comment precedes it. */
export const END_DIRECTIVE = `${DIRECTIVE_MARKER} end`;

/**
 * Determines whether text could contain keep-sorted directives. Used as a fast check before parsing
 * lines or running the keep-sorted binary.
 *
 * @param text The line or file content to check.
 *
 * @returns True if the text contains the directive marker, otherwise false.
 */
export function hasDirectives(text: string): boolean {
  return text.includes(DIRECTIVE_MARKER);
}

/**
 * Supported option value types in keep-sorted directives, mirroring the field types that
 * google/keep-sorted parses:
 *
 * - Bool: `yes`, `no`, `true`, or `false`
 * - IntOrBool: a non-negative integer or a bool (`yes` is 1, `no` is 0)
 * - IntList: comma-separated integers
 * - List: comma-separated strings, or a YAML list such as `[a, b]`
 * - RegexList: comma-separated regular expressions, or a YAML list
 * - Enum: one of a fixed set of keywords
 */
export type ValueType = "bool" | "intOrBool" | "intList" | "list" | "regexList" | "enum";
export type TsType = boolean | number | number[] | string[] | RegExp[] | string;

const BOOL_VALUES: ReadonlyMap<string, boolean> = new Map([
  ["yes", true],
  ["true", true],
  ["no", false],
  ["false", false],
]);

/** Every spelling keep-sorted accepts for a bool value. */
export const BOOL_SPELLINGS: readonly string[] = [...BOOL_VALUES.keys()];

/** Values suggested for bool-like options; `true`/`false` are accepted but not suggested. */
const BOOL_SUGGESTIONS = ["yes", "no"] as const;

export enum KeepSortedOptionCategory {
  PreSorting = "Pre-Sorting",
  Sorting = "Sorting",
  PostSorting = "Post-Sorting",
  Meta = "Meta",
}

/** Keep-sorted option definition with metadata for autocomplete and validation. */
export class KeepSortedOption {
  /** The option key (e.g., "case", "numeric") */
  readonly key: string;
  /** Human-readable description of the option */
  readonly description: string;
  /** The type of value expected */
  readonly valueType: ValueType;
  /** Category of the option for grouping in completions */
  readonly category: KeepSortedOptionCategory;
  /** Upstream default value if applicable */
  readonly defaultValue?: string;
  /** Values offered by autocomplete; only set for options with a fixed set of keywords */
  readonly values?: readonly string[];
  /** Options that keep-sorted ignores or rejects when combined with this one */
  readonly conflicts?: readonly string[];
  /** Example values for documentation */
  readonly examples?: readonly string[];
  /** Markdown-formatted documentation for the option */
  readonly documentation: string;

  constructor(params: {
    key: string;
    description: string;
    valueType: ValueType;
    category: KeepSortedOptionCategory;
    defaultValue?: string;
    values?: readonly string[];
    conflicts?: readonly string[];
    examples?: readonly string[];
  }) {
    this.key = params.key;
    this.description = params.description;
    this.valueType = params.valueType;
    this.category = params.category;
    this.defaultValue = params.defaultValue;
    this.values =
      params.values ??
      (params.valueType === "bool" || params.valueType === "intOrBool"
        ? BOOL_SUGGESTIONS
        : undefined);
    this.conflicts = params.conflicts;
    this.examples = params.examples;
    // Always keep this as the last step in the constructor
    this.documentation = this.createDocumentation();
  }

  /**
   * Build markdown documentation for an option. Blocks are separated by blank lines because single
   * newlines collapse into one paragraph when rendered.
   */
  private createDocumentation(): string {
    const code = (text: string) => `\`${text}\``;
    const details = [
      `- type: ${code(this.valueType)}`,
      `- category: ${this.category.toLowerCase()}`,
    ];
    if (this.values) {
      details.push(`- values: ${this.values.map(code).join(" | ")}`);
    }
    if (this.defaultValue) {
      details.push(`- default: ${code(this.defaultValue)}`);
    }
    if (this.conflicts) {
      details.push(`- conflicts with: ${this.conflicts.map(code).join(", ")}`);
    }
    const blocks = [`**${this.key}**: ${this.description}`, details.join("\n")];
    if (this.examples && this.examples.length > 0) {
      blocks.push(
        ["Examples:", ...this.examples.map((example) => `- ${code(example)}`)].join("\n")
      );
    }
    return blocks.join("\n\n");
  }

  /**
   * Parses a string value into the appropriate TypeScript type based on ValueType, following the
   * upstream parser: keywords are case-sensitive and list items are not trimmed.
   *
   * @param value The string value to parse
   *
   * @returns The parsed value in the appropriate type, or an Error if parsing fails
   */
  parseValue(value: string): TsType | Error {
    switch (this.valueType) {
      case "bool": {
        const parsed = BOOL_VALUES.get(value);
        if (parsed === undefined) {
          return new Error(
            `Invalid boolean value: "${value}". Expected "yes"/"no" or "true"/"false".`
          );
        }
        return parsed;
      }
      case "intOrBool": {
        const parsed = BOOL_VALUES.get(value);
        if (parsed !== undefined) {
          return parsed ? 1 : 0;
        }
        if (/^\d+$/.test(value)) {
          return Number(value);
        }
        return new Error(
          `Invalid value: "${value}". Expected a non-negative integer or "yes"/"no".`
        );
      }
      case "intList": {
        const items = parseListItems(value);
        if (items.some((item) => !/^-?\d+$/.test(item))) {
          return new Error(`Invalid integer list: "${value}". Expected integers such as 1,-1.`);
        }
        return items.map(Number);
      }
      case "list":
        return parseListItems(value);
      case "regexList": {
        const items = parseListItems(value);
        // YAML items may be pattern-to-template maps, which are left to keep-sorted to validate.
        if (isYamlList(value)) {
          return items;
        }
        const regexs: RegExp[] = [];
        for (const item of items) {
          try {
            // JavaScript lacks Go leading inline flags such as (?s), so drop them before checking.
            regexs.push(new RegExp(item.replace(/^\(\?[a-zA-Z-]+\)/, "")));
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return new Error(`Invalid regex pattern: "${item}". ${message}`);
          }
        }
        return regexs;
      }
      case "enum": {
        // Enums that offer yes/no also accept the true/false spellings, like bools
        const boolAlias = this.values?.includes("yes") && BOOL_VALUES.has(value);
        if (this.values?.includes(value) || boolAlias) {
          return value;
        }
        return new Error(
          `Invalid value: "${value}". Expected one of ${this.values?.join(", ") ?? "(none)"}.`
        );
      }
      default:
        return new Error(`Unsupported value type: "${this.valueType}".`);
    }
  }
}

function isYamlList(value: string): boolean {
  return value.startsWith("[") && value.endsWith("]");
}

/**
 * Splits a list value. Comma-separated items are kept verbatim, including empty items, which
 * `prefix_order` uses to position unmatched lines. YAML list items are trimmed and unquoted.
 */
function parseListItems(value: string): string[] {
  if (value === "") {
    return [];
  }
  if (!isYamlList(value)) {
    return value.split(",");
  }
  const inner = value.slice(1, -1).trim();
  if (inner === "") {
    return [];
  }
  return inner.split(",").map((item) => item.trim().replace(/^(['"])((?:(?!\1).)*)\1$/, "$2"));
}

/**
 * All keep-sorted options supported by the bundled keep-sorted binary (v0.10.0).
 *
 * @see https://github.com/google/keep-sorted/blob/v0.10.0/keepsorted/options.go
 */
export const KEEP_SORTED_OPTS = new Map<string, KeepSortedOption>(
  [
    // Pre-sorting options
    new KeepSortedOption({
      key: "skip_lines",
      description:
        "Lines to ignore before sorting; a negative value skips lines at the end of the block",
      valueType: "intList",
      category: KeepSortedOptionCategory.PreSorting,
      examples: ["skip_lines=1", "skip_lines=1,-1"],
    }),
    new KeepSortedOption({
      key: "group",
      description: "Group lines together based on increasing indentation",
      valueType: "bool",
      category: KeepSortedOptionCategory.PreSorting,
      defaultValue: "yes",
      examples: ["group=yes", "group=no"],
    }),
    new KeepSortedOption({
      key: "group_prefixes",
      description: "Prefixes of lines that should be added to the preceding group",
      valueType: "list",
      category: KeepSortedOptionCategory.PreSorting,
      examples: ["group_prefixes=and,with"],
    }),
    new KeepSortedOption({
      key: "block",
      description: "Enable block mode to understand multi-line code blocks",
      valueType: "bool",
      category: KeepSortedOptionCategory.PreSorting,
      defaultValue: "no",
      examples: ["block=yes", "block=no"],
    }),
    new KeepSortedOption({
      key: "sticky_comments",
      description: "Attach comments to the line immediately below them while sorting",
      valueType: "bool",
      category: KeepSortedOptionCategory.PreSorting,
      defaultValue: "yes",
      examples: ["sticky_comments=yes", "sticky_comments=no"],
    }),
    new KeepSortedOption({
      key: "sticky_prefixes",
      description: "Prefixes of lines that should behave as sticky comments",
      valueType: "list",
      category: KeepSortedOptionCategory.PreSorting,
      examples: ["sticky_prefixes=//,#"],
    }),
    new KeepSortedOption({
      key: "group_start_regex",
      description:
        "Regexes that match the first line of a group; other lines join the previous group",
      valueType: "regexList",
      category: KeepSortedOptionCategory.PreSorting,
      conflicts: ["group_end_regex"],
      examples: ["group_start_regex=^func"],
    }),
    new KeepSortedOption({
      key: "group_end_regex",
      description:
        "Regexes that match the last line of a group; non-comment lines no longer end groups",
      valueType: "regexList",
      category: KeepSortedOptionCategory.PreSorting,
      conflicts: ["group_start_regex"],
      examples: ["group_end_regex=;$"],
    }),
    // Sorting options
    new KeepSortedOption({
      key: "order",
      description: "Sort in ascending or descending order",
      valueType: "enum",
      category: KeepSortedOptionCategory.Sorting,
      defaultValue: "asc",
      values: ["asc", "desc"],
      examples: ["order=desc"],
    }),
    new KeepSortedOption({
      key: "case",
      description: "Case-sensitive sorting (use case=no for case-insensitive)",
      valueType: "bool",
      category: KeepSortedOptionCategory.Sorting,
      defaultValue: "yes",
      examples: ["case=yes", "case=no"],
    }),
    new KeepSortedOption({
      key: "numeric",
      description: "Sort numbers by their numeric value instead of lexically",
      valueType: "bool",
      category: KeepSortedOptionCategory.Sorting,
      defaultValue: "no",
      examples: ["numeric=yes", "numeric=no"],
    }),
    new KeepSortedOption({
      key: "prefix_order",
      description:
        "Explicitly order lines by matching prefix; an empty item positions unmatched lines",
      valueType: "list",
      category: KeepSortedOptionCategory.Sorting,
      examples: ["prefix_order=INIT_,,FINAL_"],
    }),
    new KeepSortedOption({
      key: "ignore_prefixes",
      description: "Prefixes to ignore when sorting lines",
      valueType: "list",
      category: KeepSortedOptionCategory.Sorting,
      conflicts: ["by_regex"],
      examples: ["ignore_prefixes=const,let,var"],
    }),
    new KeepSortedOption({
      key: "by_regex",
      description:
        "Regexes that extract the portion of lines to sort by; YAML items may map a regex to a template",
      valueType: "regexList",
      category: KeepSortedOptionCategory.Sorting,
      conflicts: ["ignore_prefixes"],
      examples: ["by_regex=\\w+;", "by_regex=['(\\d+)-(\\w+)': '${2}${1}']"],
    }),
    // Post-sorting options
    new KeepSortedOption({
      key: "newline_separated",
      description: "Separate sorted groups with newlines (yes/no or number of newlines)",
      valueType: "intOrBool",
      category: KeepSortedOptionCategory.PostSorting,
      defaultValue: "no",
      examples: ["newline_separated=yes", "newline_separated=2"],
    }),
    new KeepSortedOption({
      key: "remove_duplicates",
      description:
        "Remove duplicate lines; keep_first_comment and merge_comments compare code only and keep or merge their comments",
      valueType: "enum",
      category: KeepSortedOptionCategory.PostSorting,
      defaultValue: "yes",
      values: ["yes", "no", "keep_first_comment", "merge_comments"],
      examples: ["remove_duplicates=no", "remove_duplicates=merge_comments"],
    }),
    // Meta option
    new KeepSortedOption({
      key: "allow_yaml_lists",
      description: "Allow list-valued options to be specified using YAML syntax",
      valueType: "bool",
      category: KeepSortedOptionCategory.Meta,
      defaultValue: "yes",
      examples: ["allow_yaml_lists=yes", "allow_yaml_lists=no"],
    }),
  ].map((opt) => [opt.key, opt])
);

export interface OptionToken {
  text: string;
  key: string;
  value: string;
  index: number;
}

/** Represents a keep-sorted directive line with parsed options and text segments. */
export class Directive {
  private constructor(
    readonly lineText: string,
    readonly wellformed: OptionToken[],
    readonly malformed: string[],
    readonly preOptionsText: string,
    readonly optionsText: string
  ) {}

  /** Parses a line of text and returns a Directive if it is a block's start directive. */
  static create(lineText: string): Directive | undefined {
    const startMatch = directiveStartRegex().exec(lineText);
    if (!startMatch) {
      return undefined;
    }
    const optionsIndex = startMatch.index + startMatch[0].length;
    const result = new Directive(
      lineText,
      /*wellformed=*/ [],
      /*malformed=*/ [],
      /*preOptionsText=*/ lineText.slice(0, optionsIndex),
      /*optionsText=*/ lineText.slice(optionsIndex)
    );

    // Reset lastIndex to avoid issues with global regex
    const optsRegex = directiveOptsRegex();
    let match;
    while ((match = optsRegex.exec(result.optionsText.trim())) !== null) {
      if (match[1]) {
        result.wellformed.push({
          text: match[0],
          key: match[1],
          value: match[2],
          index: match.index,
        });
      } else {
        result.malformed.push(match[0]);
      }
    }

    return result;
  }

  /** Returns only the valid options with parsed as either the correct type value or an Error. */
  getValidOptions(): { option: KeepSortedOption; parsed: TsType | Error }[] {
    return this.wellformed
      .filter((token) => KEEP_SORTED_OPTS.has(token.key))
      .map((token) => {
        const opt = KEEP_SORTED_OPTS.get(token.key)!;
        return {
          option: opt,
          parsed: opt.parseValue(token.value),
        };
      });
  }
}

/** Check if the position is on a block's start directive line and cursor is after "start". */
export function isValidCompletionPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  const line = document.lineAt(position.line).text;
  const match = directiveStartRegex().exec(line);
  if (!match) {
    return false;
  }
  // Ensure cursor is after the "start" keyword
  const startEndIndex = match.index + match[0].length;
  return position.character >= startEndIndex;
}

/** Option values keyed by option name, written as they appear on a block's start line. */
export type OptionValues = Readonly<Record<string, string>>;

/**
 * Validates options before they are written to a start line, so callers such as AI tools can report
 * every problem at once with the valid choices.
 *
 * @param options Option values keyed by option name.
 *
 * @returns Problems found, each naming the valid keys or values; empty when all options are valid.
 */
export function validateOptions(options: OptionValues): string[] {
  const problems: string[] = [];
  const keys = Object.keys(options);
  for (const key of keys) {
    const option = KEEP_SORTED_OPTS.get(key);
    if (!option) {
      problems.push(
        `Unknown option "${key}". Valid options: ${[...KEEP_SORTED_OPTS.keys()].join(", ")}.`
      );
      continue;
    }
    const value = options[key];
    if (typeof value !== "string") {
      problems.push(
        `Option "${key}" must be a string such as ${option.examples?.[0] ?? "key=value"}.`
      );
      continue;
    }
    // A start line separates options with whitespace, so only YAML lists may contain spaces.
    if (/\s/.test(value) && !isYamlList(value)) {
      problems.push(
        `Option "${key}" value "${value}" contains whitespace; use a YAML list such as [a, b].`
      );
      continue;
    }
    const parsed = option.parseValue(value);
    if (parsed instanceof Error) {
      const valid = option.values ? ` Valid values: ${option.values.join(", ")}.` : "";
      problems.push(`Option "${key}": ${parsed.message}${valid}`);
    }
  }
  for (const key of keys) {
    for (const conflict of KEEP_SORTED_OPTS.get(key)?.conflicts ?? []) {
      // Report each conflicting pair once, from the key that sorts first.
      if (key < conflict && keys.includes(conflict)) {
        problems.push(`Options "${key}" and "${conflict}" conflict; use only one.`);
      }
    }
  }
  return problems;
}

/**
 * Formats options as they appear after `start` on a block's start line, in the order of
 * `KEEP_SORTED_OPTS` so the same options always produce the same text.
 *
 * @param options Valid option values keyed by option name.
 *
 * @returns Space-separated `key=value` pairs, or an empty string when there are none.
 */
export function formatOptions(options: OptionValues): string {
  return [...KEEP_SORTED_OPTS.keys()]
    .filter((key) => options[key] !== undefined)
    .map((key) => `${key}=${options[key]}`)
    .join(" ");
}
