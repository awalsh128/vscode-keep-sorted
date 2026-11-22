<p align="center">
  <img src="images/logo.png" alt="Keep Sorted logo" width="128" height="128">
</p>

<h1 align="center">Keep Sorted</h1>

<p align="center">
  Keep marked blocks sorted in any language with
  <a href="https://github.com/google/keep-sorted">Google's keep-sorted</a>.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=awalsh128.keep-sorted"><img src="https://vsmarketplacebadges.dev/version/awalsh128.keep-sorted.svg?label=Version&color=%2314b8a6" alt="Version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=awalsh128.keep-sorted"><img src="https://vsmarketplacebadges.dev/downloads/awalsh128.keep-sorted.svg?label=Marketplace%20downloads&color=blueviolet" alt="Marketplace downloads"></a>
  <a href="https://open-vsx.org/extension/awalsh128/keep-sorted"><img src="https://img.shields.io/open-vsx/dt/awalsh128/keep-sorted?label=Open%20VSX%20downloads&color=blueviolet" alt="Open VSX downloads"></a>
  <a href="https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/ci.yml"><img src="https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/awalsh128/vscode-keep-sorted/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
</p>

Keep Sorted is a VS Code extension that warns about unsorted blocks marked with
[keep-sorted](https://github.com/google/keep-sorted) directives and sorts them in any language.
Content outside the blocks is left unchanged.

- ⚠️ Warnings for unsorted blocks across the workspace and as you open, edit, and save files.
- 💡 Quick fixes and commands to sort the current file or every file with Keep Sorted warnings.
- 💾 Optional sorting on save through a source fix-all action.
- ℹ️ Autocomplete and hover documentation for options on a block's start line.
- 🤖 [AI agent](docs/AI_AGENTS.md) integration through an MCP server and Copilot tools, so agents
  know when to add blocks and which options to use.

Place the cursor on a warning, open the quick fix, and the block sorts:

<p align="center">
  <img src="media/demo/sort-quick-fix.gif" alt="A warning on an unsorted block, then the Sort all lines quick fix reorders the entries and the warning clears" width="800">
</p>

More demos are in the
[demo gallery](https://github.com/awalsh128/vscode-keep-sorted/blob/main/docs/demos.md).

<!-- prettier-ignore -->
<p align="center">
  <a href="https://github.com/sponsors/awalsh128"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor"></a>
</p>

<p align="center">
  If you find this project useful, please consider
  <a href="https://github.com/sponsors/awalsh128">sponsoring it</a> and show some ❤️ for open source
  maintainers.
</p>

## Quick Start

Requires VS Code 1.100.0 or newer. Native binaries are bundled for Windows x64, Linux x64, and macOS
Intel/Apple Silicon; no separate keep-sorted installation is needed.

- **VS Code:** search for "Keep Sorted" in Extensions, or run
  `code --install-extension awalsh128.keep-sorted` (see the
  [Marketplace](https://marketplace.visualstudio.com/items?itemName=awalsh128.keep-sorted)).
- **Cursor, VSCodium, Windsurf, and other forks:** search for "Keep Sorted" in Extensions, which
  reads the [Open VSX Registry](https://open-vsx.org/extension/awalsh128/keep-sorted), or run
  `cursor --install-extension awalsh128.keep-sorted` or
  `codium --install-extension awalsh128.keep-sorted`. The Copilot tools register through a VS Code
  API and are untested in forks; use the MCP server there.

Place markers around only the lines that should move. Use your language's comment syntax:

```python
items = [
    # keep-sorted start
    'zebra',
    'alpha',
    'delta',
    # keep-sorted end
]
```

Unsorted blocks show a warning. Sort the file using any of:

- **Command Palette**: Run **Keep Sorted: Sort Current File**.
- **Quick Fix**: Place the cursor in a warned block, press `Ctrl+.` / `Cmd+.`, and choose **Sort all
  lines in file (keep-sorted)**. Quick fixes are also available in the Problems panel.
- **Source Action**: Run **Source Action...** or **Fix All** from anywhere in the file; the cursor
  does not need to be in a warned block.

Each sorts all keep-sorted blocks in the file, not just the selected block. The example becomes:

```python
items = [
    # keep-sorted start
    'alpha',
    'delta',
    'zebra',
    # keep-sorted end
]
```

Sorting rechecks diagnostics for each sorted file, so resolved Keep Sorted warnings disappear from
Problems while any remaining issues stay visible.

### Sort on Save

With the action enabled, an explicit save sorts the file, so a new entry lands in place:

<img src="media/demo/sort-on-save.gif" alt="Typing a new entry at the end of a block, then saving sorts it between the existing entries" width="800">

Add this to your VS Code user or workspace settings:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.keepSorted": "explicit"
  }
}
```

- `"explicit"`: Sort on an explicit save, such as `Ctrl+S` / `Cmd+S`.
- `"always"`: Also sort on Auto Save triggered by focus or window changes, but not after-delay Auto
  Save.
- `"never"`: Disable the save action.

VS Code also accepts `true` for `"explicit"` and `false` for `"never"` for compatibility. The
extension must be enabled and the file must not be excluded. Without this action, saving refreshes
diagnostics but does not sort. `editor.formatOnSave` is not required.

## AI Agents

Keep Sorted gives AI coding agents guidance that matches the installed version, and tools to add and
sort blocks (`keepSorted_getGuide`, `keepSorted_getPreferences`, `keepSorted_wrapRange`,
`keepSorted_run`). GitHub Copilot agent mode can use them without setup. For other agents, run
**Keep Sorted: Add AI Instructions to Workspace** (`keep-sorted.addAiInstructions`) to add an
AGENTS.md section, an agent skill, or an MCP server (needs Node.js on `PATH`). Review the diff of
every block an agent adds, since sorting order-dependent code changes behavior. See
[AI agents](docs/AI_AGENTS.md) for the tools, setup choices, and `keep-sorted.wrap.preferences`.

## Commands

| Command                                           | ID                              | What it does                                                                                                         |
| ------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Keep Sorted: Sort Current File**                | `keep-sorted.fixFile`           | Sorts every block in the current file.                                                                               |
| **Keep Sorted: Sort All Files with Problems**     | `keep-sorted.fixWorkspace`      | Sorts every file with warnings in one edit; see [sorting across files](docs/ADVANCED_USAGE.md#sorting-across-files). |
| **Keep Sorted: Add AI Instructions to Workspace** | `keep-sorted.addAiInstructions` | Sets up agent instructions and the MCP server; see [AI agents](docs/AI_AGENTS.md).                                   |

Bind the IDs in `keybindings.json`; see [keybindings](docs/ADVANCED_USAGE.md#keybindings).

## Settings

| Setting                        | Default | Description                                                                       |
| ------------------------------ | ------- | --------------------------------------------------------------------------------- |
| `keep-sorted.enabled`          | `true`  | Enable diagnostics, sorting commands, and code actions.                           |
| `keep-sorted.autoComplete`     | `true`  | Suggest option names and values after `start`, with documentation.                |
| `keep-sorted.exclude`          | `[]`    | Exclude files from diagnostics and sorting; regex first, glob fallback.           |
| `keep-sorted.logFilepath`      | `""`    | Add file logging alongside Output; empty disables file logging.                   |
| `keep-sorted.wrap.preferences` | `{}`    | Default options AI agents use for new blocks; see [AI agents](docs/AI_AGENTS.md). |

Sort-on-save is configured separately through VS Code's `editor.codeActionsOnSave`, as shown above;
it is not enabled by default or controlled by an additional `keep-sorted` setting.

Example exclusions:

```json
{
  "keep-sorted.exclude": ["**/node_modules/**", "**/dist/**", "**/*.min.js"]
}
```

To exclude a file you are looking at, open the lightbulb (`Ctrl+.` / `Cmd+.`) on one of its warnings
and choose **Exclude this file (keep-sorted)**. It adds an exact-match pattern such as
`^src/generated/api\.ts$` to `keep-sorted.exclude` in your workspace settings, or your user settings
when no folder is open, and the file's warnings clear. This is a quick fix only: it is not a Command
Palette command and is not part of sort on save. To undo it, remove the pattern from the setting.

Some warnings cannot be fixed by sorting, such as a `keep-sorted start` with no matching `end`
(often prose or a JSON string that mentions the directive). For those, only the exclude quick fix is
offered, and it is the preferred one.

Exclusions are checked against workspace-relative paths, absolute paths, and file names. Patterns
are interpreted as regex first, falling back to glob matching when the regex is invalid. Changes
apply immediately: newly excluded files lose their warnings, and newly included files are checked.

Log paths are joined to the first workspace folder when one is open; otherwise, the configured path
is normalized and used directly. Prefer a workspace-relative path such as `logs/keep-sorted.log`.

## More Documentation

- [Advanced Usage](docs/ADVANCED_USAGE.md): sorting options, multi-line entries, headers and
  comments, custom sort keys, order and duplicates, sorting across files, and keybindings.
- [Continuous Integration](docs/CONTINUOUS_INTEGRATION.md): lint and fix workflows that match the
  bundled keep-sorted version.
- [Language Specific Solutions](docs/LANGUAGE_SPECIFIC_SOLUTIONS.md): formatters that already sort
  imports and may be a better fit.

## Troubleshooting

- **No warnings or sorting:** Check `keep-sorted.enabled`, exclusion patterns, and that every start
  marker has a matching end marker. keep-sorted treats any line containing the start marker as a
  block start, even in prose or comments. Unopened files over 1 MB or matched by `files.exclude` or
  `search.exclude` are only checked once opened. Reload the VS Code window if commands are missing.
- **Save does not sort:** Configure `source.fixAll.keepSorted` as above; format-on-save alone does
  not invoke this extension.
- **Sorting breaks syntax:** Keep declarations and surrounding brackets outside the markers, as in
  the list example. Use `block=yes` for multi-line entries (see
  [Multi-line Entries](docs/ADVANCED_USAGE.md#multi-line-entries)).
- **Errors or unexpected results:** Open **View → Output** and select **Keep Sorted**. For more
  detail, run **Developer: Set Log Level...**, choose **Keep Sorted**, and select **Trace**. Set
  `keep-sorted.logFilepath` to retain logs in a file.

Report bugs or request features through
[GitHub Issues](https://github.com/awalsh128/vscode-keep-sorted/issues). For development and
publishing, see [CONTRIBUTING.md](CONTRIBUTING.md).
