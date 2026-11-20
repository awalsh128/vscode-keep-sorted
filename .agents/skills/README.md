# Skills

One folder per skill, following the [Agent Skills spec](https://agentskills.io/specification):
`<name>/SKILL.md`, plus optional `scripts/`, `references/` and `assets/`. The folder name must match
the skill's `name`.

Add skills only here; `AGENTS.md` explains how every tool finds them.

Agents load only a skill's `name` and `description` at startup and read the body when the skill is
used. Write the description as "what it does + when to use it". Keep `SKILL.md` under 500 lines and
move detail to `references/`, one level deep.
