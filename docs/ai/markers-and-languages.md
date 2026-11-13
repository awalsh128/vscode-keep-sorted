# Markers and languages

Prefer `keepSorted_wrapRange`: it writes both markers with the file's comment syntax and checks the
rules below. Use this file when writing markers by hand or when the tool refuses a language.

## Marker rules

- **Exact text.** keep-sorted finds any line containing `keep-sorted start` or `keep-sorted end`,
  whatever comes before it. Use exactly one space between the words.
- **Own lines.** Each marker sits on its own line, between whole lines of content. Only lines
  between the markers move.
- **Balanced.** Every start has an end. Add both in one edit: sorting deletes an unpaired marker
  line, and keep-sorted sorts nothing else in the file until the pair is fixed.
- **Options on the start line only**, after `start`, separated by spaces:
  `// keep-sorted start numeric=yes case=no`.
- **Indentation.** Indent both markers like the first wrapped line, so formatters leave them in
  place.
- **Nesting.** A block may contain whole blocks; keep-sorted sorts the inner one, then moves it with
  its item. Ranges that cross another block's marker are invalid.
- **Prose.** Avoid the marker phrases in comments or docs; they count as markers.

## Comment syntax

Write the marker in the file's own comment syntax. keep-sorted would still find a marker written
with another language's comment, but the file would no longer parse. With line comments, put the
prefix before the marker: `# keep-sorted start`. With block comments, close the comment on the same
line: `/* keep-sorted start */`.

<!-- generated:languages begin -->

| Comment                   | VS Code language IDs                                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REM`                     | `bat`                                                                                                                                                                                                                                                          |
| `//`                      | `c`, `cpp`, `csharp`, `dart`, `fsharp`, `go`, `go.mod`, `groovy`, `java`, `javascript`, `javascriptreact`, `jsonc`, `kotlin`, `less`, `objective-c`, `php`, `proto`, `proto3`, `rust`, `scala`, `scss`, `swift`, `typescript`, `typescriptreact`, `zig`        |
| `;`                       | `clojure`, `ini`                                                                                                                                                                                                                                               |
| `#`                       | `cmake`, `dockerfile`, `dotenv`, `elixir`, `graphql`, `hcl`, `terraform`, `ignore`, `julia`, `makefile`, `nix`, `perl`, `pip-requirements`, `plaintext`, `powershell`, `properties`, `python`, `r`, `ruby`, `shellscript`, `starlark`, `bazel`, `toml`, `yaml` |
| `/*` ... `*/`             | `css`                                                                                                                                                                                                                                                          |
| `%`                       | `erlang`, `latex`, `tex`, `matlab`                                                                                                                                                                                                                             |
| `--`                      | `haskell`, `lua`, `sql`                                                                                                                                                                                                                                        |
| `<!--` ... `-->`          | `html`, `markdown`, `xml`                                                                                                                                                                                                                                      |
| none: cannot hold markers | `json`                                                                                                                                                                                                                                                         |
| `'`                       | `vb`                                                                                                                                                                                                                                                           |

<!-- generated:languages finish -->

## Unusual cases

- **No comments** (JSON, CSV): the format cannot hold markers. Leave it unwrapped; suggest JSONC or
  YAML only if the tools reading the file accept them.
- **Plain text** (`.txt`): the markers become lines of the file. The tool writes `#` markers, which
  suit formats whose readers skip `#` lines; check how the file is read before wrapping.
- **Embedded languages** (HTML `<script>`, Vue, Svelte, Markdown code fences): use the comment
  syntax of the language at the wrapped lines.
- **Languages missing above**: use the language's line comment. When it only has block comments,
  open and close the comment on each marker line.
- **Strings and heredocs**: the marker text would become part of the string. Wrap the enclosing code
  instead, or leave the content unwrapped.
