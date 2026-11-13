# keep-sorted for agents

keep-sorted sorts the lines between a `keep-sorted start` comment and a `keep-sorted end` comment.
Lines outside the markers never move. The Keep Sorted extension bundles keep-sorted and sorts blocks
on request or on save.

## Mental model

- A **block** is everything between the two markers. keep-sorted reorders the block's **items**: by
  default an item is one line plus the more-indented lines under it and the comments above it.
- Wrapping lines is a promise that their order carries no meaning. keep-sorted cannot check that
  promise; you make it. Content whose order changes behavior is **order-dependent** and stays
  unwrapped.
- Options after `start` change what counts as an item and how items compare:
  `# keep-sorted start numeric=yes`.

## Workflow

1. **Confirm the content is order-independent.** Read [when-not-to-wrap.md](when-not-to-wrap.md).
   Done when you can state why any order of these items behaves the same. When you cannot, leave the
   lines unwrapped and tell the user why.
2. **Choose options.** Get the user's preferences (`keepSorted_getPreferences`), then read
   [choosing-options.md](choosing-options.md) for the content type. Done when every option you add
   has a reason tied to the content or a preference.
3. **Insert markers.** Use `keepSorted_wrapRange`, which applies preferences and the right comment
   syntax. Without the tool, follow [markers-and-languages.md](markers-and-languages.md).
4. **Sort and verify.** Follow [verification.md](verification.md). Done when the block has no
   remaining diagnostics and the diff only reorders items inside the block.

## Minimal example

<!-- verify -->

```python
DEPENDENCIES = [
    # keep-sorted start
    "requests",
    "attrs",
    "numpy",
    # keep-sorted end
]
```

After sorting:

```python
DEPENDENCIES = [
    # keep-sorted start
    "attrs",
    "numpy",
    "requests",
    # keep-sorted end
]
```

## Top mistakes

1. **Wrapping order-dependent content**, such as middleware, precedence lists, or CSS rules. Sorting
   changes behavior while every check stays green.
2. **Sorting multi-line definitions with default options.** A function whose closing brace is not
   indented loses that brace to another item. Use the recipe in
   [choosing-options.md](choosing-options.md#functions-and-class-members).
3. **Writing another language's comment syntax**, such as `//` in Python. keep-sorted still finds
   the marker, but the file no longer parses.
4. **Leaving a marker without its partner.** Sorting deletes an unpaired marker line. Add both
   markers in one edit.
5. **Dropping blank lines between items.** keep-sorted moves blank lines inside a block to the top.
   Set `newline_separated=yes` to keep one blank line between items.

## Reference

| File                                                 | Read when                                                 |
| ---------------------------------------------------- | --------------------------------------------------------- |
| [when-not-to-wrap.md](when-not-to-wrap.md)           | Before every wrap                                         |
| [choosing-options.md](choosing-options.md)           | Choosing options for a content type                       |
| [preferences.md](preferences.md)                     | The user asks to change defaults, or preferences conflict |
| [markers-and-languages.md](markers-and-languages.md) | Writing markers by hand, or the language is unusual       |
| [verification.md](verification.md)                   | After every wrap or sort                                  |
| [options.md](options.md)                             | You need an option's exact values; it lists every option  |

The tools are `keepSorted_getGuide`, `keepSorted_getPreferences`, `keepSorted_wrapRange`, and
`keepSorted_run`. Copilot reaches them through VS Code; other agents reach them through the
extension's MCP server.
