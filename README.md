<p align="center">
  <img src="images/logo.png" alt="Keep Sorted logo" width="128" height="128">
</p>

<h1 align="center">VSCode Keep Sorted</h1>

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

<!-- prettier-ignore -->
> [!TIP]
> If you find this project useful, please consider supporting it
> [as a sponsor and show some ❤️ for open source maintainers](https://github.com/sponsors/awalsh128).

Content outside keep-sorted blocks is left unchanged.

- :warning: Warnings for unsorted blocks across the workspace and as you open, edit, and save files.
- :bulb: Quick fixes and commands to sort the current file or every file with Keep Sorted warnings.
- :floppy_disk: Optional sorting on save through a source fix-all action.
- :information_source: Autocomplete and hover documentation for options on a block's start line.

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

Sort the file using any of:

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

To sort every file with Keep Sorted problems at once, run **Keep Sorted: Sort All Files with
Problems**, or choose **Sort all files with problems (keep-sorted)** from a quick fix when other
files also have warnings. This covers files found by the background scan at startup plus files
opened or edited since. The scan respects `files.exclude`, `search.exclude` (which skips
`node_modules` by default), and `keep-sorted.exclude`, and skips files over 1 MB unless they are
open. All changes are applied as one edit; review them, then use **File → Save All**.

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
are interpreted as regex first, falling back to glob matching when the regex is invalid. Changes
apply immediately: newly excluded files lose their warnings, and newly included files are checked.

Log paths are joined to the first workspace folder when one is open; otherwise, the configured path
is normalized and used directly. Prefer a workspace-relative path such as `logs/keep-sorted.log`.

## Continuous Integration

The extension is an editor front end for keep-sorted and adds no sorting rules of its own, so CI
should run the [keep-sorted CLI](https://github.com/google/keep-sorted#usage) directly. Pin the same
version the extension bundles (e.g.`v0.10.0`) so CI and the editor agree.

In lint mode, keep-sorted exits with status 1 when any block is unsorted. This workflow fails the
check:

```yaml
name: keep-sorted
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-go@v6
        with:
          go-version: stable
      - run: go install github.com/google/keep-sorted@v0.10.0
      - run: git ls-files -z | xargs -0 -r keep-sorted --mode lint
```

To sort instead and commit the result, run the default fix mode, which rewrites files in place, and
commit any changes:

```yaml
name: keep-sorted
on:
  push:
    branches-ignore: [main]

permissions:
  contents: write

jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-go@v6
        with:
          go-version: stable
      - run: go install github.com/google/keep-sorted@v0.10.0
      - run: git ls-files -z | xargs -0 -r keep-sorted
      - run: |
          git diff --quiet && exit 0
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -am "Sort keep-sorted blocks"
          git push
```

Pushes made with the default `GITHUB_TOKEN` do not start new workflow runs, and the fix workflow
cannot push to pull requests from forks; use the lint workflow to check those. For local hooks, see
upstream's [pre-commit configuration](https://github.com/google/keep-sorted#pre-commit).

## Language Specific Solutions

Many language formatters and linters already perform sorting implicitly and automatically. Prefer
these as they have syntactic awareness and don't usually require inline code directives as comments.
Keep in mind that only some syntax is supported (e.g. import statements) and `keep-sorted` may still
be a viable option (e.g. lists, class ordering).

- **C/C++:** [clang-format](https://clang.llvm.org/docs/ClangFormatStyleOptions.html#sortincludes)
  `SortIncludes`
- **C#:** [dotnet format](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-format)
- **Go:** [gofmt](https://pkg.go.dev/cmd/gofmt) or
  [goimports](https://pkg.go.dev/golang.org/x/tools/cmd/goimports)
- **Java:** [google-java-format](https://github.com/google/google-java-format)
- **JavaScript/TypeScript:**
  [eslint-plugin-simple-import-sort](https://www.npmjs.com/package/eslint-plugin-simple-import-sort)
  or VS Code's
  [Organize Imports](https://code.visualstudio.com/docs/languages/typescript#_organize-imports)
- **Kotlin:** [ktlint](https://ktlint.github.io/ktlint/latest/rules/standard/#import-ordering)
  `import-ordering`
- **Python:** [Ruff](https://docs.astral.sh/ruff/rules/#isort-i) `I` rules or
  [isort](https://pycqa.github.io/isort/)
- **Rust:** [rustfmt](https://rust-lang.github.io/rustfmt/#reorder_imports) `reorder_imports`
- **Swift:**
  [swift-format](https://github.com/swiftlang/swift-format/blob/main/Documentation/RuleDocumentation.md#orderedimports)
  `OrderedImports`

## Troubleshooting

- **No warnings or sorting:** Check `keep-sorted.enabled`, exclusion patterns, and that every start
  marker has a matching end marker. keep-sorted treats any line containing the start marker as a
  block start, even in prose or comments. Unopened files over 1 MB or matched by `files.exclude` or
  `search.exclude` are only checked once opened. Reload the VS Code window if commands are missing.
- **Save does not sort:** Configure `source.fixAll.keepSorted` as above; format-on-save alone does
  not invoke this extension.
- **Sorting breaks syntax:** Keep declarations and surrounding brackets outside the markers, as in
  the list example. Use upstream options to group multi-line entries when needed.
- **Errors or unexpected results:** Open **View → Output** and select **Keep Sorted**. For more
  detail, run **Developer: Set Log Level...**, choose **Keep Sorted**, and select **Trace**. Set
  `keep-sorted.logFilepath` to retain logs in a file.

Report bugs or request features through
[GitHub Issues](https://github.com/awalsh128/vscode-keep-sorted/issues). For development and
publishing, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache 2.0](LICENSE.md).
