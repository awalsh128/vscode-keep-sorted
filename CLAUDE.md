# Claude Code Instructions

@AGENTS.md

Read [AI_GUIDELINES.md](AI_GUIDELINES.md) before editing code. Apply the required documentation
review from the shared instructions before completing every task.

Apply the shared Configuration Synchronization policy whenever settings change, including the
manifest's Settings UI metadata. Keep editor-owned save-action settings separate from extension
configuration.

## Project Subagents

Project subagent definitions live in [.claude/agents](.claude/agents); Claude Code discovers them
from their Markdown frontmatter, so no separate agent registry or permission overrides are needed.
Use `docs-reviewer` for read-only README/code consistency reviews after user-facing changes. Give it
the task scope and changed files; apply its findings in the main conversation.

Do not make the reviewer the default coding agent or grant it write/shell permissions. If the new
agents directory is not discovered in an existing Claude Code session, restart that session.
