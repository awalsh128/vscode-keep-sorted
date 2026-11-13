# Repository Agent Instructions

Read [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) before making changes. Preserve unrelated
working-tree edits. The documentation policy below applies to every task, not just documentation
requests.

## Required Documentation Review

Before completing a change, review [README.md](README.md) against the current implementation. Update
it in the same change when commands, settings, defaults, requirements, installation, platform
support, or user-visible behavior change. If no README update is needed, say why in the completion
summary; do not make cosmetic edits just to satisfy the checklist.

- Verify command IDs, Command Palette entries, settings, and defaults against
  [package.json](package.json) and their registrations/handlers under [src](src).
- Distinguish implemented behavior from planned work. Do not document missing scripts or expose
  programmatic-only commands as Command Palette entries.
- Keep the README concise: a short overview, installation, one representative usage example, save
  behavior, settings, and focused troubleshooting. Remove repetition, stale claims, and promotional
  filler. Do not invent versions, install counts, or test results.
- Explain important limitations, including explicit-save versus Auto Save behavior. Verify
  editor-owned settings against official VS Code documentation when their semantics matter.
- Link to upstream sorting options rather than copying a large example catalog. Keep development and
  publishing details in [CONTRIBUTING.md](CONTRIBUTING.md) or
  [scripts/README.md](scripts/README.md), and architecture in
  [docs/SOURCE_CODE.md](docs/SOURCE_CODE.md).
- Validate changed JSON snippets, command IDs, settings, and local links. Check sorting examples
  with the bundled binary when applicable. Report checks actually run and any unverified claims.

## Configuration Synchronization

When settings or their behavior change, update `contributes.configuration` in
[package.json](package.json), [src/configuration.ts](src/configuration.ts), their regression tests,
and the README together as needed. Verify types, defaults, examples, Settings UI descriptions, and
path-matching/resolution semantics against the implementation; do not add speculative settings. Use
`markdownDescription` for formatted setting help and setting links, and retain stable ordering.

Sort-on-save uses VS Code's `editor.codeActionsOnSave` entry `source.fixAll.keepSorted`, not an
extension-owned boolean. Do not redefine editor-owned settings under `contributes.configuration` or
silently opt users in through `configurationDefaults`. Document `"explicit"`, `"always"`, and
`"never"` semantics, including the after-delay Auto Save limitation, using official VS Code sources.

## Code Reuse and Conventions

Before adding a helper, constant, or settings read, search for an existing one and extend it rather
than adding a parallel version. Each concern has one owning module:

- Settings, including editor-owned ones such as `files.exclude`:
  [src/configuration.ts](src/configuration.ts). Other modules call its accessors; `npm run check`
  fails on `getConfiguration()` anywhere else. Editor-owned settings get accessors there but stay
  out of `KeepSortedConfiguration`.
- Directive text and option parsing, including `hasDirectives()` and option validation:
  [src/keepsortedopt.ts](src/keepsortedopt.ts).
- Running the keep-sorted binary: [src/keepsortedbin.ts](src/keepsortedbin.ts) (no `vscode` import),
  adapted to documents and diagnostics by [src/keepsorted.ts](src/keepsorted.ts).
- Helpers shared with the MCP server, such as `oneLine`, `dedent`, `errorMessage`, and
  `writeFileAtomic`: [src/common.ts](src/common.ts). `keep-sorted.exclude` matching:
  [src/exclusion.ts](src/exclusion.ts).
- AI agent features: [src/ai/](src/ai). `tools.ts` defines the tools once for both front ends,
  `lmtools.ts` (VS Code) and `mcp.ts` (MCP server). Modules the MCP server bundles must not import
  `vscode`.
- Writing diagnostics: `EditFactory` in [src/workspace.ts](src/workspace.ts).
- Logging: [src/instrumentation.ts](src/instrumentation.ts).

Match the surrounding code's documentation and structure, following the Documentation section of
[docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md). Compare new code with a neighbor in the same module
before finishing.

## Commit Messages

Write [Conventional Commits](https://www.conventionalcommits.org/): semantic-release derives the
next version and release notes from them, and the `commit-msg` hook rejects other messages. Use
`fix:` and `feat:` only for changes users of the extension see, since they trigger a release; use
`docs:`, `ci:`, `chore:`, `refactor:`, `test:`, or `build:` otherwise. Mark breaking changes with
`!` or a `BREAKING CHANGE:` footer. Releases use even minor versions and pre-releases odd ones, so
`feat` commits ship as a pre-release before a release (see the Publishing section of
[CONTRIBUTING.md](CONTRIBUTING.md#publishing)).

## Validation

Follow the testing requirements in [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md). Code changes
require `npm test`, `npm run lint`, `npm run compile`, and `npm run check`; run
`npm run test:scripts` when scripts change. For documentation-only changes, validate examples,
links, and configuration syntax; do not claim that runtime tests were run unless they were.

## User-Facing Agent Docs

[docs/ai/](docs/ai) ships in the VSIX for agents helping users of the extension; the tools return
it. Keep contributor policy out of it, and keep it out of this file. `npm run gen:ai` regenerates
its generated parts, and the AI parts of `package.json`.

## Agent Layout

- [CLAUDE.md](CLAUDE.md) imports these shared instructions for Claude Code.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) directs Copilot here.
- [.github/agents/docs-reviewer.agent.md](.github/agents/docs-reviewer.agent.md) is the Copilot
  documentation reviewer.
- [.claude/agents/docs-reviewer.md](.claude/agents/docs-reviewer.md) is its Claude Code counterpart.

Use the documentation reviewer before completing user-facing changes when delegation is available.
Otherwise, perform its review directly. The main agent applies corrections and runs validation; the
reviewers are read-only. Keep policy here rather than duplicating it in tool-specific files.
