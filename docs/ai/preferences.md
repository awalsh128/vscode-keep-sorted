# Preferences

Users record default options in the `keep-sorted.wrap.preferences` setting. `keepSorted_wrapRange`
applies them unless told otherwise, and `keepSorted_getPreferences` returns them with the options
they resolve to for a file. Apply preferences to new blocks only; leave existing start lines as the
user wrote them.

## Shape

```jsonc
"keep-sorted.wrap.preferences": {
  // Options for every file.
  "options": { "case": "no" },
  // Options by VS Code language ID.
  "languages": { "go": { "block": "yes", "newline_separated": "yes" } },
  // Options by workspace-relative glob. Use **/ to match in any folder.
  "files": { "**/requirements*.txt": { "remove_duplicates": "no" } }
}
```

- Values are written as on a start line: `"yes"`, `"1,-1"`, `"[a, b]"`.
- Layers apply in order: `options`, then `languages`, then each matching `files` glob in the order
  written, then options passed to the tool. A later layer wins.
- `null` removes an option an earlier layer set, restoring keep-sorted's default.
- User and workspace settings merge key by key, with the workspace winning.

## Content first, then preferences

Preferences describe taste: case, duplicates, spacing. Content needs override taste: a version list
needs `numeric=yes` whatever the preferences say. When an option you need conflicts with a
preference, pass it explicitly and tell the user which preference you overrode and why.

## Worked examples

The same requirements file, wrapped with two different preferences.

With `{ "options": { "case": "no" } }`:

<!-- verify -->

```text
# keep-sorted start case=no
requests
Django
attrs
# keep-sorted end
```

```text
# keep-sorted start case=no
attrs
Django
requests
# keep-sorted end
```

With no preferences, keep-sorted is case-sensitive and uppercase sorts first:

<!-- verify -->

```text
# keep-sorted start
requests
Django
attrs
# keep-sorted end
```

```text
# keep-sorted start
Django
attrs
requests
# keep-sorted end
```

With `{ "files": { "**/allowlist.txt": { "remove_duplicates": "no" } } }`, a repeated entry in
`config/allowlist.txt` stays:

<!-- verify -->

```text
# keep-sorted start remove_duplicates=no
beta
alpha
beta
# keep-sorted end
```

```text
# keep-sorted start remove_duplicates=no
alpha
beta
beta
# keep-sorted end
```

## Changing preferences

When the user states a lasting preference ("always sort case-insensitively"), suggest the setting
change and show the JSON. Edit settings only when the user asks you to.
