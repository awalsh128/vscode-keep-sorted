# Keep Sorted

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/awalsh128/vscode-keep-sorted/blob/main/package.json)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://github.com/awalsh128/vscode-keep-sorted/blob/main/LICENSE.md)
[![CI](https://github.com/awalsh128/vscode-keep-sorted/workflows/CI/badge.svg)](https://github.com/awalsh128/vscode-keep-sorted/actions)

A lightweight VS Code extension that automatically keeps sorted blocks in your code organized using
[Google's Keep Sorted](https://github.com/google/keep-sorted) formatter. Keep Sorted is a
language-agnostic formatter that sorts lines between two markers in a larger file, helping maintain
consistent ordering of imports, exports, configuration entries, and other list-like content.

## Features

- 🔍 **Automatic Detection**: Recognizes `// keep-sorted start` and `// keep-sorted end` blocks in
  any file type
- 📊 **Real-time Diagnostics**: Shows warnings with squiggly underlines for unsorted content
- 💡 **Quick Fix Actions**: Click the lightbulb or use `Ctrl+.` / `Cmd+.` to sort blocks instantly
- 🗂️ **Multiple Sort Options**:
  - Sort individual blocks (QuickFix)
  - Sort entire file (SourceFixAll)
- 🌍 **Language Agnostic**: Works with any programming language or file type
- 🚀 **Command Palette Integration**: Access sorting commands via `Ctrl+Shift+P` / `Cmd+Shift+P`
- ⚡ **Performance Optimized**: Uses native binaries for fast sorting operations
- 🎯 **Problems Panel Integration**: Fix issues directly from the Problems tab

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
    "**/*.test.ts",
    ".*\\/\\w+\\.jsmap"
  ]
  ```

### Automatic Sorting on Save

Enable automatic sorting when you save files:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.keepSorted": true
  }
}
```

### Workspace Settings Example

```json
{
  "keepSorted.enabled": true,
  "keepSorted.exclude": ["**/node_modules/**", "**/build/**", "**/*.min.*"],
  "editor.codeActionsOnSave": {
    "source.fixAll.keepSorted": true
  }
}
```

## Examples

### JavaScript/TypeScript Imports

```typescript
// keep-sorted start
import { Component } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import fs from "fs";
import path from "path";
// keep-sorted end
```

### CSS Properties

```css
.my-class {
  /* keep-sorted start */
  background-color: #fff;
  border: 1px solid #ccc;
  margin: 10px;
  padding: 5px;
  /* keep-sorted end */
}
```

### Python Imports

```python
# keep-sorted start
import json
import os
import sys
from datetime import datetime
from typing import List, Dict
# keep-sorted end
```

### Configuration Lists

```yaml
# keep-sorted start
dependencies:
  - eslint
  - prettier
  - typescript
  - webpack
# keep-sorted end
```

## Usage

### Setting Up Keep Sorted Blocks

Add keep-sorted markers around the content you want to keep sorted:

```javascript
// keep-sorted start
import { zebra } from "./animals";
import { apple } from "./fruits";
import { car } from "./vehicles";
// keep-sorted end
```

The extension will detect when these blocks are not properly sorted and provide automatic fixes.

### Sorting Methods

#### 1. Quick Fix (Lightbulb)

When the extension detects unsorted content:

1. A warning squiggle appears under the unsorted block
2. Click the lightbulb 💡 icon or press `Ctrl+.` / `Cmd+.`
3. Choose from available actions:
   - **"Sort all lines in block (keep-sorted)"** - Sorts just the selected block
   - **"Sort all lines in file (keep-sorted)"** - Sorts all keep-sorted blocks in the file

#### 2. Command Palette

Use `Ctrl+Shift+P` / `Cmd+Shift+P` and search for:

- **"Keep Sorted: Fix File"** - Sort all blocks in the current file
- **"Keep Sorted: Fix Workspace"** - Sort all blocks in the entire workspace

#### 3. Problems Panel

1. Open the Problems panel (`Ctrl+Shift+M` / `Cmd+Shift+M`)
2. Look for keep-sorted warnings
3. Use "Quick Fix" or "Fix All" options directly from the panel

### Supported File Types

Keep Sorted works with any file type. Common use cases include:

- **JavaScript/TypeScript**: Import/export statements
- **Python**: Import statements, configuration lists
- **CSS**: Property declarations, import statements
- **Markdown**: Lists, table of contents
- **JSON/YAML**: Configuration entries
- **And many more!**

## Troubleshooting

### Extension Not Working?

1. **Check Extension Status**
   - Ensure the extension is enabled in VS Code
   - Verify `keepSorted.enabled` is set to `true` in settings

2. **No Diagnostics Appearing?**
   - Make sure your blocks use the correct syntax: `// keep-sorted start` and `// keep-sorted end`
   - Check if files are excluded via `keepSorted.exclude` patterns
   - Verify the file is saved (diagnostics appear after save)

3. **Commands Not Available?**
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for "Keep Sorted"
   - If commands don't appear, try reloading VS Code (`Developer: Reload Window`)

4. **Performance Issues?**
   - Add problematic file patterns to `keepSorted.exclude`
   - Check VS Code's Output panel (select "Keep Sorted" from dropdown) for error messages

### Getting Help

- **Report Issues**: [GitHub Issues](https://github.com/awalsh128/vscode-keep-sorted/issues)
- **Feature Requests**:
  [GitHub Discussions](https://github.com/awalsh128/vscode-keep-sorted/discussions)
- **Documentation**: [Keep Sorted Project](https://github.com/google/keep-sorted)

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE.md](LICENSE.md) file for
details.
