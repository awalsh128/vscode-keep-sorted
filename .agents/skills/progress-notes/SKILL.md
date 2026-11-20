---
name: progress-notes
description: >-
  Keep a progress notes file for a task that spans several sessions, context compactions or many
  steps. Use when starting such a task, after each milestone, before context runs low, and when
  resuming work to learn where things stand.
---

# Progress notes

Your context window will be compacted or cleared before a long task ends. These notes are what the
next session, or you after compaction, starts from.

## Where

`.agents/notes/<task>.md`, where `<task>` is the branch name with `/` replaced by `-`. Git ignores
the folder, so the notes are local working state. Durable decisions belong in commits and docs.

## Format

Keep the file under about 60 lines. Rewrite it rather than appending to it.

```markdown
# <Task in one line>

## Goal

<What done looks like, including how it will be checked.>

## Decisions

- <Decision>: <why>. Settled; don't revisit without new information.

## Done

- <Milestone> (<commit sha>)

## Next

1. <The next concrete step: file, function, command.>

## Open questions

- <What is blocked, and on whom.>
```

## When

- **Starting:** create the file once the goal is clear.
- **After each milestone:** update Done and Next, and commit the code. Put "Next: <step>" as the
  last line of the commit message, so `git log` tells the same story.
- **Before context runs low:** update the file before you lose what you'd need.
- **Resuming:** read this file, then `git log --oneline -10`. Trust them over your memory of the
  task.
- **Finishing:** move decisions worth keeping into the PR description or project docs, then delete
  the file.
