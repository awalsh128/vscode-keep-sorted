# Language Specific Solutions

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

[Back to the README](../README.md)
