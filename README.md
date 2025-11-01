# Keep Sorted

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/awalsh128/vscode-keep-sorted/blob/main/package.json)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://github.com/awalsh128/vscode-keep-sorted/blob/main/LICENSE.md)
[![CI](https://github.com/awalsh128/vscode-keep-sorted/workflows/CI/badge.svg)](https://github.com/awalsh128/vscode-keep-sorted/actions)

A VS Code extension that automatically keeps sorted blocks in your code organized.

## Features

- Automatically detects and sorts keepSorted blocks
- Real-time diagnostics for unsorted content
- Quick fix actions to sort blocks
- Supports multiple file types

## Configuration

The extension provides several configuration options that can be set in VS Code settings:

### Available Settings

- **`keepSorted.enabled`** (boolean, default: `true`) Enable or disable the extension.

- **`keepSorted.exclude`** (array of strings, default: `[]`) Array of glob or regex patterns to
  exclude files from being processed by the extension (relative to the workspace root).

  Examples:

  ```json
  "keepSorted.exclude": [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.test.ts"
    ".*\/\\w+\\.jsmap",
  ]
  ```

### Fix All on Save

```
{
  "editor.codeActionsOnSave": {
    "source.fixAll.keepSorted": true
  }
}
```

## Usage

The extension will automatically detect keepSorted blocks in your files and provide warnings when
content is not properly sorted.

### Sorting Blocks

When the extension detects unsorted content:

1. A warning squiggle will appear under the unsorted block
2. Click the lightbulb icon or press `Ctrl+.` / `Cmd+.`
3. Select "Sort lines (keepSorted)" from the quick fix menu
