import { WrapPreferences } from "../../../ai/wrap";
import { dedent } from "../../../common";

/*
 * Prompt cases for agents using the Keep Sorted tools and docs. Each case pairs what a user asks
 * with a file and the outcome a careful agent reaches. grade.ts checks an agent's output against
 * the expectation; evals.test.ts replays the reference action through the tools.
 */

/** The kind of judgment a case tests. */
export type EvalCategory = "wrap" | "no-wrap" | "preferences" | "markers";

/** One eval case. */
export interface EvalCase {
  /** A stable identifier, used by the CLI. */
  readonly id: string;
  /** The kind of judgment the case tests. */
  readonly category: EvalCategory;
  /** What the user asks the agent. */
  readonly prompt: string;
  /** The file's workspace-relative path, which decides its language. */
  readonly file: string;
  /** The file's content before the agent acts. */
  readonly input: string;
  /** The user's `keep-sorted.wrap.preferences`, if any. */
  readonly preferences?: WrapPreferences;
  /**
   * The reference action: the 1-based lines to wrap and the options the start line must carry, or
   * null when the agent must leave the file unchanged.
   */
  readonly wrap: {
    readonly startLine: number;
    readonly endLine: number;
    readonly options: Readonly<Record<string, string>>;
  } | null;
  /** For marker repairs, the file a careful agent produces. */
  readonly repaired?: string;
  /** Why the expected outcome is right, for people reviewing a failure. */
  readonly rationale: string;
}

const line = (text: string): string => `${text}\n`;

/** The cases. */
export const EVAL_CASES: readonly EvalCase[] = [
  {
    id: "python-dependency-list",
    category: "wrap",
    prompt: "Keep the dependency list in setup.py sorted.",
    file: "setup.py",
    input: line(dedent`
      install_requires = [
          "requests",
          "attrs",
          "numpy",
      ]`),
    wrap: { startLine: 2, endLine: 4, options: {} },
    rationale: "Requirement order has no meaning to pip.",
  },
  {
    id: "typescript-named-imports",
    category: "wrap",
    prompt: "Keep the names imported from ./shapes sorted.",
    file: "src/draw.ts",
    input: line(dedent`
      import {
        Square,
        Circle,
        Triangle,
      } from "./shapes";`),
    wrap: { startLine: 2, endLine: 4, options: {} },
    rationale: "Named import specifiers bind names; their order has no effect.",
  },
  {
    id: "typescript-string-enum",
    category: "wrap",
    prompt: "Sort the Color enum members.",
    file: "src/color.ts",
    input: line(dedent`
      export enum Color {
        Red = "red",
        Blue = "blue",
        Green = "green",
      }`),
    wrap: { startLine: 2, endLine: 4, options: {} },
    rationale: "Every member has an explicit value, so reordering changes no value.",
  },
  {
    id: "yaml-version-list",
    category: "wrap",
    prompt: "Keep the supported versions sorted from oldest to newest.",
    file: "ci/matrix.yaml",
    input: line(dedent`
      versions:
        - "1.10.0"
        - "1.9.2"
        - "1.2.0"`),
    wrap: { startLine: 2, endLine: 4, options: { numeric: "yes" } },
    rationale: "Lexical order puts 1.10.0 before 1.2.0; numeric=yes is needed.",
  },
  {
    id: "go-functions",
    category: "wrap",
    prompt: "Keep the helper functions in this file in alphabetical order.",
    file: "helpers.go",
    input: line(dedent`
      package helpers

      func Zeta() int {
      	return 2
      }

      // Alpha returns one.
      func Alpha() int {
      	return 1
      }`),
    wrap: { startLine: 3, endLine: 10, options: { block: "yes", newline_separated: "yes" } },
    rationale: "Unindented closing braces need block=yes; blank lines need newline_separated.",
  },
  {
    id: "python-decorated-methods",
    category: "wrap",
    prompt: "Sort the methods of Shape alphabetically.",
    file: "shape.py",
    input: line(dedent`
      class Shape:
          def perimeter(self):
              return sum(self.sides)

          @property
          def area(self):
              return self.w * self.h`),
    wrap: {
      startLine: 2,
      endLine: 7,
      options: { block: "yes", sticky_prefixes: "@", newline_separated: "yes" },
    },
    rationale: "Decorators must stay with their def; blank lines separate methods.",
  },
  {
    id: "express-middleware",
    category: "no-wrap",
    prompt: "Sort the middleware list so it is easier to scan.",
    file: "server.js",
    input: line(dedent`
      app.use([
        session(),
        authenticate(),
        rateLimit(),
      ]);`),
    wrap: null,
    rationale: "authenticate must run after session; sorting would break authentication.",
  },
  {
    id: "css-cascade",
    category: "no-wrap",
    prompt: "Alphabetize the rules in buttons.css.",
    file: "buttons.css",
    input: line(dedent`
      .button { color: black; }
      .button.primary { color: white; }
      .button { padding: 4px; }`),
    wrap: null,
    rationale: "Later rules of equal specificity win; moving rules changes the cascade.",
  },
  {
    id: "positional-arguments",
    category: "no-wrap",
    prompt: "Sort the arguments to createUser.",
    file: "users.py",
    input: line(dedent`
      user = create_user(
          "ada",
          "admin",
          True,
      )`),
    wrap: null,
    rationale: "Positional arguments bind by position; sorting swaps their meaning.",
  },
  {
    id: "rust-derived-ord-fields",
    category: "no-wrap",
    prompt: "Keep the fields of Version sorted.",
    file: "src/version.rs",
    input: line(dedent`
      #[derive(PartialEq, Eq, PartialOrd, Ord)]
      struct Version {
          major: u32,
          minor: u32,
          patch: u32,
      }`),
    wrap: null,
    rationale: "Derived Ord compares fields in declaration order; sorting changes comparisons.",
  },
  {
    id: "preferences-default",
    category: "preferences",
    prompt: "Keep the team list sorted.",
    file: "teams.txt",
    input: line(dedent`
      search
      Billing
      ads`),
    wrap: { startLine: 1, endLine: 3, options: {} },
    rationale: "Without preferences, the block uses keep-sorted's defaults.",
  },
  {
    id: "preferences-case-insensitive",
    category: "preferences",
    prompt: "Keep the team list sorted.",
    file: "teams.txt",
    input: line(dedent`
      search
      Billing
      ads`),
    preferences: { options: { case: "no" } },
    wrap: { startLine: 1, endLine: 3, options: { case: "no" } },
    rationale: "The same list with a case=no preference gets case=no on its start line.",
  },
  {
    id: "preferences-file-glob",
    category: "preferences",
    prompt: "Keep the allowlist sorted.",
    file: "config/allowlist.txt",
    input: line(dedent`
      beta
      alpha
      beta`),
    preferences: { files: { "**/allowlist.txt": { remove_duplicates: "no" } } },
    wrap: { startLine: 1, endLine: 3, options: { remove_duplicates: "no" } },
    rationale: "A file-glob preference keeps the intentional duplicate.",
  },
  {
    id: "wrong-comment-syntax",
    category: "markers",
    prompt: "This block is not being sorted correctly; fix it.",
    file: "deps.py",
    input: line(dedent`
      DEPS = [
          // keep-sorted start
          "b",
          "a",
          // keep-sorted end
      ]`),
    wrap: { startLine: 3, endLine: 4, options: {} },
    repaired: line(dedent`
      DEPS = [
          # keep-sorted start
          "a",
          "b",
          # keep-sorted end
      ]`),
    rationale: "keep-sorted finds the markers, but // is a Python syntax error; use #.",
  },
  {
    id: "unbalanced-marker",
    category: "markers",
    prompt: "Sort this list; the end marker went missing.",
    file: "names.py",
    input: line(dedent`
      NAMES = [
          # keep-sorted start
          "b",
          "a",
      ]`),
    wrap: { startLine: 3, endLine: 4, options: {} },
    repaired: line(dedent`
      NAMES = [
          # keep-sorted start
          "a",
          "b",
          # keep-sorted end
      ]`),
    rationale: "Sorting first would delete the unpaired marker; add the end marker, then sort.",
  },
];
