<p align="center">
  <img src="images/logo.png" alt="Keep Sorted logo" width="128" height="128">
</p>

<h1 align="center">VSCode Keep Sorted</h1>

<p align="center">
  Keep marked blocks sorted in any language with
  <a href="https://github.com/google/keep-sorted">Google's keep-sorted</a>.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=awalsh128.keep-sorted"><img src="https://badgen.net/vs-marketplace/v/awalsh128.keep-sorted?label=Marketplace" alt="Marketplace version"></a>
  <a href="https://open-vsx.org/extension/awalsh128/keep-sorted"><img src="https://img.shields.io/open-vsx/v/awalsh128/keep-sorted?label=Open%20VSX" alt="Open VSX version"></a>
  <a href="https://open-vsx.org/extension/awalsh128/keep-sorted"><img src="https://img.shields.io/open-vsx/dt/awalsh128/keep-sorted?label=Open%20VSX%20downloads" alt="Open VSX downloads"></a>
  <a href="https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/ci.yml"><img src="https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/awalsh128/vscode-keep-sorted/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="Apache 2.0 license"></a>
</p>

<!-- prettier-ignore -->
> [!TIP]
> If you find this project useful, please consider supporting it
> [as a sponsor and show some ❤️ for open source maintainers](https://github.com/sponsors/awalsh128).

Content outside the `keep-sorted start` and `keep-sorted end` markers is left unchanged.

- :warning: Warnings for unsorted blocks as you open, edit, and save files.
- :bulb: Quick fixes and commands to sort the current file or every file with Keep Sorted warnings.
- :floppy_disk: Optional sorting on save through a source fix-all action.
- :information_source: Autocomplete and hover documentation for options on `keep-sorted start`
  lines.

---

[Demo](https://github.com/user-attachments/assets/87cce237-4214-4047-a5c4-b6a4162245d2)

## Installation

Install Keep Sorted from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=awalsh128.keep-sorted)
or [Open VSX Registry](https://open-vsx.org/extension/awalsh128/keep-sorted). Requires VS Code
1.100.0 or newer. Native binaries are bundled for Windows x64, Linux x64, and macOS Intel/Apple
Silicon; no separate keep-sorted installation is needed.

## Usage

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

Sort the file using either:

- **Command Palette**: Run **Keep Sorted: Sort Current File**.
- **Quick Fix**: Place the cursor in a warned block, press `Ctrl+.` / `Cmd+.`, and choose **Sort all
  lines in file (keep-sorted)**. Quick fixes are also available in the Problems panel.

Both sort all keep-sorted blocks in the file, not just the selected block. The example becomes:

```python
items = [
    # keep-sorted start
    'alpha',
    'delta',
    'zebra',
    # keep-sorted end
]
```

To sort every file with Keep Sorted problems at once, run **Keep Sorted: Sort All Files with
Problems**, or choose **Sort all files with problems (keep-sorted)** from a quick fix when other
files also have warnings. This covers workspace files scanned at startup (respecting `files.exclude`
and `keep-sorted.exclude`) plus files opened or edited since. All changes are applied as one edit;
review them, then use **File → Save All**.

For keybindings or automation, use command IDs `keep-sorted.fixFile` and `keep-sorted.fixWorkspace`.
The former `keep-sorted.sortFile` alias has been removed; update existing keybindings to
`keep-sorted.fixFile`. Sorting rechecks diagnostics for each sorted file, so resolved Keep Sorted
warnings disappear from Problems while any remaining issues stay visible.

### Sort on Save

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

### Sorting Options

Add options after `start`; autocomplete suggests option names with documentation tooltips, then
known values such as `yes`/`no` or `order=asc|desc` after `=`. Options that conflict with ones
already on the line, such as `by_regex` and `ignore_prefixes`, are not suggested. Hover over an
option to see its documentation. For example:

```python
items = [
    # keep-sorted start case=no numeric=yes
    'item_10',
    'Item_2',
    'item_1',
    # keep-sorted end
]
```

Common options include `case=no`, `numeric=yes`, `block=yes` for multi-line entries, `skip_lines=N`
for headers, and `remove_duplicates=no` to preserve duplicates. See the
[upstream options reference](https://github.com/google/keep-sorted#options) for full syntax and
examples.

## Settings

| Setting                    | Default | Description                                                             |
| -------------------------- | ------- | ----------------------------------------------------------------------- |
| `keep-sorted.enabled`      | `true`  | Enable diagnostics, sorting commands, and code actions.                 |
| `keep-sorted.autoComplete` | `true`  | Suggest option names and values after `start`, with documentation.      |
| `keep-sorted.exclude`      | `[]`    | Exclude files from diagnostics and sorting; regex first, glob fallback. |
| `keep-sorted.logFilepath`  | `""`    | Add file logging alongside Output; empty disables file logging.         |

Sort-on-save is configured separately through VS Code's `editor.codeActionsOnSave`, as shown above;
it is not enabled by default or controlled by an additional `keep-sorted` setting.

Example exclusions:

```json
{
  "keep-sorted.exclude": ["**/node_modules/**", "**/dist/**", "**/*.min.js"]
}
```

Exclusions are checked against workspace-relative paths, absolute paths, and file names. Patterns
are interpreted as regex first, falling back to glob matching when the regex is invalid.

Log paths are joined to the first workspace folder when one is open; otherwise, the configured path
is normalized and used directly. Prefer a workspace-relative path such as `logs/keep-sorted.log`.

## Troubleshooting

- **No warnings or sorting:** Check `keep-sorted.enabled`, exclusion patterns, and matching
  `keep-sorted start` / `keep-sorted end` markers. Reload the VS Code window if commands are
  missing.
- **Save does not sort:** Configure `source.fixAll.keepSorted` as above; format-on-save alone does
  not invoke this extension.
- **Sorting breaks syntax:** Keep declarations and surrounding brackets outside the markers, as in
  the list example. Use upstream options to group multi-line entries when needed.
- **Errors or unexpected results:** Open **View → Output** and select **Keep Sorted**. Set
  `keep-sorted.logFilepath` to retain logs in a file.

Report bugs or request features through
[GitHub Issues](https://github.com/awalsh128/vscode-keep-sorted/issues). For development and
publishing, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache 2.0](LICENSE.md).
