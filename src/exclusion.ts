import globRegex from "glob-regex";
import * as path from "path";

/*
 * `keep-sorted.exclude` matching, free of `vscode` imports so the extension and the standalone MCP
 * server exclude the same files.
 */

/**
 * Compiles `keep-sorted.exclude` patterns. Each is a regular expression, or a glob when it is not a
 * valid regular expression; a pattern that is neither matches nothing.
 *
 * @param patterns The setting's patterns.
 * @param warn Reports a pattern that is neither.
 *
 * @returns One expression per pattern.
 */
export function compileExcludePatterns(
  patterns: readonly string[],
  warn: (message: string) => void = () => {}
): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (regexErr) {
      try {
        return globRegex(pattern);
      } catch (globErr) {
        warn(`Invalid exclusion pattern "${pattern}": RegExp: ${regexErr}, Glob: ${globErr}`);
        return /(?!.*)/;
      }
    }
  });
}

/**
 * Finds the exclude pattern that matches a file's workspace-relative path, full path, or name.
 *
 * @param patterns The compiled patterns.
 * @param relativePath The workspace-relative path.
 * @param fullPath The absolute path.
 *
 * @returns The first matching pattern, or null when the file is not excluded.
 */
export function matchingExclude(
  patterns: readonly RegExp[],
  relativePath: string,
  fullPath: string
): RegExp | null {
  const baseName = path.basename(fullPath);
  return (
    patterns.find(
      (regex) => regex.test(relativePath) || regex.test(fullPath) || regex.test(baseName)
    ) ?? null
  );
}
