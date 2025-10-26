# Keep Sorted

A VS Code extension that automatically keeps sorted blocks in your code organized.

## Features

- Automatically detects and sorts keep-sorted blocks
- Real-time diagnostics for unsorted content
- Quick fix actions to sort blocks
- Supports multiple file types

## Configuration

The extension provides several configuration options that can be set in VS Code settings:

### Available Settings

- **`keep-sorted.enabled`** (boolean, default: `true`) Enable or disable the extension.

- **`keep-sorted.fixOnSave`** (boolean, default: `true`) Automatically fixes documents when they are
  saved.

- **`keep-sorted.exclude`** (array of strings, default: `[]`) Array of glob or regex patterns to
  exclude files from being processed by the extension (relative to the workspace root).

  Examples:

  ```json
  "keep-sorted.exclude": [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.test.ts"
  ]
  ```

## Usage

The extension will automatically detect keep-sorted blocks in your files and provide warnings when
content is not properly sorted.

### Sorting Blocks

When the extension detects unsorted content:

1. A warning squiggle will appear under the unsorted block
2. Click the lightbulb icon or press `Ctrl+.` / `Cmd+.`
3. Select "Sort lines (keep-sorted)" from the quick fix menu

## Troubleshooting

### Viewing Logs

If you encounter issues, you can view the extension's logs:

1. Open the Output panel: `View > Output` or press `Ctrl+Shift+U` / `Cmd+Shift+U`
2. Select "Keep Sorted" from the dropdown menu at the top right

### Adjusting Log Verbosity

If you need more detailed information for troubleshooting:

1. Open Command Palette: `Ctrl+Shift+P` / `Cmd+Shift+P`
2. Type `Developer: Set Log Level...`
3. Select "Keep Sorted" from the list
4. Choose a log level:
   - **Info** (default) - Shows general operation messages
   - **Debug** - Shows detailed processing information
   - **Trace** - Shows very detailed internal operations

The log level changes immediately without restarting VS Code.

### Common Issues

**Extension not working:**

- Check the Output panel for error messages
- Ensure the keep-sorted binary is installed
- Try reloading the window: `Developer: Reload Window`

**Performance issues:**

- Reduce log level to "Info" or "Warning"
- Check if large files are causing delays

## Support

If you encounter issues:

1. Check the logs in the Output panel (see "Viewing Logs" above)
2. Try setting the log level to "Debug" to get more information
3. Report issues with the log output included
