import * as path from "path";
import * as picomatch from "picomatch";
import { isRecord, oneLine } from "../common";
import {
  BOOL_SPELLINGS,
  END_DIRECTIVE,
  formatOptions,
  KEEP_SORTED_OPTS,
  OptionValues,
  START_DIRECTIVE,
  validateOptions,
} from "../keepsortedopt";

/*
 * Wraps lines in keep-sorted markers and resolves wrap preferences. Free of `vscode` imports so the
 * extension's language model tools and the standalone MCP server share one implementation.
 */

/** How a language writes comments; markers use the line form when there is one. */
export interface CommentSyntax {
  /** Line comment prefix, such as `//`. */
  readonly line?: string;
  /** Block comment delimiters, such as `["/*", "*\/"]`, for languages without line comments. */
  readonly block?: readonly [string, string];
}

/** A language the wrap tools know how to comment. */
export interface LanguageInfo {
  /** VS Code language IDs. */
  readonly ids: readonly string[];
  /** File extensions, including the dot, used when no language ID is available. */
  readonly extensions: readonly string[];
  /** Exact file names, used when no language ID is available. */
  readonly filenames?: readonly string[];
  /** The comment syntax, or null when the format has no comments and cannot hold markers. */
  readonly comment: CommentSyntax | null;
}

const SLASH: CommentSyntax = { line: "//" };
const HASH: CommentSyntax = { line: "#" };
const DASH: CommentSyntax = { line: "--" };
const SEMI: CommentSyntax = { line: ";" };
const PERCENT: CommentSyntax = { line: "%" };
const CSS: CommentSyntax = { block: ["/*", "*/"] };
const XML: CommentSyntax = { block: ["<!--", "-->"] };

/**
 * Languages and their comment syntax. VS Code does not expose a language's comment configuration to
 * extensions, so this table is the source for both tools and the generated docs. Entries are
 * ordered by first language ID.
 */
export const LANGUAGES: readonly LanguageInfo[] = [
  { ids: ["bat"], extensions: [".bat", ".cmd"], comment: { line: "REM" } },
  { ids: ["c"], extensions: [".c", ".h"], comment: SLASH },
  { ids: ["clojure"], extensions: [".clj", ".cljs", ".cljc", ".edn"], comment: SEMI },
  { ids: ["cmake"], extensions: [".cmake"], filenames: ["CMakeLists.txt"], comment: HASH },
  { ids: ["cpp"], extensions: [".cc", ".cpp", ".cxx", ".hh", ".hpp", ".hxx"], comment: SLASH },
  { ids: ["csharp"], extensions: [".cs"], comment: SLASH },
  { ids: ["css"], extensions: [".css"], comment: CSS },
  { ids: ["dart"], extensions: [".dart"], comment: SLASH },
  { ids: ["dockerfile"], extensions: [".dockerfile"], filenames: ["Dockerfile"], comment: HASH },
  { ids: ["dotenv"], extensions: [".env"], filenames: [".env"], comment: HASH },
  { ids: ["elixir"], extensions: [".ex", ".exs"], comment: HASH },
  { ids: ["erlang"], extensions: [".erl", ".hrl"], comment: PERCENT },
  { ids: ["fsharp"], extensions: [".fs", ".fsi", ".fsx"], comment: SLASH },
  { ids: ["go"], extensions: [".go"], comment: SLASH },
  { ids: ["go.mod"], extensions: [], filenames: ["go.mod"], comment: SLASH },
  { ids: ["graphql"], extensions: [".graphql", ".gql"], comment: HASH },
  { ids: ["groovy"], extensions: [".groovy", ".gradle"], comment: SLASH },
  { ids: ["haskell"], extensions: [".hs"], comment: DASH },
  { ids: ["hcl", "terraform"], extensions: [".hcl", ".tf", ".tfvars"], comment: HASH },
  { ids: ["html"], extensions: [".htm", ".html"], comment: XML },
  {
    ids: ["ignore"],
    extensions: [],
    filenames: [".gitignore", ".dockerignore", ".npmignore", ".vscodeignore"],
    comment: HASH,
  },
  { ids: ["ini"], extensions: [".cfg", ".conf", ".ini"], comment: SEMI },
  { ids: ["java"], extensions: [".java"], comment: SLASH },
  {
    ids: ["javascript", "javascriptreact"],
    extensions: [".cjs", ".js", ".jsx", ".mjs"],
    comment: SLASH,
  },
  { ids: ["json"], extensions: [".json"], filenames: ["package.json"], comment: null },
  {
    ids: ["jsonc"],
    extensions: [".jsonc"],
    filenames: ["tsconfig.json", "jsconfig.json", "settings.json", "devcontainer.json"],
    comment: SLASH,
  },
  { ids: ["julia"], extensions: [".jl"], comment: HASH },
  { ids: ["kotlin"], extensions: [".kt", ".kts"], comment: SLASH },
  { ids: ["latex", "tex"], extensions: [".tex", ".sty", ".cls"], comment: PERCENT },
  { ids: ["less"], extensions: [".less"], comment: SLASH },
  { ids: ["lua"], extensions: [".lua"], comment: DASH },
  { ids: ["makefile"], extensions: [".mk"], filenames: ["Makefile", "GNUmakefile"], comment: HASH },
  { ids: ["markdown"], extensions: [".md", ".markdown"], comment: XML },
  { ids: ["matlab"], extensions: [".m"], comment: PERCENT },
  { ids: ["nix"], extensions: [".nix"], comment: HASH },
  { ids: ["objective-c"], extensions: [".mm"], comment: SLASH },
  { ids: ["perl"], extensions: [".pl", ".pm"], comment: HASH },
  { ids: ["php"], extensions: [".php"], comment: SLASH },
  { ids: ["pip-requirements"], extensions: [], filenames: ["requirements.txt"], comment: HASH },
  // Plain text has no comments; # lines are what line-based formats such as allowlists skip.
  { ids: ["plaintext"], extensions: [".txt"], comment: HASH },
  { ids: ["powershell"], extensions: [".ps1", ".psm1"], comment: HASH },
  { ids: ["properties"], extensions: [".properties"], comment: HASH },
  { ids: ["proto", "proto3"], extensions: [".proto"], comment: SLASH },
  { ids: ["python"], extensions: [".py", ".pyi"], comment: HASH },
  { ids: ["r"], extensions: [".r", ".R"], comment: HASH },
  { ids: ["ruby"], extensions: [".rb"], filenames: ["Gemfile", "Rakefile"], comment: HASH },
  { ids: ["rust"], extensions: [".rs"], comment: SLASH },
  { ids: ["scala"], extensions: [".scala", ".sc"], comment: SLASH },
  { ids: ["scss"], extensions: [".scss"], comment: SLASH },
  {
    ids: ["shellscript"],
    extensions: [".bash", ".sh", ".zsh"],
    filenames: [".bashrc", ".zshrc"],
    comment: HASH,
  },
  { ids: ["sql"], extensions: [".sql"], comment: DASH },
  {
    ids: ["starlark", "bazel"],
    extensions: [".bzl", ".bazel", ".star"],
    filenames: ["BUILD", "WORKSPACE"],
    comment: HASH,
  },
  { ids: ["swift"], extensions: [".swift"], comment: SLASH },
  { ids: ["toml"], extensions: [".toml"], comment: HASH },
  {
    ids: ["typescript", "typescriptreact"],
    extensions: [".cts", ".mts", ".ts", ".tsx"],
    comment: SLASH,
  },
  { ids: ["vb"], extensions: [".vb"], comment: { line: "'" } },
  { ids: ["xml"], extensions: [".svg", ".xml", ".xsd", ".csproj"], comment: XML },
  { ids: ["yaml"], extensions: [".yaml", ".yml"], comment: HASH },
  { ids: ["zig"], extensions: [".zig"], comment: SLASH },
];

/**
 * Finds a language by VS Code language ID.
 *
 * @param languageId The VS Code language ID.
 *
 * @returns The language, or undefined when it is not in `LANGUAGES`.
 */
export function languageById(languageId: string): LanguageInfo | undefined {
  return LANGUAGES.find((language) => language.ids.includes(languageId));
}

/**
 * Infers a file's VS Code language ID from its name, for callers outside VS Code.
 *
 * @param filePath The file path.
 *
 * @returns The first language ID that matches the file name or extension, or undefined.
 */
export function languageIdForPath(filePath: string): string | undefined {
  const name = path.basename(filePath);
  const byName = LANGUAGES.find((language) => language.filenames?.includes(name));
  if (byName) {
    return byName.ids[0];
  }
  // Requirements files are often named requirements-dev.txt or similar.
  if (/^requirements.*\.txt$/.test(name)) {
    return "pip-requirements";
  }
  const extension = path.extname(name);
  return LANGUAGES.find((language) => language.extensions.includes(extension))?.ids[0];
}

/** Option values for one preference layer; null removes a value set by an earlier layer. */
export type PreferenceLayer = Readonly<Record<string, string | null>>;

/** The `keep-sorted.wrap.preferences` setting. */
export interface WrapPreferences {
  /** Options for every file. */
  readonly options?: PreferenceLayer;
  /** Options by VS Code language ID, applied after `options`. */
  readonly languages?: Readonly<Record<string, PreferenceLayer>>;
  /** Options by workspace-relative glob, applied after `languages` in key order. */
  readonly files?: Readonly<Record<string, PreferenceLayer>>;
}

/** Wrap preferences read from settings, with a problem for each dropped or invalid part. */
export interface PreferencesResult {
  /** The well-formed preferences. */
  readonly preferences: WrapPreferences;
  /** What was wrong with the rest. */
  readonly problems: readonly string[];
}

/** Options resolved for one file, with the layer each value came from. */
export interface ResolvedOptions {
  /** The merged option values. */
  readonly options: OptionValues;
  /** For each option, the layer that set it, such as `languages.go` or `files["**\/go.mod"]`. */
  readonly sources: Readonly<Record<string, string>>;
  /** Problems with the merged options, such as two layers setting conflicting options. */
  readonly problems: readonly string[];
}

/**
 * Checks a preferences value read from settings, which users edit by hand.
 *
 * @param raw The setting's value.
 *
 * @returns The well-formed layers and a problem for each part that was dropped or is invalid.
 */
export function parseWrapPreferences(raw: unknown): PreferencesResult {
  const problems: string[] = [];
  if (raw === undefined || raw === null) {
    return { preferences: {}, problems };
  }
  if (!isRecord(raw)) {
    return { preferences: {}, problems: ["Preferences must be an object."] };
  }
  const layer = (value: unknown, where: string): PreferenceLayer | undefined => {
    if (!isRecord(value)) {
      problems.push(`${where} must be an object of option values.`);
      return undefined;
    }
    const entries = Object.entries(value).filter(([key, item]) => {
      if (item === null || typeof item === "string") {
        return true;
      }
      problems.push(`${where}.${key} must be a string or null.`);
      return false;
    });
    const result = Object.fromEntries(entries) as Record<string, string | null>;
    const set = Object.fromEntries(
      Object.entries(result).filter((entry): entry is [string, string] => entry[1] !== null)
    );
    // Null values only remove options, so only the set values are validated.
    problems.push(...validateOptions(set).map((problem) => `${where}: ${problem}`));
    for (const key of Object.keys(result).filter((key) => result[key] === null)) {
      if (!KEEP_SORTED_OPTS.has(key)) {
        problems.push(`${where}: Unknown option "${key}".`);
      }
    }
    return result;
  };
  const group = (
    value: unknown,
    name: "languages" | "files"
  ): Record<string, PreferenceLayer> | undefined => {
    if (value === undefined) {
      return undefined;
    }
    if (!isRecord(value)) {
      problems.push(`${name} must be an object.`);
      return undefined;
    }
    const result: Record<string, PreferenceLayer> = {};
    for (const [key, item] of Object.entries(value)) {
      const parsed = layer(item, `${name}["${key}"]`);
      if (parsed) {
        result[key] = parsed;
      }
    }
    return result;
  };
  for (const key of Object.keys(raw)) {
    if (!["options", "languages", "files"].includes(key)) {
      problems.push(`Unknown preferences field "${key}". Valid fields: options, languages, files.`);
    }
  }
  const preferences: WrapPreferences = {
    options: raw.options === undefined ? undefined : layer(raw.options, "options"),
    languages: group(raw.languages, "languages"),
    files: group(raw.files, "files"),
  };
  return { preferences, problems };
}

/**
 * Merges preferences from a broader scope with a narrower one, such as user and workspace settings.
 * Like VS Code's own merge of object settings, nested objects merge key by key and the narrower
 * scope wins.
 *
 * @param broad The broader scope's preferences.
 * @param narrow The narrower scope's preferences.
 *
 * @returns The merged preferences.
 */
export function mergeWrapPreferences(
  broad: WrapPreferences,
  narrow: WrapPreferences
): WrapPreferences {
  const mergeGroup = (
    a?: Readonly<Record<string, PreferenceLayer>>,
    b?: Readonly<Record<string, PreferenceLayer>>
  ): Record<string, PreferenceLayer> | undefined => {
    if (!a && !b) {
      return undefined;
    }
    const result: Record<string, PreferenceLayer> = { ...a };
    for (const [key, value] of Object.entries(b ?? {})) {
      result[key] = { ...result[key], ...value };
    }
    return result;
  };
  return {
    options: broad.options || narrow.options ? { ...broad.options, ...narrow.options } : undefined,
    languages: mergeGroup(broad.languages, narrow.languages),
    files: mergeGroup(broad.files, narrow.files),
  };
}

/**
 * Resolves the options to write for one file: `options`, then `languages[languageId]`, then each
 * matching `files` glob in key order, then explicit options.
 *
 * @param preferences The wrap preferences.
 * @param languageId The file's VS Code language ID.
 * @param relativePath The file's workspace-relative path, with `/` separators.
 * @param explicit Options that override every preference, such as a tool's input.
 *
 * @returns The resolved options with the layer each came from.
 */
export function resolveOptions(
  preferences: WrapPreferences,
  languageId: string | undefined,
  relativePath: string,
  explicit: OptionValues = {}
): ResolvedOptions {
  const options: Record<string, string> = {};
  const sources: Record<string, string> = {};
  const apply = (layer: PreferenceLayer | undefined, source: string): void => {
    for (const [key, value] of Object.entries(layer ?? {})) {
      if (value === null) {
        delete options[key];
        delete sources[key];
      } else {
        options[key] = value;
        sources[key] = source;
      }
    }
  };
  apply(preferences.options, "options");
  if (languageId) {
    apply(preferences.languages?.[languageId], `languages.${languageId}`);
  }
  const normalized = relativePath.replace(/\\/g, "/");
  for (const [glob, layer] of Object.entries(preferences.files ?? {})) {
    // A namespace import has no call signature once bundled, so use the isMatch property.
    if (picomatch.isMatch(normalized, glob, { dot: true })) {
      apply(layer, `files["${glob}"]`);
    }
  }
  apply(explicit, "input");
  return { options, sources, problems: validateOptions(options) };
}

/** A failed wrap, with a message written for the agent that asked for it. */
export class WrapError extends Error {
  /**
   * Constructs a new WrapError.
   *
   * @param message Why the wrap was refused and what to do instead.
   */
  constructor(message: string) {
    super(message);
    this.name = "WrapError";
  }
}

/** A request to wrap whole lines in a block. */
export interface WrapRequest {
  /** The first line to wrap, 1-based. */
  readonly startLine: number;
  /** The last line to wrap, 1-based and inclusive. */
  readonly endLine: number;
  /** The file's VS Code language ID, which selects the comment syntax. */
  readonly languageId: string | undefined;
  /** Validated options for the start line. */
  readonly options: OptionValues;
}

/** The result of a wrap. */
export interface WrapResult {
  /** The full text with markers inserted. */
  readonly text: string;
  /** The start marker line as inserted. */
  readonly startMarker: string;
  /** The end marker line as inserted. */
  readonly endMarker: string;
  /** The start marker's line in the new text, 1-based. */
  readonly startMarkerLine: number;
  /** The end marker's line in the new text, 1-based. */
  readonly endMarkerLine: number;
}

/** A balanced block's marker lines, 1-based. */
export interface Block {
  /** The start marker's line. */
  readonly start: number;
  /** The end marker's line. */
  readonly end: number;
}

/**
 * Pairs a file's markers into blocks.
 *
 * @param lines The file's lines.
 *
 * @returns The balanced blocks and the 1-based lines of markers without a partner.
 */
export function findBlocks(lines: readonly string[]): { blocks: Block[]; unbalanced: number[] } {
  const blocks: Block[] = [];
  const open: number[] = [];
  const unbalanced: number[] = [];
  lines.forEach((line, index) => {
    if (line.includes(START_DIRECTIVE)) {
      open.push(index + 1);
    } else if (line.includes(END_DIRECTIVE)) {
      const start = open.pop();
      if (start === undefined) {
        unbalanced.push(index + 1);
      } else {
        blocks.push({ start, end: index + 1 });
      }
    }
  });
  return { blocks, unbalanced: [...open, ...unbalanced].sort((a, b) => a - b) };
}

/**
 * Builds the start and end marker lines for a language.
 *
 * @param languageId The VS Code language ID.
 * @param options Validated options for the start line.
 * @param indent Leading whitespace for both markers.
 *
 * @returns The two marker lines.
 *
 * @throws WrapError when the language is unknown or has no comments.
 */
export function markers(
  languageId: string | undefined,
  options: OptionValues,
  indent = ""
): { start: string; end: string } {
  const language = languageId ? languageById(languageId) : undefined;
  if (!language) {
    throw new WrapError(oneLine`
      No comment syntax is known for language "${languageId ?? "unknown"}". Add the markers by hand
      using the file's line comment, e.g. "# ${START_DIRECTIVE}" and "# ${END_DIRECTIVE}".`);
  }
  if (!language.comment) {
    throw new WrapError(oneLine`
      "${languageId}" files cannot contain comments, so they cannot hold keep-sorted markers. Leave
      this file unwrapped; use a comment-capable format such as JSONC if the tool reading it allows
      one.`);
  }
  const optionText = formatOptions(options);
  const start = optionText ? `${START_DIRECTIVE} ${optionText}` : START_DIRECTIVE;
  const comment = language.comment;
  const wrap = (text: string): string =>
    comment.line
      ? `${indent}${comment.line} ${text}`
      : `${indent}${comment.block![0]} ${text} ${comment.block![1]}`;
  return { start: wrap(start), end: wrap(END_DIRECTIVE) };
}

/**
 * Inserts markers around whole lines.
 *
 * @param text The file's full text.
 * @param request The lines, language, and options.
 *
 * @returns The new text and where the markers went.
 *
 * @throws WrapError when the range is invalid, the language cannot hold markers, the file already
 *   has unbalanced markers, or the range partly overlaps an existing block.
 */
export function wrapLines(text: string, request: WrapRequest): WrapResult {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  // A trailing newline leaves an empty last element that is not a line.
  const lineCount = text.endsWith("\n") ? lines.length - 1 : lines.length;
  const { startLine, endLine } = request;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    throw new WrapError("startLine and endLine must be integers.");
  }
  if (startLine < 1 || endLine > lineCount || startLine > endLine) {
    throw new WrapError(oneLine`
      Lines ${startLine}-${endLine} are outside the file, which has ${lineCount} lines. Use 1-based,
      inclusive line numbers with startLine <= endLine.`);
  }
  const range = lines.slice(startLine - 1, endLine);
  if (range.every((line) => line.trim() === "")) {
    throw new WrapError(`Lines ${startLine}-${endLine} are blank; there is nothing to sort.`);
  }

  const { blocks, unbalanced } = findBlocks(lines.slice(0, lineCount));
  if (unbalanced.length > 0) {
    throw new WrapError(oneLine`
      The file has keep-sorted markers without a partner on lines ${unbalanced.join(", ")}. Fix
      them first: sorting would delete an unpaired marker line.`);
  }
  for (const block of blocks) {
    const inside = startLine <= block.start && block.end <= endLine;
    const around = block.start < startLine && endLine < block.end;
    const apart = block.end < startLine || endLine < block.start;
    if (!inside && !around && !apart) {
      throw new WrapError(oneLine`
        Lines ${startLine}-${endLine} partly overlap the block on lines
        ${block.start}-${block.end}. Wrap a range that contains the whole block, lies entirely
        inside it, or does not touch it.`);
    }
  }

  const firstLine = range.find((line) => line.trim() !== "")!;
  const indent = firstLine.match(/^\s*/)![0];
  const { start, end } = markers(request.languageId, request.options, indent);
  const result = [...lines.slice(0, startLine - 1), start, ...range, end, ...lines.slice(endLine)];
  return {
    text: result.join(eol),
    startMarker: start,
    endMarker: end,
    startMarkerLine: startLine,
    endMarkerLine: endLine + 2,
  };
}

/**
 * Builds the JSON schema for `keep-sorted.wrap.preferences` from `KEEP_SORTED_OPTS`, so settings
 * editors suggest every option and its values. `npm run gen:ai` writes it to package.json.
 *
 * The option layer is written once, under `options`; `languages` and `files` refer to it with
 * `$ref`, which VS Code resolves against the settings schema, where each setting is a property.
 *
 * @param settingName The setting's full name, which locates `options` for the references.
 *
 * @returns The setting's JSON schema, without its description, default, or order.
 */
export function wrapPreferencesSchema(settingName: string): Record<string, unknown> {
  const defaultNote = (value: string | undefined): string =>
    value ? ` keep-sorted default: \`${value}\`.` : "";
  const values = (option: { valueType: string; values?: readonly string[] }): unknown => {
    switch (option.valueType) {
      case "bool":
        return { enum: [...BOOL_SPELLINGS, null] };
      case "enum":
        return { enum: [...(option.values ?? []), null] };
      case "intOrBool":
        return { pattern: "^(\\d+|yes|no|true|false)$" };
      case "intList":
        return { pattern: "^(-?\\d+(,-?\\d+)*|\\[.*\\])$" };
      default:
        return {};
    }
  };
  const layer = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      [...KEEP_SORTED_OPTS.values()].map((option) => [
        option.key,
        {
          type: ["string", "null"],
          ...(values(option) as object),
          markdownDescription: oneLine`
            ${option.description}.${defaultNote(option.defaultValue)} \`null\` removes a value set
            by an earlier layer.`,
        },
      ])
    ),
  };
  const layerRef = { $ref: `#/properties/${settingName}/properties/options` };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      options: { ...layer, markdownDescription: "Options for every file." },
      languages: {
        type: "object",
        markdownDescription: "Options by VS Code language ID, applied after `options`.",
        additionalProperties: layerRef,
      },
      files: {
        type: "object",
        markdownDescription: oneLine`
          Options by workspace-relative glob such as \`**/go.mod\`, applied after \`languages\` in
          the order written.`,
        additionalProperties: layerRef,
      },
    },
  };
}
