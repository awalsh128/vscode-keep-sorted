import * as fs from "fs";
import * as path from "path";
import { findBlocks, languageIdForPath, markers } from "../../../ai/wrap";
import { oneLine } from "../../../common";
import { bundledBinaryPath, KeepSortedBinary } from "../../../keepsortedbin";
import { Directive, END_DIRECTIVE, START_DIRECTIVE, validateOptions } from "../../../keepsortedopt";
import { EVAL_CASES, EvalCase } from "./cases";

/*
 * Grades an agent's output for an eval case. Every check is mechanical, so a failure names a
 * concrete defect. Run as a script to grade a file from a real agent run:
 *
 *   node out/test/ai/evals/grade.js list
 *   node out/test/ai/evals/grade.js prompt <case-id>
 *   node out/test/ai/evals/grade.js grade <case-id> <output-file>
 */

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const BINARY = new KeepSortedBinary(bundledBinaryPath(ROOT));

function lines(text: string): string[] {
  return text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
}

function isMarker(text: string): boolean {
  return text.includes(START_DIRECTIVE) || text.includes(END_DIRECTIVE);
}

/** Lines other than markers, sorted, so reordering compares equal and losses do not. */
function content(text: string): string[] {
  return lines(text)
    .filter((text) => !isMarker(text))
    .sort();
}

/**
 * Grades an output.
 *
 * @param evalCase The case.
 * @param output The file after the agent acted.
 *
 * @returns The defects found; empty when the output passes.
 */
export function grade(evalCase: EvalCase, output: string): string[] {
  if (evalCase.wrap === null) {
    return output === evalCase.input
      ? []
      : ["Changed order-dependent content, which must stay as written."];
  }
  const problems: string[] = [];
  const outputLines = lines(output);
  const { blocks, unbalanced } = findBlocks(outputLines);
  if (unbalanced.length > 0) {
    problems.push(`Unpaired markers on lines ${unbalanced.join(", ")}.`);
  }
  if (blocks.length !== 1) {
    problems.push(`Expected one block, found ${blocks.length}.`);
  }
  if (JSON.stringify(content(output)) !== JSON.stringify(content(evalCase.input))) {
    problems.push("Lines were added, removed, or changed, not only reordered.");
  }
  const expectedPrefix = markers(languageIdForPath(evalCase.file), {}).start.split(
    START_DIRECTIVE
  )[0];
  for (const marker of outputLines.filter(isMarker)) {
    if (!marker.trimStart().startsWith(expectedPrefix)) {
      problems.push(`Marker "${marker.trim()}" does not use the file's comment syntax.`);
    }
  }
  const block = blocks[0];
  if (block) {
    const inputRange = lines(evalCase.input)
      .slice(evalCase.wrap.startLine - 1, evalCase.wrap.endLine)
      .filter((text) => !isMarker(text))
      .sort();
    const wrapped = outputLines.slice(block.start, block.end - 1).sort();
    if (JSON.stringify(wrapped) !== JSON.stringify(inputRange)) {
      problems.push(oneLine`
        The block wraps lines ${block.start + 1}-${block.end - 1}, not the expected
        lines.`);
    }
    const directive = Directive.create(outputLines[block.start - 1].replace(/^\s*\S+/, "#"));
    const options = Object.fromEntries(
      (directive?.wellformed ?? []).map((token) => [token.key, token.value])
    );
    problems.push(...validateOptions(options));
    // Preference cases compare the same input under different preferences, so extras fail too.
    const extra = Object.keys(options).filter((key) => !(key in evalCase.wrap!.options));
    if (evalCase.category === "preferences" && extra.length > 0) {
      problems.push(
        `The start line has options the preferences do not ask for: ${extra.join(", ")}.`
      );
    }
    for (const [key, value] of Object.entries(evalCase.wrap.options)) {
      if (options[key] !== value) {
        problems.push(
          `The start line needs ${key}=${value}; it has ${key}=${options[key] ?? "unset"}.`
        );
      }
    }
  }
  const findings = BINARY.lint(output, evalCase.file);
  if (findings.length > 0) {
    problems.push(`keep-sorted still reports: ${findings.map((f) => f.message).join(" ")}`);
  }
  return problems;
}

/**
 * Runs the grading CLI.
 *
 * @param argv The command-line arguments.
 *
 * @returns The process exit code.
 */
export function main(argv: readonly string[]): number {
  const [command, id, file] = argv;
  if (command === "list") {
    EVAL_CASES.forEach((c) => console.log(`${c.id}\t${c.category}\t${c.file}`));
    return 0;
  }
  const evalCase = EVAL_CASES.find((candidate) => candidate.id === id);
  if (!evalCase) {
    console.error("Usage: grade.js list | prompt <case-id> | grade <case-id> <output-file>");
    return 2;
  }
  if (command === "prompt") {
    console.log(`File ${evalCase.file}:\n\n${evalCase.input}\n${evalCase.prompt}`);
    return 0;
  }
  if (command !== "grade" || !file) {
    console.error("Usage: grade.js grade <case-id> <output-file>");
    return 2;
  }
  const problems = grade(evalCase, fs.readFileSync(file, "utf8"));
  problems.forEach((problem) => console.log(`FAIL ${evalCase.id}: ${problem}`));
  console.log(problems.length === 0 ? `PASS ${evalCase.id}` : "");
  return problems.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
