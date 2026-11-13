# keep-sorted option reference

<!-- Generated from KEEP_SORTED_OPTS in src/keepsortedopt.ts by npm run gen:ai-docs. -->

This lists every option the bundled keep-sorted accepts.

- Options follow `start` on the start line, separated by spaces.
- `bool` options take `yes` or `no`; `true` and `false` also work.
- `list` and `regexList` options take comma-separated items, or a YAML list such as `[a, b]`.
- `intList` takes comma-separated integers; `intOrBool` takes an integer or `yes`/`no`.

## Pre-Sorting

| Option              | Meaning                                                                              | Type        | Default | Values      | Conflicts with      | Examples                                    |
| ------------------- | ------------------------------------------------------------------------------------ | ----------- | ------- | ----------- | ------------------- | ------------------------------------------- |
| `skip_lines`        | Lines to ignore before sorting; a negative value skips lines at the end of the block | `intList`   |         |             |                     | `skip_lines=1`, `skip_lines=1,-1`           |
| `group`             | Group lines together based on increasing indentation                                 | `bool`      | `yes`   | `yes`, `no` |                     | `group=yes`, `group=no`                     |
| `group_prefixes`    | Prefixes of lines that should be added to the preceding group                        | `list`      |         |             |                     | `group_prefixes=and,with`                   |
| `block`             | Enable block mode to understand multi-line code blocks                               | `bool`      | `no`    | `yes`, `no` |                     | `block=yes`, `block=no`                     |
| `sticky_comments`   | Attach comments to the line immediately below them while sorting                     | `bool`      | `yes`   | `yes`, `no` |                     | `sticky_comments=yes`, `sticky_comments=no` |
| `sticky_prefixes`   | Prefixes of lines that should behave as sticky comments                              | `list`      |         |             |                     | `sticky_prefixes=//,#`                      |
| `group_start_regex` | Regexes that match the first line of a group; other lines join the previous group    | `regexList` |         |             | `group_end_regex`   | `group_start_regex=^func`                   |
| `group_end_regex`   | Regexes that match the last line of a group; non-comment lines no longer end groups  | `regexList` |         |             | `group_start_regex` | `group_end_regex=;$`                        |

## Sorting

| Option            | Meaning                                                                                        | Type        | Default | Values        | Conflicts with    | Examples                                                |
| ----------------- | ---------------------------------------------------------------------------------------------- | ----------- | ------- | ------------- | ----------------- | ------------------------------------------------------- |
| `order`           | Sort in ascending or descending order                                                          | `enum`      | `asc`   | `asc`, `desc` |                   | `order=desc`                                            |
| `case`            | Case-sensitive sorting (use case=no for case-insensitive)                                      | `bool`      | `yes`   | `yes`, `no`   |                   | `case=yes`, `case=no`                                   |
| `numeric`         | Sort numbers by their numeric value instead of lexically                                       | `bool`      | `no`    | `yes`, `no`   |                   | `numeric=yes`, `numeric=no`                             |
| `prefix_order`    | Explicitly order lines by matching prefix; an empty item positions unmatched lines             | `list`      |         |               |                   | `prefix_order=INIT_,,FINAL_`                            |
| `ignore_prefixes` | Prefixes to ignore when sorting lines                                                          | `list`      |         |               | `by_regex`        | `ignore_prefixes=const,let,var`                         |
| `by_regex`        | Regexes that extract the portion of lines to sort by; YAML items may map a regex to a template | `regexList` |         |               | `ignore_prefixes` | `by_regex=\w+;`, `by_regex=['(\d+)-(\w+)': '${2}${1}']` |

## Post-Sorting

| Option              | Meaning                                                                                                          | Type        | Default | Values                                              | Conflicts with | Examples                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ------- | --------------------------------------------------- | -------------- | ---------------------------------------------------------- |
| `newline_separated` | Separate sorted groups with newlines (yes/no or number of newlines)                                              | `intOrBool` | `no`    | `yes`, `no`                                         |                | `newline_separated=yes`, `newline_separated=2`             |
| `remove_duplicates` | Remove duplicate lines; keep_first_comment and merge_comments compare code only and keep or merge their comments | `enum`      | `yes`   | `yes`, `no`, `keep_first_comment`, `merge_comments` |                | `remove_duplicates=no`, `remove_duplicates=merge_comments` |

## Meta

| Option             | Meaning                                                     | Type   | Default | Values      | Conflicts with | Examples                                      |
| ------------------ | ----------------------------------------------------------- | ------ | ------- | ----------- | -------------- | --------------------------------------------- |
| `allow_yaml_lists` | Allow list-valued options to be specified using YAML syntax | `bool` | `yes`   | `yes`, `no` |                | `allow_yaml_lists=yes`, `allow_yaml_lists=no` |
