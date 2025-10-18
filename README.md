# VSCode keep-sorted Linter Extension

[![Build Status](https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/ci.yml/badge.svg)](https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/ci.yml)
[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/awalsh128.keep-sorted?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=awalsh128.keep-sorted)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/awalsh128.keep-sorted?color=blue)](https://marketplace.visualstudio.com/items?itemName=awalsh128.keep-sorted)
[![License](https://img.shields.io/github/license/awalsh128/vscode-keep-sorted)](LICENSE)
[![Version](https://img.shields.io/npm/v/@vscode/vsce?label=vsce)](https://www.npmjs.com/package/@vscode/vsce)

Provides linter and auto-fix support in VSCode for sorting lists and code blocks using Google's [keep-sorted](https://github.com/google/keep-sorted) CLI. See [google/keep-sorted](http://github.com/google/keep-sorted) for full documentation of Keep Sorted features.

## Version Information

- keep-sorted version: v0.7.1
- Supported platforms: Windows, macOS, Linux
- Node.js compatibility: 16.x, 18.x

## Features

- Real-time diagnostics for unsorted keep-sorted blocks
- Quick fix code actions to auto-sort lines
- Manual commands for linting and fixing
- Auto-fix on save (configurable)

## How It Works

- The extension wraps the keep-sorted binary, bundled for all major platforms.
- It scans files for keep-sorted blocks and provides diagnostics if lines are unsorted.
- To perform the steps manually use the command palette (`Ctrl+Shift+P`) for:
  - `Keep Sorted: Lint Keep-Sorted`
  - `Keep Sorted: Fix Keep-Sorted Issues`
- Right-click unsorted blocks for quick fixes.

## Example

A toy example.

```typescript
// This will be flagged below.

// keep-sorted start
import { C } from './c';
import { B } from './b';
import { A } from './a';
// keep-sorted end

// ... upon fix becomes.

// keep-sorted start
import { A } from './a';
import { B } from './b';
import { C } from './c';
// keep-sorted end
```

For a larger example, see [example.ts](example.ts).

## Configuration

The extension offers several configuration options to customize its behavior. Add these to your VSCode `settings.json`:

### Basic Settings
```json
{
    "keep-sorted.enabled": true,        // Enable/disable the entire extension
    "keep-sorted.lintOnSave": true      // Run linting when saving files
}
```

### Advanced Settings
```json
{
    "keep-sorted.enableDiagnostics": true,  // Show/hide diagnostic markers in editor
    "keep-sorted.enableAutoFix": true       // Automatically fix issues on save
}
```

### Recent Changes (v0.1.0)

- Added real-time diagnostics with customizable display
- Improved binary distribution for all platforms
- Added auto-fix on save functionality
- Enhanced error handling and performance
- Added comprehensive configuration options
- Separated linting from diagnostic display

See [CHANGELOG.md](CHANGELOG.md) for full history.

```json
"keep-sorted.enabled": true,
"keep-sorted.lintOnSave": true,
"keep-sorted.enableAutoFix": true,
```
