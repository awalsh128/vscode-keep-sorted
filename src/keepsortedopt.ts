import * as vscode from "vscode";
import { EXT_NAME } from "./instrumentation";

/**
 * Matches keep-sorted start with various comment styles:
 *
 * - // keep-sorted start (C-style)
 * - # keep-sorted start (Python/shell)
 * - /* keep-sorted start (block comments)
 * - -- keep-sorted start (SQL)
 * - ; keep-sorted start (Assembly/Lisp)
 * - <!-- keep-sorted start (HTML/XML)
 *
 * Creates a new regex everytime to avoid issues with global regex state like current index.
 */
const directiveStartRegex = () => /^\s*(?:\/\/|#|\/\*|--|;|<!--)\s*keep-sorted\s+start\b/i;
const directiveOptsRegex = () => /([\w_]+)=((?:\[[^\]]*\])|(?:[^\s]+))/g;

/** Supported option value types in keep-sorted directives */
export type ValueType = "bool" | "int" | "list" | "map" | "regex";
export type TsType = boolean | number | string[] | Record<string, string> | RegExp;

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
  /** Default value if applicable */
  readonly defaultValue?: string;
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
    examples?: readonly string[];
  }) {
    this.key = params.key;
    this.description = params.description;
    this.valueType = params.valueType;
    this.category = params.category;
    this.defaultValue = params.defaultValue;
    this.examples = params.examples;
    // Always keep this as the last step in the constructor
    this.documentation = this.createDocumentation();
  }

  /** Build markdown documentation for an option. */
  private createDocumentation(): string {
    const lines: string[] = [];
    lines.push(`**${this.key}**: ${this.description}`);
    lines.push(`type: ${this.valueType}`);
    lines.push(`category: ${this.category.toLowerCase()}`);
    if (this.defaultValue) {
      lines.push(`default: \`${this.defaultValue}\``);
    }
    if (this.examples && this.examples.length > 0) {
      lines.push("examples:");
      for (const example of this.examples) {
        lines.push(`- \`${example}\``);
      }
    }
    return lines.join("\n");
  }

  /**
   * Parses a string value into the appropriate TypeScript type based on ValueType.
   *
   * @param value The string value to parse
   * @param valueType The expected value type
   *
   * @returns The parsed value in the appropriate type, or an Error if parsing fails
   */
  parseValue(value: string): TsType | Error {
    switch (this.valueType) {
      case "bool": {
        const lower = value.toLowerCase();
        if (lower === "yes" || lower === "true") {
          return true;
        }
        if (lower === "no" || lower === "false") {
          return false;
        }
        return new Error(
          `Invalid boolean value: "${value}". Expected "yes"/"no" or "true"/"false".`
        );
      }
      case "int": {
        const num = Number(value);
        if (Number.isInteger(num) && num >= 0) {
          return num;
        }
        return new Error(`Invalid integer value: "${value}". Expected a non-negative integer.`);
      }
      case "list": {
        // Split by commas and trim whitespace
        return value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      case "map": {
        const map: Record<string, string> = {};
        const entries = value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (const entry of entries) {
          const [key, val] = entry.split("=").map((s) => s.trim());
          if (!key || !val) {
            return new Error(`Invalid map entry: "${entry}". Expected format is key=value.`);
          }
          map[key] = val;
        }
        return map;
      }
      case "regex": {
        try {
          return new RegExp(value);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return new Error(`Invalid regex pattern: "${value}". ${message}`);
        }
      }
      default:
        return new Error(`Unsupported value type: "${this.valueType}".`);
    }
  }
}

/**
 * All keep-sorted options based on google/keep-sorted options.go.
 *
 * @see https://github.com/google/keep-sorted/blob/main/keepsorted/options.go
 */
export const KEEP_SORTED_OPTS = new Map<string, KeepSortedOption>(
  [
    // Pre-sorting options
    new KeepSortedOption({
      key: "skip_lines",
      description: "Number of lines to ignore before sorting (useful for table headers)",
      valueType: "int",
      category: KeepSortedOptionCategory.PreSorting,
      defaultValue: "0",
      examples: ["skip_lines=1", "skip_lines=2"],
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
      description: "Prefixes that indicate lines should be added to a group",
      valueType: "map",
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
      description: "Prefixes that should behave as sticky comments",
      valueType: "map",
      category: KeepSortedOptionCategory.PreSorting,
      examples: ["sticky_prefixes=//,#"],
    }),
    // Sorting options
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
      description: "Explicitly order lines based on their matching prefix",
      valueType: "list",
      category: KeepSortedOptionCategory.Sorting,
      examples: ["prefix_order=INIT_,,FINAL_"],
    }),
    new KeepSortedOption({
      key: "ignore_prefixes",
      description: "Prefixes to ignore when sorting lines",
      valueType: "list",
      category: KeepSortedOptionCategory.Sorting,
      examples: ["ignore_prefixes=const,let,var"],
    }),
    new KeepSortedOption({
      key: "by_regex",
      description: "Regex patterns to extract the portion of lines to sort by",
      valueType: "regex",
      category: KeepSortedOptionCategory.Sorting,
      examples: ["by_regex=\\w+;"],
    }),
    // Post-sorting options
    new KeepSortedOption({
      key: "newline_separated",
      description: "Separate sorted groups with newlines (yes/no or number of newlines)",
      valueType: "int",
      category: KeepSortedOptionCategory.PostSorting,
      defaultValue: "no",
      examples: ["newline_separated=yes", "newline_separated=no", "newline_separated=2"],
    }),
    new KeepSortedOption({
      key: "remove_duplicates",
      description: "Remove exact duplicate lines",
      valueType: "bool",
      category: KeepSortedOptionCategory.PostSorting,
      defaultValue: "yes",
      examples: ["remove_duplicates=yes", "remove_duplicates=no"],
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

  /** Parses a line of text and returns a Directive if it contains a keep-sorted start. */
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

/** Check if the position is on a keep-sorted start line and cursor is after "start". */
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
