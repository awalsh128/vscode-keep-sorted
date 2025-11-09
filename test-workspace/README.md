# Test Workspace

This is a sandbox test workspace for the vscode-keep-sorted extension.

## Test Files

- **sample.ts** - TypeScript file with various keep-sorted blocks
- **sample.js** - JavaScript file for CommonJS testing
- **sample.py** - Python file for testing with Python comments
- **comments.txt** - Plain text file with comment-style sorting
- **sorted.md** - Markdown file with list sorting examples

## Keep-Sorted Examples

### Basic Sorting

```
// keep-sorted start
import { zebra } from './zebra';
import { alpha } from './alpha';
import { beta } from './beta';
// keep-sorted end
```

### Numeric Sorting

```
// keep-sorted start numeric=yes
item10
item2
item1
// keep-sorted end
```

### Case-Insensitive Sorting

```
// keep-sorted start case=no
Component_A
component_b
Component_C
// keep-sorted end
```

## Testing

Use this workspace to:

1. Test the extension's sorting functionality
2. Verify diagnostics are shown for unsorted blocks
3. Test code actions and quick fixes
4. Test configuration changes
5. Debug the extension with real-world examples
