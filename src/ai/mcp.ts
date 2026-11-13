import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { errorMessage, isRecord, oneLine, readJsonc, writeFileAtomic } from "../common";
import { compileExcludePatterns, matchingExclude } from "../exclusion";
import {
  bundledBinaryPath,
  isLintableText,
  KeepSortedBinary,
  MAX_SCAN_BYTES,
} from "../keepsortedbin";
import {
  BlockProblem,
  dirtyFilePid,
  excludedFileError,
  FileProblems,
  findingProblems,
  MIRRORED_SETTINGS,
  READ_ONLY_TOOLS,
  resolveToolInput,
  runTool,
  SETTINGS_SECTION,
  SortWorkspaceResult,
  TOOL_SPECS,
  ToolFile,
  ToolHost,
  ToolInputError,
  USER_SETTINGS_FILE,
} from "./tools";
import {
  languageIdForPath,
  mergeWrapPreferences,
  parseWrapPreferences,
  PreferencesResult,
} from "./wrap";

/*
 * A stdio MCP server exposing the agent tools to agents outside VS Code's language model API,
 * such as Claude Code and Cursor. It works on files on disk under one workspace root and never
 * loads `vscode`. The extension installs it to a stable path (see mcpinstall.ts) and keeps two
 * state files beside it: the user-level wrap preferences, and each window's unsaved files.
 */

/** Directories never searched when git is unavailable. */
const SKIPPED_DIRS = new Set([".git", "node_modules", "dist", "out", ".vscode-test"]);

/** Where the server finds its docs, binary, and state. */
export interface ServerLayout {
  /** The directory holding `docs/ai` and `bin`. */
  readonly installRoot: string;
  /** The directory holding the state files, which may not exist. */
  readonly stateDir: string;
}

/**
 * Finds the server's layout from its own location: an installed copy keeps docs and binaries beside
 * it, while a build in the extension's `dist` or `out` directory finds them one level up.
 *
 * @param serverDir The directory containing the server script.
 *
 * @returns The layout.
 */
export function serverLayout(serverDir: string): ServerLayout {
  const installRoot = fs.existsSync(path.join(serverDir, "docs", "ai"))
    ? serverDir
    : path.dirname(serverDir);
  return { installRoot, stateDir: path.join(path.dirname(serverDir), "state") };
}

/** Reads a settings.json-style file, or an empty object when it is missing or malformed. */
function readSettings(file: string): Record<string, unknown> {
  const settings = readJsonc(file);
  return isRecord(settings) ? settings : {};
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    // EPERM means the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Gives the shared tools access to files on disk under one workspace root. */
export class DiskToolHost implements ToolHost {
  readonly extensionVersion: string;
  readonly docsDir: string;
  private readonly root: string;
  private readonly stateDir: string;
  private readonly binary: KeepSortedBinary;

  /**
   * Constructs a new DiskToolHost.
   *
   * @param root The workspace root; tools only touch files under it.
   * @param layout Where the docs, binary, and state live.
   * @param extensionVersion The Keep Sorted version the server was built from.
   */
  constructor(root: string, layout: ServerLayout, extensionVersion: string) {
    this.root = path.resolve(root);
    this.stateDir = layout.stateDir;
    this.docsDir = path.join(layout.installRoot, "docs", "ai");
    this.extensionVersion = extensionVersion;
    this.binary = new KeepSortedBinary(
      process.env.KEEP_SORTED_BINARY ?? bundledBinaryPath(layout.installRoot)
    );
  }

  async resolve(input: string): Promise<ToolFile> {
    const target = resolveToolInput(input, this.root);
    if (target.kind === "uri" && !target.uri.startsWith("file:")) {
      throw new ToolInputError(`${input} is not a file URI; the MCP server reads files on disk.`);
    }
    const absolute = path.resolve(target.kind === "uri" ? fileURLToPath(target.uri) : target.path);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new ToolInputError(`${input} is outside the workspace root ${this.root}.`);
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new ToolInputError(`${input} is not a file.`);
    }
    const relativePath = relative.split(path.sep).join("/");
    if (this.isExcluded(relativePath)) {
      throw excludedFileError(input);
    }
    return { id: absolute, relativePath, languageId: languageIdForPath(absolute) };
  }

  async readText(file: ToolFile): Promise<string> {
    return fs.readFileSync(file.id, "utf8");
  }

  async writeText(file: ToolFile, text: string): Promise<void> {
    this.ensureSaved(file);
    writeFileAtomic(file.id, text);
  }

  async preferences(): Promise<PreferencesResult> {
    const user = parseWrapPreferences(this.userSetting(MIRRORED_SETTINGS.wrapPreferences));
    const workspace = parseWrapPreferences(
      this.workspaceSetting(MIRRORED_SETTINGS.wrapPreferences)
    );
    return {
      preferences: mergeWrapPreferences(user.preferences, workspace.preferences),
      problems: [
        ...user.problems.map((problem) => `User settings: ${problem}`),
        ...workspace.problems.map((problem) => `.vscode/settings.json: ${problem}`),
      ],
    };
  }

  async problems(file: ToolFile): Promise<BlockProblem[]> {
    return findingProblems(this.binary.lint(await this.readText(file), file.relativePath));
  }

  async sortFile(file: ToolFile): Promise<boolean> {
    const text = await this.readText(file);
    if ((await this.problems(file)).length === 0) {
      return false;
    }
    const fixed = this.binary.fix(text, file.relativePath);
    if (fixed === null || fixed === text) {
      return false;
    }
    await this.writeText(file, fixed);
    return true;
  }

  async sortWorkspace(): Promise<SortWorkspaceResult> {
    const changed: string[] = [];
    const remaining: FileProblems[] = [];
    const excludes = this.excludePatterns();
    const candidates = this.candidateFiles().filter(
      (relativePath) => !this.isExcluded(relativePath, excludes)
    );
    for (const relativePath of candidates) {
      const file = await this.resolve(relativePath);
      try {
        if (await this.sortFile(file)) {
          changed.push(file.relativePath);
        }
      } catch (err: Error | unknown) {
        remaining.push({
          file: file.relativePath,
          problems: [{ startLine: 1, endLine: 1, message: errorMessage(err) }],
        });
        continue;
      }
      const problems = await this.problems(file);
      if (problems.length > 0) {
        remaining.push({ file: file.relativePath, problems });
      }
    }
    return { changed, remaining };
  }

  /** A setting's user-level value, as mirrored by VS Code. */
  private userSetting(key: string): unknown {
    return readSettings(path.join(this.stateDir, USER_SETTINGS_FILE))[`${SETTINGS_SECTION}.${key}`];
  }

  /** A setting's value in the workspace's .vscode/settings.json. */
  private workspaceSetting(key: string): unknown {
    return readSettings(path.join(this.root, ".vscode", "settings.json"))[
      `${SETTINGS_SECTION}.${key}`
    ];
  }

  /**
   * The `keep-sorted.exclude` patterns. Like VS Code, which replaces array settings rather than
   * merging them, a workspace value replaces the user value.
   */
  private excludePatterns(): RegExp[] {
    const value =
      this.workspaceSetting(MIRRORED_SETTINGS.exclude) ??
      this.userSetting(MIRRORED_SETTINGS.exclude);
    const patterns = Array.isArray(value) ? value.filter((p) => typeof p === "string") : [];
    return compileExcludePatterns(patterns);
  }

  private isExcluded(relativePath: string, patterns = this.excludePatterns()): boolean {
    return matchingExclude(patterns, relativePath, path.join(this.root, relativePath)) !== null;
  }

  /** Throws when a VS Code window holds unsaved changes to the file. */
  private ensureSaved(file: ToolFile): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.stateDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const pid = dirtyFilePid(entry);
      if (pid === undefined || !isAlive(pid)) {
        continue;
      }
      const dirty = readJsonc(path.join(this.stateDir, entry));
      if (Array.isArray(dirty) && dirty.includes(file.id)) {
        throw new ToolInputError(oneLine`
          ${file.relativePath} has unsaved changes in VS Code. Ask the user to save or revert it,
          then try again.`);
      }
    }
  }

  /** Workspace files that may contain blocks, respecting .gitignore when git is available. */
  private candidateFiles(): string[] {
    let files: string[];
    try {
      files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
        .split("\0")
        .filter((file) => file !== "");
    } catch {
      files = this.walk(this.root).map((file) => path.relative(this.root, file));
    }
    return files.filter((file) => {
      const absolute = path.join(this.root, file);
      try {
        const stat = fs.statSync(absolute);
        if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) {
          return false;
        }
        return isLintableText(fs.readFileSync(absolute, "utf8"));
      } catch {
        return false;
      }
    });
  }

  private walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRS.has(entry.name) ? [] : this.walk(full);
      }
      return entry.isFile() ? [full] : [];
    });
  }
}

/** Instructions MCP clients may show the model when it connects. */
const INSTRUCTIONS = oneLine`
  Tools for keeping code sorted with keep-sorted blocks. Before wrapping lines in a new block, call
  keepSorted_getGuide with topic 'when-not-to-wrap': sorting order-dependent code changes behavior.
  Then wrap with keepSorted_wrapRange and sort with keepSorted_run.`;

/**
 * Creates the MCP server for a host.
 *
 * @param host File access and sorting.
 *
 * @returns The server, not yet connected.
 */
export function createServer(host: ToolHost): Server {
  const server = new Server(
    { name: "keep-sorted", version: host.extensionVersion },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_SPECS.map((spec) => ({
      name: spec.name,
      title: spec.displayName,
      description: spec.modelDescription,
      inputSchema: spec.inputSchema as { type: "object" },
      annotations: {
        readOnlyHint: READ_ONLY_TOOLS.includes(spec.name),
        destructiveHint: false,
        openWorldHint: false,
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const text = await runTool(request.params.name, request.params.arguments, host);
      return { content: [{ type: "text" as const, text }] };
    } catch (err: Error | unknown) {
      // MCP reports tool failures as results so the model can read them and retry.
      return { content: [{ type: "text" as const, text: errorMessage(err) }], isError: true };
    }
  });
  return server;
}

/**
 * Picks the workspace root: `--root <dir>`, then `CLAUDE_PROJECT_DIR`, then the working directory.
 *
 * @param argv The command-line arguments after the script.
 * @param env The environment.
 * @param cwd The working directory.
 *
 * @returns The root directory.
 */
export function workspaceRoot(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string
): string {
  const flag = argv.indexOf("--root");
  if (flag >= 0 && argv[flag + 1]) {
    return path.resolve(cwd, argv[flag + 1]);
  }
  return env.CLAUDE_PROJECT_DIR || cwd;
}

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { version } = require("../../package.json") as { version: string };
  const root = workspaceRoot(process.argv.slice(2), process.env, process.cwd());
  const host = new DiskToolHost(root, serverLayout(__dirname), version);
  await createServer(host).connect(new StdioServerTransport());
}

if (require.main === module) {
  main().catch((err: unknown) => {
    // stdout carries the protocol, so diagnostics go to stderr.
    console.error(err);
    process.exit(1);
  });
}
