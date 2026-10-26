import * as vscode from "vscode";
import { EXT_NAME } from "./instrumentation";

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
 * block start, even in prose.
 *
 * Creates a new regex everytime to avoid issues with global regex state like current index.
 */
const directiveStartRegex = () => /^\s*(?:\/\/|#|\/\*|--|;|<!--)\s*keep-sorted\s+start\b/i;
const directiveOptsRegex = () => /([\w_]+)=((?:\[[^\]]*\])|(?:[^\s]+))/g;

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

const PARSE_ERRORMSG_SUFFIX = "Linting and fixes will still work but option will be ignored.";

function createDiagnostic(range: vscode.Range, message: string): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    range,
    message + "\n" + PARSE_ERRORMSG_SUFFIX,
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = EXT_NAME;
  return diagnostic;
}

/** Parses keep-sorted options from a line and returns parsed options and diagnostics for issues. */
export function getDirectiveAndErrors(
  lineText: string,
  lineNum: number
): { directive: Directive; diagnostics: vscode.Diagnostic[] } | undefined {
  // Fast check for keep-sorted since this call is on the critical path
  if (!lineText.includes("keep-sorted")) {
    return undefined;
  }

  const directive = Directive.create(lineText);
  if (!directive) {
    return undefined;
  }

  const diagnostics: vscode.Diagnostic[] = [];

  for (const token of directive.malformed) {
    // No equals sign - skip empty parts or trailing text
    diagnostics.push(
      createDiagnostic(
        new vscode.Range(lineNum, 0, lineNum, lineText.length),
        `Invalid keep-sorted option format: "${token}". Expected format is key=value.`
      )
    );
  }

  for (const token of directive.wellformed) {
    const option = KEEP_SORTED_OPTS.get(token.key);
    if (!option) {
      diagnostics.push(
        createDiagnostic(
          new vscode.Range(lineNum, token.index, lineNum, token.index + token.text.length),
          `Unrecognized keep-sorted option: "${token.key}"`
        )
      );
      continue;
    }
    if (option.parseValue(token.value) instanceof Error) {
      diagnostics.push(
        createDiagnostic(
          new vscode.Range(lineNum, token.index, lineNum, lineText.length),
          `Invalid value for keep-sorted option "${token.key}": "${token.value}".`
        )
      );
    }
  }

  return { directive, diagnostics };
}

/** Validates keep-sorted options and returns diagnostics for any issues found. */
export function validateOptionsInFile(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const result = getDirectiveAndErrors(document.lineAt(lineNum).text, lineNum);
    if (result) {
      diagnostics.push(...result.diagnostics);
    }
  }
  return diagnostics;
}
