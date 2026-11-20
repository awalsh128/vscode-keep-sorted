# Model tiers

Each role in `subagents/` names a tier in its first frontmatter comment. This table maps a tier to
each tool's settings. When you change a mapping, update every role with that tier.

| Tier       | Roles              | Claude Code (`model`, `effort`) | Codex (`model_reasoning_effort`) | Antigravity (`model`) | Copilot       |
| ---------- | ------------------ | ------------------------------- | -------------------------------- | --------------------- | ------------- |
| `fast`     | explorer, verifier | `haiku`, `low`                  | `low`                            | `flash`               | session model |
| `balanced` | researcher         | `sonnet`, `medium`              | `medium`                         | `inherit`             | session model |
| `deep`     | planner, reviewer  | `opus`, `high`                  | `high`                           | `pro`                 | session model |

Codex and Copilot use the session's model, because their model IDs change too often to pin in a
template. To pin one, add `model:` to the role's `codexcli:` or `copilot:` block. Claude Code's
aliases (`haiku`, `sonnet`, `opus`) always point at the latest model of each family.

## Read-only enforcement

Every role is read-only. Each tool enforces that differently:

- **Claude Code, Copilot, Antigravity:** a tool allowlist. Only `reviewer` and `verifier` get a
  shell.
- **Codex:** agent files can't restrict tools or the sandbox, and Codex reads files through the
  shell. The read-only rule lives in each role's prompt.
