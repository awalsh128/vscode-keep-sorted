# Advanced Usage

The examples below show the result after sorting. See the
[upstream options reference](https://github.com/google/keep-sorted#options) for every option and its
full syntax.

## Sorting Options

Add options after `start`; autocomplete (`keep-sorted.autoComplete`) suggests option names with
documentation tooltips, then known values such as `yes`/`no` or `order=asc|desc` after `=`. Options
that conflict with ones already on the line, such as `by_regex` and `ignore_prefixes`, are not
suggested. Hover over an option to see its documentation.

`case=no` ignores case and `numeric=yes` compares embedded numbers by value, so `'item_10'`,
`'Item_2'`, `'item_1'` becomes:

```python
items = [
    # keep-sorted start case=no numeric=yes
    'item_1',
    'Item_2',
    'item_10',
    # keep-sorted end
]
```

## Multi-line Entries

`block=yes` keeps each entry's continuation lines with it, so nested literals move as a unit:

```go
var handlers = map[string]Handler{
	// keep-sorted start block=yes
	"auth": {
		Path: "/auth",
	},
	"users": {
		Path: "/users",
	},
	// keep-sorted end
}
```

## Headers and Comments

`skip_lines=N` leaves the first `N` lines in place, such as a Markdown table header:

<!-- prettier-ignore -->
```markdown
<!-- keep-sorted start skip_lines=2 -->
| Name   | Owner |
| ------ | ----- |
| api    | bob   |
| web    | alice |
| worker | carol |
<!-- keep-sorted end -->
```

Comments stick to the line below them by default (`sticky_comments=yes`), so they move with the
entry they describe:

```python
DEPENDENCIES = [
    # keep-sorted start
    "attrs",
    # Pinned until the next major release.
    "django<5",
    "requests",
    # keep-sorted end
]
```

## Custom Sort Keys

`ignore_prefixes` skips leading tokens when comparing, so `export` does not split the list:

```typescript
// keep-sorted start ignore_prefixes=export,const
const apple = 2;
export const mango = 3;
export const zebra = 1;
// keep-sorted end
```

`by_regex` sorts by the capture group instead of the whole line, here the email domain:

```text
# keep-sorted start by_regex=\w+@(\S+)
bob@alpha.org
carol@mid.net
alice@zeta.com
# keep-sorted end
```

`prefix_order` pins lines with given prefixes before or after the rest; the empty entry stands for
everything else:

```text
# keep-sorted start prefix_order=INIT,,FINAL
INIT_ENV
build
deploy
FINAL_STEP
# keep-sorted end
```

## Order and Duplicates

`order=desc` reverses the order. Duplicates are removed by default; add `remove_duplicates=no` to
keep them. Sorting `1.9`, `1.10`, `1.2`, `1.10` gives:

```yaml
versions:
  # keep-sorted start order=desc numeric=yes
  - 1.10
  - 1.9
  - 1.2
  # keep-sorted end
```

`newline_separated=yes` (or a count such as `2`) inserts blank lines between sorted entries.

## Sorting Across Files

To sort every file with Keep Sorted problems at once, run **Keep Sorted: Sort All Files with
Problems**, or choose **Sort all files with problems (keep-sorted)** from a quick fix when other
files also have warnings. This covers files found by the background scan at startup plus files
opened or edited since. The scan respects `files.exclude`, `search.exclude` (which skips
`node_modules` by default), and `keep-sorted.exclude`, and skips files over 1 MB unless they are
open. All changes are applied as one edit; review them, then use **File → Save All**.

## Keybindings

Bind the command IDs `keep-sorted.fixFile` and `keep-sorted.fixWorkspace` in `keybindings.json`:

```json
[
  {
    "key": "ctrl+alt+s",
    "command": "keep-sorted.fixFile",
    "when": "editorTextFocus"
  }
]
```

The former `keep-sorted.sortFile` alias has been removed; update existing keybindings to
`keep-sorted.fixFile`.

[Back to the README](../README.md)
