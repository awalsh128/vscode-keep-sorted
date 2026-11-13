import * as fs from "fs";
import { parse as parseJsonc } from "jsonc-parser";
import * as path from "path";

/*
 * Small helpers shared by the extension and the standalone MCP server, so free of `vscode` imports.
 */

/**
 * Checks for a plain object, as parsed from JSON.
 *
 * @param value The value to check.
 *
 * @returns True for objects that are not arrays or null.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Gets a thrown value's message.
 *
 * @param err The thrown value.
 *
 * @returns The error's message, or the value as a string.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Formats a value as indented JSON.
 *
 * @param value The value to format.
 *
 * @returns The JSON text.
 */
export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Reads a JSON or JSONC file, such as VS Code settings, which allow comments and trailing commas.
 *
 * @param file The file path.
 *
 * @returns The parsed value, or undefined when the file is missing or unreadable.
 */
export function readJsonc(file: string): unknown {
  try {
    return parseJsonc(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Writes a file another process may be reading: writes a sibling, then renames it over the file, so
 * a reader sees the old content or the new, never a partial write. Creates missing directories.
 *
 * @param file The file path.
 * @param text The content.
 */
export function writeFileAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, "utf8");
  fs.renameSync(temporary, file);
}

/** Joins a tagged template's literal parts with its values. */
function interleave(
  strings: readonly string[],
  values: readonly unknown[],
  part: (text: string) => string
): string {
  return strings.reduce((text, literal, index) => {
    const value = index < values.length ? String(values[index]) : "";
    return text + part(literal) + value;
  }, "");
}

/**
 * Template tag for prose written across several source lines: each line break in the literal text,
 * with the indentation around it, becomes one space. Interpolated values are kept as is.
 *
 * @example
 *   oneLine`
 *     First half of a sentence,
 *     second half.`; // "First half of a sentence, second half."
 *
 * @param strings The template's literal parts.
 * @param values The template's values.
 *
 * @returns The text on one line, trimmed.
 */
export function oneLine(strings: TemplateStringsArray, ...values: unknown[]): string {
  return interleave(strings, values, (literal) => literal.replace(/[ \t]*\n[ \t]*/g, " ")).trim();
}

/**
 * Template tag for multi-line text indented to match the code around it: drops the first line break
 * and removes the literal lines' shared indentation. Interpolated values are kept as is, so
 * multi-line values are not re-indented.
 *
 * @example
 *   dedent`
 *     line one
 *       indented`; // "line one\n  indented"
 *
 * @param strings The template's literal parts.
 * @param values The template's values.
 *
 * @returns The text without the shared indentation or trailing whitespace.
 */
export function dedent(strings: TemplateStringsArray, ...values: unknown[]): string {
  const literal = strings.join("");
  const indents = [...literal.matchAll(/\n([ \t]*)(?=\S)/g)].map((match) => match[1].length);
  const shared = indents.length > 0 ? Math.min(...indents) : 0;
  const indentation = new RegExp(`\\n[ \\t]{0,${shared}}`, "g");
  return interleave(strings, values, (part) => part.replace(indentation, "\n"))
    .replace(/^\n/, "")
    .trimEnd();
}
