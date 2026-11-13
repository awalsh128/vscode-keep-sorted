# Choosing options

Start from the user's preferences (`keepSorted_getPreferences`), then add only the options the
content needs. Every option name and value here is in [options.md](options.md); that file is the
complete list.

## By content type

| Content                                              | Options                                   | Why                                                                |
| ---------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| One item per line: dependencies, flags, enum members | none                                      | Defaults sort each line with its indented continuation lines       |
| Imports, where no formatter orders them              | none                                      | Check [when-not-to-wrap.md](when-not-to-wrap.md) for side effects  |
| Versions, ports, IDs, `item_2` vs `item_10`          | `numeric=yes`                             | Lexical order puts `1.10.0` before `1.2.0`                         |
| Human-facing names with mixed case                   | `case=no`                                 | Default is case-sensitive: `Zebra` sorts before `apple`            |
| Lists where repeats are meaningful                   | `remove_duplicates=no`                    | Default removes duplicate items                                    |
| Header lines inside the block, such as a table head  | `skip_lines=2`                            | Keeps the first N lines in place; negative N skips trailing lines  |
| Declarations sorted by name, not keyword             | `ignore_prefixes=const,let`               | Compares `alpha` and `zeta`, not `const` and `let`                 |
| Some items pinned first or last                      | `prefix_order=core-,,test-`               | Matching prefixes go in that order; the empty item places the rest |
| Sort by part of the line                             | `by_regex=...`                            | Sorts by the match, or by its capture groups                       |
| Continuation lines that are not indented             | `group_prefixes=and,with`                 | Lines starting with a prefix join the item above                   |
| Multi-line definitions                               | See [below](#functions-and-class-members) | Default grouping breaks unindented closing braces                  |
| Descending order                                     | `order=desc`                              |                                                                    |

Defaults worth knowing: comments directly above an item move with it (`sticky_comments=yes`), and
the last item's missing trailing comma is handled, so `"c"` without a comma stays last after
sorting.

Version list, before and after `numeric=yes`:

<!-- verify -->

```python
# keep-sorted start numeric=yes
"1.10.0",
"1.9.2",
"1.2.0",
# keep-sorted end
```

```python
# keep-sorted start numeric=yes
"1.2.0",
"1.9.2",
"1.10.0",
# keep-sorted end
```

## Functions and class members

Sort definitions only after [when-not-to-wrap.md](when-not-to-wrap.md#functions-and-class-members)
passes. Then combine these options:

- `block=yes`: an item ends when its brackets, braces, and quotes balance. Needed whenever a closing
  brace is not indented deeper than the line that opened it, as in Go, Java, C#, and JavaScript.
- `sticky_prefixes=@`: decorators and annotations stay with the definition below them. Use `#[` for
  Rust attributes. Comments are already sticky.
- `newline_separated=yes`: keeps one blank line between definitions. Without it, blank lines move to
  the top of the block.

Indentation-delimited languages such as Python also work with the default grouping, but `block=yes`
is safe there too and keeps one recipe.

Go functions:

<!-- verify -->

```go
// keep-sorted start block=yes newline_separated=yes
func Zeta() int {
	return 2
}

// Alpha returns one.
func Alpha() int {
	return 1
}
// keep-sorted end
```

```go
// keep-sorted start block=yes newline_separated=yes
// Alpha returns one.
func Alpha() int {
	return 1
}

func Zeta() int {
	return 2
}
// keep-sorted end
```

Python methods with a decorator:

<!-- verify -->

```python
class Shape:
    # keep-sorted start block=yes sticky_prefixes=@ newline_separated=yes
    def perimeter(self):
        return sum(self.sides)

    @property
    def area(self):
        return self.w * self.h
    # keep-sorted end
```

```python
class Shape:
    # keep-sorted start block=yes sticky_prefixes=@ newline_separated=yes
    @property
    def area(self):
        return self.w * self.h

    def perimeter(self):
        return sum(self.sides)
    # keep-sorted end
```

Items compare as text from their first non-sticky line, so `def area` and `func Alpha` decide the
order, not the comment or decorator above them. Put the markers inside the class or module body,
indented like its members, and leave fields and constructors outside the block.
