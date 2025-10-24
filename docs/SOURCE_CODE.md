# Source Code Documentation

This document provides comprehensive documentation for all TypeScript source files in the
vscode-keep-sorted extension.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [File Descriptions](#file-descriptions)
  - [extension.ts](#extensionts)
  - [actions.ts](#actionsts)
  - [keep_sorted.ts](#keep_sortedts)
  - [instrumentation.ts](#instrumentationts)
  - [shared.ts](#sharedts)
- [Data Flow](#data-flow)
- [Extension Lifecycle](#extension-lifecycle)
- [Error Handling](#error-handling)

---

## Architecture Overview

The extension follows a modular architecture with clear separation of concerns:

```
                ┌───────────────────────────────────────────────┐
                │             extension.ts                      │
                │        (Entry Point & Orchestration)          │
                └───────────────────────┬───────────────────────┘
                                        │
                   ┌────────────────────┼────────────────────┐
                   │                    │                    │
                   ▼                    ▼                    ▼
        ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
        │  actions.ts      │  │ keep_sorted.ts   │  │instrumentation.ts│
        │                  │  │                  │  │                  │
        │  Commands &      │  │  Binary          │  │  Logging &       │
        │  Code Actions    │  │  Interface       │  │  Diagnostics     │
        └──────────────────┘  └─────────┬────────┘  └──────────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  shared.ts       │
                              │  (Utilities)     │
                              └──────────────────┘
```

---

## File Descriptions

### extension.ts

**Purpose**: Main entry point for the VS Code extension. Orchestrates all components and manages the
extension lifecycle.

#### Key Responsibilities

1. **Extension Activation**

   - Initializes logging infrastructure
   - Creates the `KeepSorted` binary interface
   - Sets up diagnostics collection
   - Registers commands and event listeners

2. **Event Management**

   - Document save events (triggers linting)
   - Document change events (debounced linting)
   - Document open/close events
   - Configuration change events

3. **Error Handling**
   - Manages extension disablement on critical errors
   - Provides user feedback via notifications
   - Offers GitHub issue creation for bug reports

#### Main Functions

```typescript
export function activate(context: vscode.ExtensionContext): void;
```

- Entry point called when extension is activated
- Sets up all subscriptions and event handlers
- Returns void (extension context manages disposables)

```typescript
function shouldLintDocument(document: vscode.TextDocument): boolean;
```

- Filters which documents should be linted
- Excludes: untitled documents, git files, output channels
- Returns true if document should be processed

```typescript
async function maybeLintAndUpdateDiagnostics(document: vscode.TextDocument): Promise<void>;
```

- Conditionally lints a document
- Updates diagnostics collection with results
- Used by save and change event handlers

```typescript
async function handleExtensionDisabled(
  logger: vscode.LogOutputChannel,
  info: ExtensionDisabledInfo,
  eventSubscriptions: vscode.Disposable[],
  changeTimer: NodeJS.Timeout | undefined
): Promise<void>;
```

- Called when extension encounters critical errors
- Cleans up event listeners
- Shows error notification with GitHub issue link
- Provides user with recovery options

```typescript
export function deactivate(): void;
```

- Called when extension is deactivated
- Performs cleanup operations
- Currently a no-op (cleanup handled by disposables)

#### Configuration

The extension reads the following configuration values:

- `keep-sorted.enabled` - Enable/disable the extension
- `keep-sorted.lintOnSave` - Lint documents on save
- `keep-sorted.logLevel` - Logging verbosity

#### Event Flow

```
┌────────────────┐     ┌────────────────────────┐     ┌──────────────────────────────────┐
│ Document Save  │ --> │ shouldLintDocument()   │ --> │ maybeLintAndUpdateDiagnostics()  │
└────────────────┘     └────────────────────────┘     └────────────────┬─────────────────┘
                                                                        │
                                                                        ▼
                                                       ┌────────────────────────────┐
                                                       │ KeepSorted.lintDocument()  │
                                                       └──────────────┬─────────────┘
                                                                      │
                                                                      ▼
                                                       ┌──────────────────────┐
                                                       │ Diagnostics.set()    │
                                                       └──────────┬───────────┘
                                                                  │
                                                                  ▼
                                                       ┌──────────────────────┐
                                                       │ Problems Panel Update│
                                                       └──────────────────────┘
```

---

### actions.ts

**Purpose**: Implements command handlers and code action providers for fixing unsorted blocks.

#### Classes

##### FixCommandHandler

Handles the "Sort lines (keep-sorted)" command that fixes all keep-sorted blocks in a document.

**Properties**:

```typescript
static readonly command: vscode.Command
// Command definition with title, command ID, and tooltip

private readonly linter: KeepSorted
// Reference to the binary interface for fixing content

private readonly logger: vscode.LogOutputChannel
// Logging instance

private readonly diagnostics: KeepSortedDiagnostics
// Diagnostics collection to update after fixes
```

**Methods**:

```typescript
async execute(editor: vscode.TextEditor | undefined): Promise<void>
```

- Executes the fix command on the active document
- Calls `KeepSorted.fixDocument()` to get corrected content
- Applies workspace edit to replace document content
- Clears old diagnostics and re-lints to verify fix
- Logs all operations for debugging

**Usage**:

```typescript
// Registered in extension.ts
vscode.commands.registerCommand("keep-sorted.fix", async () => {
  await fixCommandHandler.execute(vscode.window.activeTextEditor);
});
```

##### KeepSortedActionProvider

Implements VS Code's Code Action Provider interface to show quick fixes in the lightbulb menu
(Ctrl+.).

**Properties**:

```typescript
static readonly actionKinds = [vscode.CodeActionKind.QuickFix]
// Specifies this provider offers quick fixes

private readonly diagnostics: KeepSortedDiagnostics
// Access to current diagnostics

private readonly logger: vscode.LogOutputChannel
// Logging instance
```

**Methods**:

```typescript
provideCodeActions(
  document: vscode.TextDocument,
  _: vscode.Range
): vscode.CodeAction[] | undefined
```

- Called by VS Code when user opens quick fix menu
- Returns code actions only if diagnostics exist
- Creates a CodeAction that executes the fix command
- Attaches relevant diagnostics to the action

**Integration**:

```typescript
// Registered in extension.ts
vscode.languages.registerCodeActionsProvider(
  "*", // All file types
  new KeepSortedActionProvider(diagnostics, logger),
  { providedCodeActionKinds: KeepSortedActionProvider.actionKinds }
);
```

#### Code Action Flow

```
                    ┌────────────────────────────────────┐
                    │ User opens Quick Fix (Ctrl+.)      │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ VS Code: provideCodeActions()      │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ Check if diagnostics exist         │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ Create CodeAction with fix command │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ User selects "Sort lines..."       │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ FixCommandHandler.execute()        │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ Document fixed and re-linted       │
                    └────────────────────────────────────┘
```

---

### keep_sorted.ts

**Purpose**: Interfaces with the keep-sorted binary to lint and fix documents. Handles
platform-specific binary selection and process communication.

#### Interfaces

```typescript
interface KeepSortedFinding {
  path: string; // File path
  lines: {
    start: number; // 1-based line number
    end: number; // 1-based line number (inclusive)
  };
  message: string; // Human-readable error message
  fixes: {
    replacements: {
      lines: {
        start: number;
        end: number;
      };
      new_content: string; // Corrected content for this range
    }[];
  }[];
}
```

Represents a single finding from the keep-sorted binary's JSON output.

#### Class: KeepSorted

Main class for binary interaction.

**Properties**:

```typescript
private readonly extensionPath: string
// Absolute path to extension directory (for locating binaries)

private readonly logger: vscode.LogOutputChannel
// Logging instance

private readonly errorTracker: ErrorTracker
// Tracks errors and manages extension state
```

**Methods**:

```typescript
private getBundledBinaryPath = memoize(() => string)
```

- Returns platform-specific binary path
- Memoized for performance (called once)
- Platform detection:
  - Windows: `bin/keep-sorted.exe`
  - macOS (Intel): `bin/keep-sorted-darwin-amd64`
  - macOS (ARM): `bin/keep-sorted-darwin-arm64`
  - Linux: `bin/keep-sorted-linux-amd64`
- Throws error for unsupported platforms

```typescript
async lintDocument(document: vscode.TextDocument): Promise<vscode.Diagnostic[] | undefined>
```

- Lints a document by spawning the binary in lint mode
- Arguments: `--mode=lint --format=json`
- Input: Document content via stdin
- Output: JSON array of findings
- Converts findings to VS Code Diagnostics
- Returns undefined on error or if no findings
- Error handling: tracks errors via ErrorTracker

```typescript
async fixDocument(document: vscode.TextDocument): Promise<string | undefined>
```

- Fixes a document by spawning the binary in fix mode
- Arguments: `--mode=fix`
- Input: Document content via stdin
- Output: Corrected content via stdout
- Returns undefined on error
- Error handling: tracks errors via ErrorTracker

```typescript
private async executeBinary(
  args: string[],
  input: string
): Promise<{ stdout: string; stderr: string }>
```

- Low-level binary execution method
- Spawns child process with given arguments
- Writes input to stdin
- Collects stdout and stderr
- Waits for process exit
- Returns output or throws on error

#### Binary Communication

```
                        ┌────────────────────────┐
                        │  Document Content      │
                        └───────────┬────────────┘
                                    │
                                 (stdin)
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │  keep-sorted binary            │
                    │                                │
                    │  --mode=lint  or  --mode=fix   │
                    │  --format=json                 │
                    └───────────────┬────────────────┘
                                    │
                                 (stdout)
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │  JSON Findings / Fixed Content │
                    └────────────────────────────────┘
```

#### Error Handling

The class uses `ErrorTracker` to:

- Count consecutive errors
- Disable extension after threshold (default: 10 errors)
- Provide detailed error context
- Enable recovery after successful operations

---

### instrumentation.ts

**Purpose**: Provides logging, diagnostics management, and error tracking infrastructure.

#### Functions

```typescript
export function createLogger(name: string): vscode.LogOutputChannel;
```

- Creates a VS Code LogOutputChannel
- Built-in log levels: Trace, Debug, Info, Warning, Error
- Automatic timestamp formatting
- User-configurable via Command Palette
- Integration with VS Code's Output panel

**Usage**:

```typescript
const logger = createLogger("My Extension");
logger.info("Extension activated");
logger.debug("Processing", { data });
logger.error("Failed", error);
```

#### Classes

##### KeepSortedDiagnostics

Manages diagnostic warnings for keep-sorted blocks.

**Properties**:

```typescript
static readonly source = "keep-sorted"
// Source identifier for diagnostics

private readonly diagnostics: vscode.DiagnosticCollection
// VS Code's diagnostic collection

private readonly logger: vscode.LogOutputChannel
// Logging instance
```

**Methods**:

```typescript
set(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void
```

- Sets diagnostics for a document
- Filters to only keep-sorted source diagnostics
- Updates Problems panel
- Logs diagnostic count

```typescript
clear(document: vscode.TextDocument): void
```

- Removes all diagnostics for a document
- Called after successful fixes
- Logs clearing operation

```typescript
get(document: vscode.TextDocument): vscode.Diagnostic[] | undefined
```

- Retrieves diagnostics for a document
- Filters by keep-sorted source
- Returns undefined if none found

```typescript
dispose(): void
```

- Cleans up diagnostic collection
- Called on extension deactivation

##### ErrorTracker

Tracks errors and manages extension state.

**Properties**:

```typescript
private errorCount: number = 0
// Consecutive error count

private readonly errorThreshold: number = 10
// Max errors before disabling

private isExtensionDisabled: boolean = false
// Extension state flag

private readonly onExtensionDisabledEmitter: vscode.EventEmitter<ExtensionDisabledInfo>
// Event emitter for extension disablement

private readonly logger: vscode.LogOutputChannel
// Logging instance
```

**Methods**:

```typescript
recordError(error: Error, context: string): void
```

- Records an error occurrence
- Increments error count
- Logs error details
- Triggers extension disablement if threshold reached

```typescript
recordSuccess(): void
```

- Records a successful operation
- Resets error count
- Re-enables extension if it was disabled

```typescript
onExtensionDisabled(
  listener: (info: ExtensionDisabledInfo) => void
): vscode.Disposable
```

- Registers listener for extension disablement
- Returns disposable for cleanup
- Listener receives error information

```typescript
isDisabled(): boolean
```

- Returns current extension state
- Used to skip operations when disabled

```typescript
dispose(): void
```

- Cleans up event emitter
- Called on extension deactivation

#### ExtensionDisabledInfo Interface

```typescript
interface ExtensionDisabledInfo {
  reason: string; // Error message
  errorCount: number; // Number of consecutive errors
  lastError: Error; // Most recent error
  timestamp: Date; // When disabled
}
```

#### Helper Functions

```typescript
export function createGithubIssueAsUrl(title: string, body: string, labels: string[]): string;
```

- Creates a pre-filled GitHub issue URL
- Used for bug reporting
- Encodes parameters for URL safety
- Returns: `https://github.com/awalsh128/vscode-keep-sorted/issues/new?...`

---

### shared.ts

**Purpose**: Common utilities and constants used across the extension.

#### Constants

```typescript
export const displayName = "Keep Sorted";
```

- User-facing extension name
- Used in logging, notifications, and UI

#### Functions

```typescript
export function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T;
```

- Creates a memoized version of a function
- Caches first result and returns it for subsequent calls
- Generic type preserves function signature
- Use case: Platform detection, binary path resolution

**Implementation**:

```typescript
// Closure captures cached result
let cachedResult: any;
let hasBeenCalled = false;

return ((...args: unknown[]): unknown => {
  if (!hasBeenCalled) {
    cachedResult = fn(...args);
    hasBeenCalled = true;
  }
  return cachedResult;
}) as T;
```

**Usage**:

```typescript
// Expensive operation executed only once
const getBinaryPath = memoize(() => {
  // Platform detection logic
  return determinePath();
});

// First call: executes function
const path1 = getBinaryPath(); // Runs determinePath()

// Subsequent calls: returns cached result
const path2 = getBinaryPath(); // Returns cached path1
const path3 = getBinaryPath(); // Returns cached path1
```

**Benefits**:

- Performance: Avoids repeated computation
- Consistency: Same result guaranteed
- Type safety: Generic preserves function types

---

## Data Flow

### Document Linting Flow

```
                        ┌───────────────────────────┐
                        │ 1. User saves document    │
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │ 2. extension.ts: onDidSaveTextDocument │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │ 3. shouldLintDocument()                │
                  │    → check if should lint              │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │ 4. maybeLintAndUpdateDiagnostics()     │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │ 5. KeepSorted.lintDocument()           │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │ 6. Spawn binary with --mode=lint       │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │ 7. Parse JSON findings                 │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │ 8. Convert to VS Code Diagnostics      │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │ 9. KeepSortedDiagnostics.set()         │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │ 10. Problems panel updated             │
                  └────────────────────────────────────────┘
```

### Document Fixing Flow

```
              ┌──────────────────────────────────────────────┐
              │ 1. User triggers fix                         │
              │    (Ctrl+. or Command Palette)               │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 2. VS Code: provideCodeActions()             │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 3. KeepSortedActionProvider                  │
              │    returns CodeAction                        │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 4. User selects action                       │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 5. VS Code: executeCommand()                 │
              │    'keep-sorted.fix'                         │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 6. FixCommandHandler.execute()               │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 7. KeepSorted.fixDocument()                  │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 8. Spawn binary with --mode=fix              │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 9. Receive corrected content                 │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 10. Apply WorkspaceEdit                      │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 11. Clear diagnostics                        │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 12. Re-lint document                         │
              └────────────────────┬─────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │ 13. Update diagnostics (should be empty)     │
              └──────────────────────────────────────────────┘
```

### Configuration Change Flow

```
                    ┌────────────────────────────────────┐
                    │ 1. User changes settings           │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ 2. extension.ts:                   │
                    │    onDidChangeConfiguration        │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ 3. Check if extension              │
                    │    enabled/disabled                │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ 4. Re-lint open documents          │
                    │    if needed                       │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ 5. Update logging level            │
                    │    if changed                      │
                    └────────────────────────────────────┘
```

---

## Extension Lifecycle

### Activation

```typescript
activate(context: vscode.ExtensionContext)
```

1. Create logger output channel
2. Initialize ErrorTracker
3. Create KeepSorted binary interface
4. Set up KeepSortedDiagnostics
5. Register fix command
6. Register code action provider
7. Set up event listeners:
   - Document save
   - Document change (debounced)
   - Document open
   - Document close
   - Configuration change
8. Lint all open documents

### Runtime

- Event handlers process document changes
- Binary is spawned as needed for linting/fixing
- Errors are tracked and logged
- Extension may self-disable on critical errors

### Deactivation

```typescript
deactivate();
```

- All disposables cleaned up automatically
- Event listeners unregistered
- Diagnostic collection cleared
- Output channel closed

---

## Error Handling

### Error Categories

1. **Binary Execution Errors**

   - Binary not found
   - Binary spawn failures
   - Binary crashes
   - Tracked by ErrorTracker

2. **Document Processing Errors**

   - Invalid document content
   - JSON parsing failures
   - Conversion errors
   - Logged and tracked

3. **Configuration Errors**
   - Invalid settings
   - Missing required config
   - Gracefully degraded

### Error Recovery

The extension implements automatic error recovery:

```typescript
// After 10 consecutive errors
if (errorCount >= errorThreshold) {
  // Disable extension
  isExtensionDisabled = true;
  // Notify user
  showErrorNotification();
  // Clean up event listeners
  disposeEventSubscriptions();
}

// On next successful operation
recordSuccess() {
  errorCount = 0;
  isExtensionDisabled = false;
  // Resume normal operation
}
```

### User Feedback

Errors provide:

- Clear error messages
- Context about what failed
- Suggested actions
- GitHub issue creation link
- Stack traces in logs

---

## Best Practices

### When Adding New Features

1. **Logging**: Use appropriate log levels

   ```typescript
   logger.debug("Verbose details");
   logger.info("Important events");
   logger.warn("Recoverable issues");
   logger.error("Critical failures");
   ```

2. **Error Handling**: Always track errors

   ```typescript
   try {
     // Operation
   } catch (error) {
     errorTracker.recordError(error, "context");
   }
   ```

3. **Disposables**: Register for cleanup

   ```typescript
   context.subscriptions.push(disposable);
   ```

4. **Configuration**: Respect user settings
   ```typescript
   const config = vscode.workspace.getConfiguration("keep-sorted");
   const enabled = config.get<boolean>("enabled", true);
   ```

### Performance Considerations

- Use memoization for expensive operations
- Debounce rapid document changes
- Filter documents before processing
- Avoid blocking the UI thread
- Spawn binaries efficiently

### Testing Strategies

- Test with various document types
- Verify error recovery
- Check configuration changes
- Test binary communication
- Validate diagnostic conversion

---

## Dependencies

### External Dependencies

- `vscode` - VS Code Extension API
- `child_process` - Binary spawning
- `path` - File path manipulation

### Internal Dependencies

```
extension.ts
    ├── actions.ts
    ├── keep_sorted.ts
    ├── instrumentation.ts
    └── shared.ts

actions.ts
    ├── keep_sorted.ts
    └── instrumentation.ts

keep_sorted.ts
    ├── shared.ts
    └── instrumentation.ts

instrumentation.ts
    └── (no dependencies)

shared.ts
    └── (no dependencies)
```

---

## Version History

- **0.0.1** - Initial release with basic linting and fixing
- Current implementation includes robust error handling and logging

---

## Contributing

When modifying source files:

1. Update this documentation
2. Add JSDoc comments to new functions/classes
3. Include error handling
4. Add logging statements
5. Write tests for new functionality
6. Update changelog

---

## License

See LICENSE file in the root directory.
