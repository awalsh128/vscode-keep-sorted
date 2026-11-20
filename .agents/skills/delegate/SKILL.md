---
name: delegate
description: >-
  Decide whether to hand work to a read-only subagent (explorer, researcher, planner, reviewer,
  verifier, docs-reviewer) and write its brief. Use before starting any subagent, when a search,
  research question, test run or review would fill your context, and after finishing a non-trivial
  change.
---

# Delegate

You are the only agent that edits files. Subagents read, run checks and report back.

## When to delegate

Delegate when the work would fill your context with material you don't need to keep: a wide codebase
search, web research, a test run with long output, or a review of your own change.

Don't delegate:

- a task you can finish in a few tool calls;
- anything that edits files;
- work that needs the whole conversation to get right.

Start independent subagents in parallel, in one message.

## Roles

| Role            | Use it to                                                         | Returns                   |
| --------------- | ----------------------------------------------------------------- | ------------------------- |
| `explorer`      | Find where something lives or how it works in this repo           | `<findings>`              |
| `researcher`    | Answer a question from external docs or the web                   | `<findings>` with sources |
| `planner`       | Turn an agreed goal into steps before a large change              | `<plan>`                  |
| `reviewer`      | Check a finished change against the task and repo standards       | `<review>`                |
| `verifier`      | Run targeted tests or linters                                     | `<result>`                |
| `docs-reviewer` | Check README and docs against the code after a user-facing change | findings                  |

## The brief

A subagent sees none of this conversation. Fill in every section:

```markdown
## Goal

<What to find out or check, and why it matters to the task.>

## Context

<Paste what you already have: the diff, the issue text, file paths, error output. Don't make the
subagent rediscover it.>

## Decisions already made

<Choices that are settled, and what is out of scope.>

## Output

<Leave out to get the role's default block. Otherwise: what to add or change.>
```

See [references/example-briefs.md](references/example-briefs.md) for a filled-in brief for each
role.

## Using the result

- Read the tagged block at the end of the reply. If it's missing or malformed, ask once more for the
  block alone.
- Before editing because of a finding, open the cited `file:line` yourself. Subagents can be wrong.
- Carry over only what you need. Don't paste the subagent's whole reply into your notes.

## Review loop

After a non-trivial change:

1. Send `reviewer` the task and the diff (`git diff` output pasted into Context).
2. Fix the findings you agree with, and note any you reject and why.
3. Send `verifier` the files you changed.
4. Stop after two review rounds and report anything still open to the user.
