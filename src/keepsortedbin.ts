import { spawnSync } from "child_process";
import * as path from "path";
import { dedent } from "./common";
import { hasDirectives } from "./keepsortedopt";

/*
 * Runs the keep-sorted binary without depending on `vscode`, so both the extension (through
 * `KeepSorted` in keepsorted.ts) and the standalone MCP server (mcp.ts) share one runner.
 */

/** The keep-sorted release the bundled binaries are built from (see scripts/create-binaries.ts). */
export const BUNDLED_KEEP_SORTED_VERSION = "v0.10.0";

/** Files larger than this are not read from disk for linting; open documents are always linted. */
export const MAX_SCAN_BYTES = 1024 * 1024;

/**
 * Checks whether file content is worth passing to the binary: it has directives and is not binary
 * data.
 *
 * @param text The file's content.
 *
 * @returns True when the content should be linted.
 */
export function isLintableText(text: string): boolean {
  return hasDirectives(text) && !text.includes("\0");
}

/** Default process timeout for keep-sorted CLI execution. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

/**
 * Keep Sorted finding in the JSON format reported by it's binary. Uses casing matching the binary's
 * output for deserialization.
 */
export interface KeepSortedFinding {
  /** The path the binary reports; `-` when the content came from stdin. */
  path: string;
  /** The 1-based, inclusive lines of the block. */
  lines: {
    start: number;
    end: number;
  };
  /** Why the block needs fixing. */
  message: string;
  /** Replacements that fix the block. */
  fixes: {
    replacements: {
      lines: {
        start: number;
        end: number;
      };
      new_content: string;
    }[];
  }[];
}

/** The minimal logging interface the runner needs, satisfied by the extension's winston loggers. */
export interface BinaryLogger {
  /** Logs at trace level. */
  trace(message: string): unknown;
  /** Logs at debug level. */
  debug(message: string): unknown;
  /** Logs at error level. */
  error(message: string): unknown;
}

/** A logger that discards messages, for callers without a log destination. */
export const SILENT_LOGGER: BinaryLogger = {
  trace: () => undefined,
  debug: () => undefined,
  error: () => undefined,
};

/** The exit status and output of one keep-sorted run. */
export interface SpawnResult {
  /** The process exit code. */
  code: number;
  /** Standard output. */
  stdout: string;
  /** Standard error. */
  stderr: string;
}

function outputToString(value: string | Buffer | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return "";
}

/**
 * Gets the bundled binary for a platform.
 *
 * @param root The directory containing the `bin` directory, such as the extension root.
 * @param platform The operating system, defaulting to the current one.
 * @param arch The CPU architecture, defaulting to the current one.
 *
 * @returns The binary's full path.
 */
export function bundledBinaryPath(
  root: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  switch (platform) {
    case "win32":
      return path.win32.join(root, "bin", "keep-sorted.exe");
    case "darwin":
      return path.join(root, "bin", `keep-sorted-darwin-${arch === "arm64" ? "arm64" : "amd64"}`);
    default:
      // Linux, and the fallback for platforms without a bundled binary.
      return path.join(root, "bin", "keep-sorted-linux-amd64");
  }
}

/** Runs one keep-sorted binary in lint or fix mode over text passed on stdin. */
export class KeepSortedBinary {
  /** The binary's full path. */
  readonly binaryPath: string;
  /** The binary's file name, used in log messages. */
  readonly filename: string;
  private readonly timeoutMs: number;

  /**
   * Constructs a new KeepSortedBinary.
   *
   * @param binaryPath The binary's full path.
   * @param timeoutMs How long a run may take before it is killed.
   */
  constructor(binaryPath: string, timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS) {
    this.binaryPath = binaryPath;
    this.filename = path.basename(binaryPath);
    this.timeoutMs = timeoutMs;
  }

  /**
   * Lints text and returns the binary's findings.
   *
   * @param text The content to lint.
   * @param label Names the content in log and error messages, such as its path.
   * @param log Receives log messages.
   *
   * @returns The findings, empty when every block is sorted or the text has no directives.
   *
   * @throws Error if the binary fails or its output cannot be parsed.
   */
  lint(text: string, label: string, log: BinaryLogger = SILENT_LOGGER): KeepSortedFinding[] {
    if (!hasDirectives(text)) {
      log.trace(`No keep-sorted directives; skipped ${this.filename}.`);
      return [];
    }
    const { code, stdout, stderr } = this.run(["--mode", "lint", "-"], text, label, log);
    if (code === 0) {
      return [];
    }
    if (code === 1 && stdout) {
      try {
        return JSON.parse(stdout);
      } catch (parseError) {
        const message = `Failed to parse command output: ${parseError}`;
        log.error(message);
        throw new Error(message, { cause: parseError });
      }
    }
    const message = `${this.filename} failed with code ${code}: ${stderr}`;
    log.error(message);
    throw new Error(message);
  }

  /**
   * Sorts every block in text.
   *
   * @param text The content to fix.
   * @param label Names the content in log and error messages, such as its path.
   * @param log Receives log messages.
   *
   * @returns The content with every block sorted, which equals the input when it was already
   *   sorted, or null if the binary exits with code 1.
   *
   * @throws Error if the binary fails.
   */
  fix(text: string, label: string, log: BinaryLogger = SILENT_LOGGER): string | null {
    const { code, stdout, stderr } = this.run(["--mode", "fix", "-"], text, label, log);
    if (code === 1) {
      return null;
    }
    if (code === 0 && stdout) {
      return stdout;
    }
    const message = `${this.filename} failed with code ${code}: ${stderr}`;
    log.error(message);
    throw new Error(message);
  }

  /**
   * Spawns the binary with text on stdin.
   *
   * @param args Command-line arguments.
   * @param stdin The content to pass on stdin.
   * @param label Names the content in log and error messages, such as its path.
   * @param log Receives log messages.
   *
   * @returns The exit code and output; exit codes other than 0 and 1 are logged as errors.
   *
   * @throws Error if the process cannot be spawned, is killed by a signal, or has no exit status.
   */
  run(
    args: string[],
    stdin: string,
    label: string,
    log: BinaryLogger = SILENT_LOGGER
  ): SpawnResult {
    // <binary> <args> <document paths>...
    const command = `${this.filename} ${args.join(" ")} <text from ${label}>`;
    log.trace(`Spawning "${command}"`);
    const startMs = Date.now();
    const elapsed = (): string => `${Date.now() - startMs}ms`;

    const result = spawnSync(this.binaryPath, args, {
      input: stdin,
      encoding: "utf8",
      timeout: this.timeoutMs,
    });

    const code = result.status;
    const signal = result.signal ?? undefined;
    const stdout = outputToString(result.stdout);
    const stderr = outputToString(result.stderr);

    const commandError = (
      exitCode: number,
      errorStderr: string,
      errorSignal?: NodeJS.Signals
    ): Error => {
      const signalText = errorSignal ? ` (signal: ${errorSignal})` : "";
      return new Error(dedent`
        Command failed: ${this.binaryPath} ${args.join(" ")}
          stdout: ${stdout}
          stderr: ${errorStderr}
          exit code: ${exitCode}${signalText}`);
    };
    const fail = (message: string): Error => {
      log.error(message);
      return new Error(message);
    };

    if (result.error) {
      const spawnError = commandError(
        code ?? (signal ? 128 : 1),
        stderr || result.error.message,
        signal
      );
      throw fail(`${command} failed to spawn: ${spawnError.message} (time: ${elapsed()})`);
    }
    if (signal) {
      const spawnError = commandError(
        code ?? 128,
        stderr || `Terminated by signal ${signal}`,
        signal
      );
      throw fail(`${command} terminated by signal ${signal}: ${spawnError.message}`);
    }
    if (typeof code !== "number") {
      const spawnError = commandError(1, stderr || "Process exited without status");
      throw fail(`${command} exited without status: ${spawnError.message} (time: ${elapsed()})`);
    }

    log.debug(`${command} exited (time: ${elapsed()}, code: ${code})`);
    if (code !== 0 && code !== 1) {
      log.error(`${command} error output: ${stderr}`);
    }
    return { code, stdout, stderr };
  }
}
