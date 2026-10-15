# Repository Agent Instructions

Read [AI_GUIDELINES.md](AI_GUIDELINES.md) before making changes. Preserve unrelated working-tree
edits. The documentation policy below applies to every task, not just documentation requests.

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
  [scripts/README.md](scripts/README.md), and architecture in [SOURCE_CODE.md](SOURCE_CODE.md).
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

## Validation

Follow the testing requirements in [AI_GUIDELINES.md](AI_GUIDELINES.md). Code changes require
`npm test`, `npm run lint`, and `npm run compile`; run `npm run test:scripts` when scripts change.
For documentation-only changes, validate examples, links, and configuration syntax; do not claim
that runtime tests were run unless they were.

## Agent Layout

- [CLAUDE.md](CLAUDE.md) imports these shared instructions for Claude Code.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) directs Copilot here.
- [.github/agents/docs-reviewer.agent.md](.github/agents/docs-reviewer.agent.md) is the Copilot
  documentation reviewer.
- [.claude/agents/docs-reviewer.md](.claude/agents/docs-reviewer.md) is its Claude Code counterpart.

Use the documentation reviewer before completing user-facing changes when delegation is available.
Otherwise, perform its review directly. The main agent applies corrections and runs validation; the
reviewers are read-only. Keep policy here rather than duplicating it in tool-specific files.
