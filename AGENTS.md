# Repository Agent Instructions

Read [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) before changing code. Preserve unrelated
working-tree edits. Every task, not only documentation requests, ends with the review below.

## Required Documentation Review

Before completing a change, review [README.md](README.md) against the implementation. Update it in
the same change when commands, settings, defaults, requirements, installation, platform support, or
user-visible behavior change; otherwise state in the completion summary why no update is needed.

- Verify command IDs, Command Palette entries, settings, and defaults against
  [package.json](package.json) and their registrations and handlers under [src](src). Commands only
  code reaches, such as quick-fix targets, stay undeclared and out of the palette.
- Document implemented behavior only; leave planned work and missing scripts out.
- Keep the README to a short overview, installation, one representative usage example, save
  behavior, settings, and focused troubleshooting. Cut repetition, stale claims, and promotional
  filler. Report only versions, install counts, and test results you observed.
- State limitations, including explicit-save versus Auto Save behavior, and verify editor-owned
  settings against official VS Code documentation when their semantics matter.
- Link to upstream sorting options instead of copying a catalog. Contributor and publishing details
  belong in [CONTRIBUTING.md](CONTRIBUTING.md) or [scripts/README.md](scripts/README.md), and
  architecture in [docs/SOURCE_CODE.md](docs/SOURCE_CODE.md).
- Check changed JSON snippets, command IDs, settings, and local links; run sorting examples through
  the bundled binary. Report the checks you ran and any claim left unverified.

Before completing a user-facing change, run the `docs-reviewer` agent; without delegation, perform
its review directly. The main agent applies corrections and runs validation.

## Configuration Synchronization

When settings or their behavior change, update together `contributes.configuration` in
[package.json](package.json), [src/configuration.ts](src/configuration.ts), the regression tests,
and the README. Verify types, defaults, examples, Settings UI descriptions, and path matching
against the implementation, and add only settings that exist. Write formatted setting help and
setting links as `markdownDescription`, and keep the ordering stable.

Sort-on-save is VS Code's `editor.codeActionsOnSave` entry `source.fixAll.keepSorted`, an
editor-owned setting. Keep it out of `contributes.configuration` and `configurationDefaults`, so
users opt in themselves. Document `"explicit"`, `"always"`, and `"never"`, including the after-delay
Auto Save limitation, from official VS Code sources.

## Code Reuse and Conventions

Search for an existing helper, constant, or settings read before adding one, and extend it. Each
concern has one owning module:

- Settings, editor-owned ones such as `files.exclude` included, and writes to them:
  [src/configuration.ts](src/configuration.ts). Other modules call its accessors; `npm run check`
  fails on `getConfiguration()` elsewhere. Editor-owned settings get accessors there and stay out of
  `KeepSortedConfiguration`.
- Directive text and option parsing, including `hasDirectives()` and option validation:
  [src/keepsortedopt.ts](src/keepsortedopt.ts).
- Running the keep-sorted binary: [src/keepsortedbin.ts](src/keepsortedbin.ts) (no `vscode` import),
  adapted to documents and diagnostics by [src/keepsorted.ts](src/keepsorted.ts).
- Helpers shared with the MCP server (`oneLine`, `dedent`, `errorMessage`, `writeFileAtomic`):
  [src/common.ts](src/common.ts). `keep-sorted.exclude` matching and patterns:
  [src/exclusion.ts](src/exclusion.ts).
- AI agent features: [src/ai/](src/ai). `tools.ts` defines the tools once for both front ends,
  `lmtools.ts` (VS Code) and `mcp.ts` (MCP server). Modules the MCP server bundles import no
  `vscode`.
- Writing diagnostics: `EditFactory` in [src/workspace.ts](src/workspace.ts).
- Logging: [src/instrumentation.ts](src/instrumentation.ts).

Match the surrounding code's documentation and structure, following the Documentation section of
[docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md), and compare new code with a neighbor in the same
module before finishing.

## Commits and Pull Requests

Write [Conventional Commits](https://www.conventionalcommits.org/): semantic-release derives the
version and release notes from them, and the `commit-msg` hook rejects other messages. Use `fix:`
and `feat:` for changes users of the extension see, since they trigger a release, and `docs:`,
`ci:`, `chore:`, `refactor:`, `test:`, or `build:` for the rest. Mark breaking changes with `!` or a
`BREAKING CHANGE:` footer; new settings, commands, and quick fixes that leave existing ones working
are not breaking. Releases use even minor versions and pre-releases odd ones, so `feat` commits ship
as a pre-release first ([Publishing](CONTRIBUTING.md#publishing)).

Open pull requests against `staging` from a branch cut from `origin/staging`
([Branches](CONTRIBUTING.md#branches)); `main` only receives promoted `staging` commits. Confirm the
base with `git ls-remote --heads origin staging main` and pass `--base staging` to `gh pr create`; a
tool's "main branch" hint is not the repository's flow. Pull requests are squash-merged, so the
title is the Conventional Commit.

## Validation

Follow the testing requirements in [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md). Code changes
require `npm test`, `npm run lint`, `npm run compile`, and `npm run check`; scripts changes also
require `npm run test:scripts`. A `Cannot find module` error after pulling usually means stale
`node_modules`: run `npm ci`. Format only the files you changed (`npx prettier --write <files>`); a
glob reformats unrelated files. Documentation-only changes need validated examples, links, and
configuration syntax, and a summary that claims only the tests you ran.

## Subagents

You are the only agent that edits files; subagents read and report. Read the `delegate` skill before
starting one, and use `progress-notes` for work that spans sessions.

## Single Source for AI Tools

- Instructions: this file only. `CLAUDE.md`, `.gemini/settings.json`, and
  `.github/copilot-instructions.md` point here and hold no rules of their own.
- Skills: [.agents/skills](.agents/skills) only; `.claude/skills` and `.github/skills` are symlinks.
- Roles, `docs-reviewer` included: [.rulesync/subagents](.rulesync/subagents) only. Every other role
  directory is generated; run `npx -y rulesync@43.4.1 generate` and commit the result (the Agent
  Config workflow checks it with the same version).
- Third-party skills and plugins: install them for the repo, so every clone has them (see
  [agentic config](https://github.com/awalsh128/gh-dev-powerpack/blob/main/docs/agentic-config.md)).
- [.out-of-scope](.out-of-scope) lists rejected ideas; check it before proposing a feature.

## User-Facing Agent Docs

[docs/ai/](docs/ai) ships in the VSIX for agents helping users of the extension, and the tools
return it. It holds no contributor policy, and this file holds none of it. `npm run gen:ai`
regenerates its generated parts and the AI parts of `package.json`.
