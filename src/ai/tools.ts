import * as path from "path";
import { isRecord, oneLine, prettyJson } from "../common";
import { BUNDLED_KEEP_SORTED_VERSION, KeepSortedFinding } from "../keepsortedbin";
import { KEEP_SORTED_OPTS, OptionValues, validateOptions } from "../keepsortedopt";
import { GUIDE_TOPICS, isGuideTopic, readGuide } from "./docs";
import { resolveOptions, WrapError, wrapLines, WrapPreferences } from "./wrap";

/*
 * The agent tools, defined once for both front ends: lmtools.ts registers them as VS Code language
 * model tools for Copilot, and mcp.ts serves them over MCP for other agents. Free of `vscode`
 * imports; each front end supplies a `ToolHost` for file access and sorting.
 */

/** The MCP state file holding the user-level `keep-sorted.wrap.preferences`, written by VS Code. */
export const USER_PREFERENCES_FILE = "user-preferences.json";

/** Prefix of the per-window MCP state files listing files with unsaved changes in VS Code. */
export const DIRTY_FILE_PREFIX = "dirty-";

/** One tool's definition, mirrored by `contributes.languageModelTools` in package.json. */
export interface ToolSpec {
  /** The tool name agents call. */
  readonly name: string;
  /** A short name for UIs. */
  readonly displayName: string;
  /** The name users type after `#` in VS Code chat. */
  readonly toolReferenceName: string;
  /** What the tool does, for people. */
  readonly userDescription: string;
  /** When and how to use the tool, for the model. */
  readonly modelDescription: string;
  /** JSON schema for the input. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

const FILE_DESCRIPTION =
  "The file: a file URI, an absolute path, or a path relative to the workspace root.";

/** The tools, in the order agents typically call them. */
export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: "keepSorted_getGuide",
    displayName: "Keep Sorted: Get Guide",
    toolReferenceName: "keepSortedGuide",
    userDescription: "Read Keep Sorted guidance for wrapping, options, and verification.",
    modelDescription: oneLine`
      Returns guidance on keeping code sorted with keep-sorted blocks, matching the installed
      extension. Call it before adding keep-sorted markers or choosing options: start with
      'overview', and always read 'when-not-to-wrap' before wrapping, since sorting order-dependent
      code (middleware, precedence lists, CSS rules, positional arguments) changes behavior. Topics:
      overview (workflow and common mistakes), when-not-to-wrap, choosing-options (options by
      content type, including functions and class members), markers-and-languages (comment syntax),
      preferences, verification, options (every option and its values). Not needed for sorting
      blocks that already exist; use keepSorted_run.`,
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: Object.keys(GUIDE_TOPICS),
          description: "The guide to read. Start with 'overview'.",
        },
      },
      required: ["topic"],
      additionalProperties: false,
    },
  },
  {
    name: "keepSorted_getPreferences",
    displayName: "Keep Sorted: Get Preferences",
    toolReferenceName: "keepSortedPreferences",
    userDescription: "Read your default keep-sorted options for new blocks.",
    modelDescription: oneLine`
      Returns the user's preferred keep-sorted options for new blocks (the
      keep-sorted.wrap.preferences setting). Pass a file to also get the options resolved for that
      file, with the setting layer each came from. Call it before choosing options for a new block.
      keepSorted_wrapRange applies these preferences itself, so call this to plan or explain
      options, not before every wrap. Existing blocks keep their own options.`,
    inputSchema: {
      type: "object",
      properties: {
        uri: { type: "string", description: `${FILE_DESCRIPTION} Optional.` },
      },
      additionalProperties: false,
    },
  },
  {
    name: "keepSorted_wrapRange",
    displayName: "Keep Sorted: Wrap Lines",
    toolReferenceName: "keepSortedWrap",
    userDescription: "Wrap lines in keep-sorted markers so they stay sorted.",
    modelDescription: oneLine`
      Inserts keep-sorted start and end markers around whole lines, using the file language's
      comment syntax and indentation, with the user's preferred options plus any you pass. It does
      not sort; call keepSorted_run afterwards and check the diff. Use it only for order-independent
      content: read the 'when-not-to-wrap' guide first, and for multi-line items such as functions
      or class members read 'choosing-options' for the options they need. Fails with an explanation
      for files without comments (JSON), ranges that partly overlap an existing block, files with
      unpaired markers, and invalid options, listing the valid values. Lines are 1-based and
      inclusive; read the file first for exact numbers.`,
    inputSchema: {
      type: "object",
      properties: {
        uri: { type: "string", description: FILE_DESCRIPTION },
        startLine: {
          type: "integer",
          minimum: 1,
          description: "First line to wrap, 1-based. The start marker goes above it.",
        },
        endLine: {
          type: "integer",
          minimum: 1,
          description: "Last line to wrap, 1-based and inclusive. The end marker goes below it.",
        },
        options: {
          type: "object",
          description: oneLine`
            keep-sorted options for the start line, written as on the start line, e.g. {"numeric":
            "yes"}. They override preferences. Read the 'options' guide for values.`,
          properties: Object.fromEntries(
            [...KEEP_SORTED_OPTS.values()].map((option) => [
              option.key,
              { type: "string", description: option.description },
            ])
          ),
          additionalProperties: false,
        },
        usePreferences: {
          type: "boolean",
          description: "Apply the user's wrap preferences. Defaults to true.",
        },
      },
      required: ["uri", "startLine", "endLine"],
      additionalProperties: false,
    },
  },
  {
    name: "keepSorted_run",
    displayName: "Keep Sorted: Sort",
    toolReferenceName: "keepSortedRun",
    userDescription: "Sort keep-sorted blocks in a file or the workspace.",
    modelDescription: oneLine`
      Sorts keep-sorted blocks and returns the diagnostics that remain, such as unpaired markers or
      invalid options. Use scope 'file' with a uri after wrapping or editing a block; use
      'workspace' only when the user asks to sort everything. Only lines between markers move. After
      it runs, compare the file with its previous state: each item should move whole, with its
      comments and decorators.`,
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["file", "workspace"],
          description: "'file' sorts one file; 'workspace' sorts every file with unsorted blocks.",
        },
        uri: { type: "string", description: `${FILE_DESCRIPTION} Required for scope 'file'.` },
      },
      required: ["scope"],
      additionalProperties: false,
    },
  },
];

/** A problem reported by a block, with 1-based lines. */
export interface BlockProblem {
  /** The first line. */
  readonly startLine: number;
  /** The last line. */
  readonly endLine: number;
  /** What is wrong. */
  readonly message: string;
}

/** A file the tools act on. */
export interface ToolFile {
  /** The identifier the host uses, such as a URI string. */
  readonly id: string;
  /** The workspace-relative path with `/` separators, for display and globs. */
  readonly relativePath: string;
  /** The VS Code language ID, when known. */
  readonly languageId: string | undefined;
}

/** File access and sorting, supplied by each front end. */
export interface ToolHost {
  /** The Keep Sorted extension version. */
  readonly extensionVersion: string;
  /** The docs/ai directory. */
  readonly docsDir: string;
  /**
   * Resolves a tool's `uri` input.
   *
   * @throws ToolInputError when the file is missing, outside the workspace, or excluded.
   */
  resolve(uri: string): Promise<ToolFile>;
  /** Reads a file's current text, including unsaved changes in an editor. */
  readText(file: ToolFile): Promise<string>;
  /** Replaces a file's text. */
  writeText(file: ToolFile, text: string): Promise<void>;
  /** The wrap preferences in effect and problems found reading them. */
  preferences(): Promise<{ preferences: WrapPreferences; problems: readonly string[] }>;
  /** The keep-sorted findings for a file's current text. */
  problems(file: ToolFile): Promise<BlockProblem[]>;
  /** Sorts one file and returns whether it changed. */
  sortFile(file: ToolFile): Promise<boolean>;
  /** Sorts every file with findings and returns the files changed and remaining findings. */
  sortWorkspace(): Promise<{
    changed: string[];
    remaining: { file: string; problems: BlockProblem[] }[];
  }>;
}

/** Input the agent can fix, reported back to it as the tool's error message. */
export class ToolInputError extends Error {
  /**
   * Constructs a new ToolInputError.
   *
   * @param message What was wrong and how to call the tool instead.
   */
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

/** How a tool's file input was written. */
export type ToolInputTarget =
  { readonly kind: "uri"; readonly uri: string } | { readonly kind: "path"; readonly path: string };

/**
 * Interprets a tool's file input for both front ends: a URI with a scheme, an absolute path, or a
 * path relative to the workspace root.
 *
 * @param input The tool input.
 * @param root The workspace root's path, if any.
 *
 * @returns A URI to parse, or an absolute path.
 *
 * @throws ToolInputError when a relative path is given without a workspace root.
 */
export function resolveToolInput(input: string, root: string | undefined): ToolInputTarget {
  // A Windows drive letter such as C:\ looks like a URI scheme.
  if (/^[a-z][\w+.-]+:/i.test(input) && !/^[a-z]:[\\/]/i.test(input)) {
    return { kind: "uri", uri: input };
  }
  if (path.isAbsolute(input) || /^[a-z]:[\\/]/i.test(input)) {
    return { kind: "path", path: input };
  }
  if (!root) {
    throw new ToolInputError(oneLine`
      "${input}" is relative, but no workspace folder is open. Pass an absolute path.`);
  }
  return { kind: "path", path: path.join(root, input) };
}

/**
 * Converts the binary's findings to tool problems.
 *
 * @param findings The findings.
 *
 * @returns The problems, with the binary's 1-based lines.
 */
export function findingProblems(findings: readonly KeepSortedFinding[]): BlockProblem[] {
  return findings.map((finding) => ({
    startLine: finding.lines.start,
    endLine: finding.lines.end,
    message: finding.message,
  }));
}

/** Checks the input's top-level keys and types against a tool's schema. */
function checkInput(spec: ToolSpec, input: unknown): Record<string, unknown> {
  if (input !== undefined && !isRecord(input)) {
    throw new ToolInputError(`${spec.name} takes an object.`);
  }
  const record = input ?? {};
  const schema = spec.inputSchema as {
    properties: Record<string, { type: string; enum?: string[] }>;
    required?: string[];
  };
  const problems: string[] = [];
  for (const key of Object.keys(record)) {
    if (!(key in schema.properties)) {
      problems.push(
        `Unknown input "${key}". Valid inputs: ${Object.keys(schema.properties).join(", ")}.`
      );
    }
  }
  for (const key of schema.required ?? []) {
    if (record[key] === undefined) {
      problems.push(`Missing required input "${key}".`);
    }
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    const value = record[key];
    if (value === undefined) {
      continue;
    }
    const type = property.type;
    const ok =
      (type === "string" && typeof value === "string") ||
      (type === "integer" && Number.isInteger(value)) ||
      (type === "boolean" && typeof value === "boolean") ||
      (type === "object" && isRecord(value));
    if (!ok) {
      problems.push(`Input "${key}" must be ${type === "integer" ? "an" : "a"} ${type}.`);
    } else if (property.enum && !property.enum.includes(value as string)) {
      problems.push(`Input "${key}" must be one of: ${property.enum.join(", ")}.`);
    }
  }
  if (problems.length > 0) {
    throw new ToolInputError(problems.join(" "));
  }
  return record;
}

/**
 * Runs a tool.
 *
 * @param name The tool name.
 * @param input The tool input from the agent.
 * @param host File access and sorting.
 *
 * @returns The tool's text result.
 *
 * @throws ToolInputError when the input is invalid or the request cannot be done as asked; the
 *   message is written for the agent.
 */
export async function runTool(name: string, input: unknown, host: ToolHost): Promise<string> {
  const tool = TOOL_SPECS.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new ToolInputError(
      `Unknown tool "${name}". Tools: ${TOOL_SPECS.map((t) => t.name).join(", ")}.`
    );
  }
  const args = checkInput(tool, input);
  switch (name) {
    case "keepSorted_getGuide":
      return getGuide(args, host);
    case "keepSorted_getPreferences":
      return getPreferences(args, host);
    case "keepSorted_wrapRange":
      return wrapRange(args, host);
    default:
      return run(args, host);
  }
}

function getGuide(args: Record<string, unknown>, host: ToolHost): string {
  const topic = args.topic;
  if (!isGuideTopic(topic)) {
    throw new ToolInputError(`Unknown topic. Topics: ${Object.keys(GUIDE_TOPICS).join(", ")}.`);
  }
  const header = oneLine`
    <!-- Keep Sorted ${host.extensionVersion}, keep-sorted ${BUNDLED_KEEP_SORTED_VERSION}, topic
    "${topic}". Other topics: ${Object.keys(GUIDE_TOPICS).join(", ")}. -->`;
  return `${header}\n\n${readGuide(host.docsDir, topic)}`;
}

async function getPreferences(args: Record<string, unknown>, host: ToolHost): Promise<string> {
  const { preferences, problems } = await host.preferences();
  if (typeof args.uri !== "string") {
    return prettyJson({ preferences, problems });
  }
  const file = await host.resolve(args.uri);
  const resolved = resolveOptions(preferences, file.languageId, file.relativePath);
  return prettyJson({
    preferences,
    problems,
    file: file.relativePath,
    languageId: file.languageId ?? null,
    resolvedOptions: resolved.options,
    optionSources: resolved.sources,
    resolvedProblems: resolved.problems,
  });
}

async function wrapRange(args: Record<string, unknown>, host: ToolHost): Promise<string> {
  const explicit = (args.options ?? {}) as OptionValues;
  const inputProblems = validateOptions(explicit);
  if (inputProblems.length > 0) {
    throw new ToolInputError(`Invalid options: ${inputProblems.join(" ")}`);
  }
  const file = await host.resolve(args.uri as string);
  const { preferences, problems: preferenceProblems } =
    args.usePreferences === false ? { preferences: {}, problems: [] } : await host.preferences();
  const resolved = resolveOptions(preferences, file.languageId, file.relativePath, explicit);
  if (resolved.problems.length > 0) {
    throw new ToolInputError(oneLine`
      The options for ${file.relativePath} are invalid: ${resolved.problems.join(" ")} Option
      sources: ${JSON.stringify(resolved.sources)}. Pass an override in options, or
      usePreferences: false.`);
  }
  const text = await host.readText(file);
  let result;
  try {
    result = wrapLines(text, {
      startLine: args.startLine as number,
      endLine: args.endLine as number,
      languageId: file.languageId,
      options: resolved.options,
    });
  } catch (err: Error | unknown) {
    if (err instanceof WrapError) {
      throw new ToolInputError(err.message);
    }
    throw err;
  }
  await host.writeText(file, result.text);
  const blockProblems = (await host.problems(file)).filter(
    (problem) =>
      problem.endLine >= result.startMarkerLine && problem.startLine <= result.endMarkerLine
  );
  return prettyJson({
    file: file.relativePath,
    startMarker: { line: result.startMarkerLine, text: result.startMarker.trim() },
    endMarker: { line: result.endMarkerLine, text: result.endMarker.trim() },
    options: resolved.options,
    optionSources: resolved.sources,
    preferenceProblems,
    blockProblems,
    next:
      blockProblems.length > 0
        ? "The block is unsorted. Call keepSorted_run with scope 'file', then check the diff."
        : "The block is already sorted. Check the diff of the marker lines.",
  });
}

async function run(args: Record<string, unknown>, host: ToolHost): Promise<string> {
  if (args.scope === "workspace") {
    return prettyJson(await host.sortWorkspace());
  }
  if (typeof args.uri !== "string") {
    throw new ToolInputError('Scope "file" needs a uri. Use scope "workspace" to sort every file.');
  }
  const file = await host.resolve(args.uri);
  const changed = await host.sortFile(file);
  const remaining = await host.problems(file);
  return prettyJson({
    file: file.relativePath,
    changed,
    remaining,
    next:
      remaining.length > 0
        ? "Fix the remaining problems: unpaired markers or invalid options are not sort issues."
        : "Sorted. Check the diff: each item should move whole.",
  });
}

/**
 * Describes a tool call for a confirmation prompt, for tools that change files.
 *
 * @param name The tool name.
 * @param input The tool input.
 *
 * @returns A title and message, or undefined for read-only tools.
 */
export function confirmation(
  name: string,
  input: unknown
): { title: string; message: string } | undefined {
  const args = isRecord(input) ? input : {};
  if (name === "keepSorted_wrapRange") {
    const options = isRecord(args.options) ? prettyJson(args.options) : "preferences only";
    return {
      title: "Wrap lines in a keep-sorted block?",
      message: oneLine`
        Insert keep-sorted markers around lines ${String(args.startLine)}-${String(args.endLine)}
        of ${String(args.uri)}. Options: ${options}.`,
    };
  }
  if (name === "keepSorted_run") {
    return {
      title: "Sort keep-sorted blocks?",
      message:
        args.scope === "workspace"
          ? "Sort every file in the workspace that has unsorted keep-sorted blocks."
          : `Sort the keep-sorted blocks in ${String(args.uri)}.`,
    };
  }
  return undefined;
}

/** The names of the read-only tools, which need no confirmation. */
export const READ_ONLY_TOOLS = TOOL_SPECS.map((tool) => tool.name).filter(
  (name) => confirmation(name, {}) === undefined
);
