# AI Agents

Keep Sorted gives AI coding agents guidance that matches the installed version, and tools that add
and sort blocks:

| Tool                        | What it does                                                                  |
| --------------------------- | ----------------------------------------------------------------------------- |
| `keepSorted_getGuide`       | Returns guidance: what not to wrap, options by content type, comment syntax.  |
| `keepSorted_getPreferences` | Returns `keep-sorted.wrap.preferences`, optionally resolved for a file.       |
| `keepSorted_wrapRange`      | Adds markers around lines, using the file's comment syntax and your defaults. |
| `keepSorted_run`            | Sorts a file or the workspace and returns the problems that remain.           |

GitHub Copilot agent mode can use the tools without setup; VS Code asks before running the ones that
change files. For other agents, run **Keep Sorted: Add AI Instructions to Workspace**
(`keep-sorted.addAiInstructions`) and choose what to set up. Each file change is shown as a diff and
written only after you confirm:

- **AGENTS.md section** and **agent skill** (`.claude/skills/keep-sorted/SKILL.md`, read by Claude
  Code and Copilot): short workspace instructions, safe to commit.
- **MCP server** for Claude Code (types a `claude mcp add --scope user` command into a terminal for
  you to run), Cursor (`~/.cursor/mcp.json`), or any MCP client (copies the configuration). The
  server needs Node.js on `PATH`. It is installed in the extension's storage and updated with the
  extension, works on saved files under the project root, skips files `keep-sorted.exclude` matches,
  and refuses files with unsaved changes in VS Code.

Set default options for blocks that agents add with `keep-sorted.wrap.preferences`. Layers apply in
order (`options`, then `languages`, then matching `files` globs), and `null` removes an earlier
value:

```json
{
  "keep-sorted.wrap.preferences": {
    "options": { "case": "no" },
    "languages": { "go": { "block": "yes", "newline_separated": "yes" } },
    "files": { "**/requirements*.txt": { "remove_duplicates": "no" } }
  }
}
```

The tools refuse files without comments (JSON), ranges that cross another block, and invalid
options, but they cannot tell whether an order matters. Review the diff of every block an agent
adds: sorting middleware, CSS rules, or other order-dependent code changes behavior.
