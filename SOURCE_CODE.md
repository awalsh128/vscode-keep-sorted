# Source Code Documentation

## Architecture Overview

The vscode-keep-sorted extension provides intelligent code sorting and linting for VS Code, powered
by Google's [Keep Sorted](https://github.com/google/keep-sorted) binary formatter. It detects
`keep-sorted start/end` blocks in any file type and provides real-time diagnostics, quick fixes, and
code actions to maintain sorted content.

```
┌─────────────────────────────────────────────────────────┐
│             VS Code Extension Host                      │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐   │
│  │  extension.ts (Activation & Core Lifecycle)     │   │
│  └──────────────────────────────────────────────────┘   │
│     │                                                     │
│     ├─> commands.ts (Command Handlers)                 │
│     ├─> actions.ts (Code Actions)                      │
│     ├─> completion.ts (Autocomplete)                   │
│     ├─> configuration.ts (Settings Management)         │
│     └─> workspace.ts (Editor Operations)               │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  keepsorted.ts (Binary Interface)                │   │
│  │  ├─> Spawn keep-sorted binary                    │   │
│  │  ├─> Lint & fix documents                        │   │
│  │  └─> Parse options                               │   │
│  └──────────────────────────────────────────────────┘   │
│     │                                                     │
│     └─> keepsortedopt.ts (Option Parsing)              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  instrumentation.ts (Logging & Diagnostics)      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Keep-Sorted Binary (native, platform-specific)        │
└─────────────────────────────────────────────────────────┘
```

---

## File Structure

### Core Files

#### **extension.ts** — Extension Lifecycle & Activation

- **Purpose**: Main entry point, manages extension activation/deactivation
- **Key Classes/Functions**:
  - `activate()`: Initialize extension on startup
  - `deactivate()`: Clean up resources on unload
  - Event listeners for document changes, configuration updates
  - DiagnosticCollection management
- **Dependencies**:
  - `commands`, `actions`, `completion`, `configuration`, `workspace`, `instrumentation`
  - VS Code API: `vscode`, `ExtensionContext`
- **Key Responsibilities**:
  - Register command handlers (`keep-sorted.sortFile` alias and `keep-sorted.fixFile`)
  - Setup document change listeners (onDidOpenTextDocument, onDidChangeTextDocument)
  - Setup configuration change listeners
  - Manage extension subscriptions for proper cleanup
  - Initialize diagnostic collection

---

#### **commands.ts** — Command Handlers

- **Purpose**: Handles user-triggered commands (keyboard shortcuts, context menu)
- **Key Classes**:
  - `SortFileCommandHandler`: Sorts all keep-sorted blocks in current file
    - Implements fallback chain: provided document → activeTextEditor → visibleTextEditors
    - Returns `CreateEditResult` or null if no changes needed
  - `EditCommandHandler`: Base class for all command handlers
    - Manages command registration and execution
    - Handles edit application and diagnostics clearing
- **Key Methods**:
  - `handle()`: Execute command and apply edit
  - `createEdit()`: Generate workspace edit for sorting
  - `asCodeAction()`: Convert to VS Code CodeAction for quick fixes
- **Error Handling** (FIXED):
  - Now checks `document.uri` existence before using
  - Verifies editor not closed before applying edits
  - Graceful fallback through editor chain

---

#### **actions.ts** — Code Actions (Quick Fixes)

- **Purpose**: Provides "quick fix" lightbulb suggestions for unsorted blocks
- **Key Classes**:
  - `KeepSortedActionProvider`: Implements `vscode.CodeActionProvider`
    - Triggered when diagnostics exist on a line
    - Returns sort actions for intersecting keep-sorted blocks
- **Key Methods**:
  - `provideCodeActions()`: Returns array of CodeAction objects
  - Filters diagnostics by range intersection
  - Creates file-level sort action for affected document
- **Integration**: Connected via VS Code's codeActionProvider extension point

---

#### **completion.ts** — Autocomplete & IntelliSense

- **Purpose**: Provides intelligent suggestions for keep-sorted options on `keep-sorted start` lines
- **Key Classes**:
  - `KeepSortedCompletionProvider`: Implements `vscode.CompletionItemProvider`
    - Detects `keep-sorted start` marker lines
    - Offers available options with descriptions
    - Filters already-specified options
- **Key Methods**:
  - `provideCompletionItems()`: Returns completion list
  - `register()`: Register provider for all document types
  - Supports multiple comment styles (C, Python, HTML, etc.)
- **Options Supported**:
  - `case_sensitive`, `numeric`, `group_prefixes`, etc.
  - Full descriptions and usage examples

---

#### **configuration.ts** — Settings & Configuration Management

- **Purpose**: Handles VS Code settings, file exclusion patterns, logging configuration
- **Key Functions**:
  - `getConfig()`: Retrieve current configuration object
  - `onConfigurationChange()`: Handle settings updates
  - `excluded()`: Check if file matches exclusion patterns
  - `fileExcluded()`: Determine if file should be processed
- **Configuration Schema**:
  - `enabled`: boolean (default: true)
  - `autoComplete`: boolean (default: true)
  - `exclude`: string[] (glob/regex patterns)
  - `logFilepath`: string (optional file logging path)
- **Error Handling** (FIXED):
  - Handles both invalid RegExp patterns AND glob patterns gracefully
  - Logs warnings for malformed patterns
  - Uses fallback no-match pattern `/(?!.*)/ ` for invalid inputs
- **Dependencies**: Uses `glob-regex` for glob pattern conversion

---

#### **workspace.ts** — Document & Edit Operations

- **Purpose**: Manages document processing and workspace edit creation
- **Key Classes**:
  - `EditFactory`: Creates WorkspaceEdit objects for sorting
    - `create()`: Main method, lints document and returns edit
    - `applyToEdit()`: Apply fix to specific range (private)
- **Key Methods**:
  - `inScopeDocuments()`: Get all documents matching file patterns
  - `isInScope()`: Check if URI matches workspace scope
  - `rootPath()`: Get workspace root directory
- **Dependencies**: KeepSorted linter, configuration
- **Error Handling**:
  - Validates document URI before processing
  - Handles null/undefined results gracefully
  - Checks document not closed before applying edits

---

#### **keepsorted.ts** — Keep-Sorted Binary Interface

- **Purpose**: Spawns and communicates with native keep-sorted binary
- **Key Classes**:
  - `KeepSorted`: Wrapper around keep-sorted binary execution
    - Manages binary path resolution (platform-specific)
    - Handles stdin/stdout communication
    - Parses binary responses
- **Key Methods**:
  - `lint()`: Check document for sorting violations
    - Returns diagnostics and error information
    - Spawns binary with timeout (DEFAULT_COMMAND_TIMEOUT_MS = 30 seconds)
  - `fixDocument()`: Apply keep-sorted formatting
    - Returns fixed content or null if already sorted
  - Private helper methods for result parsing
- **Platform Support**: Detects and uses appropriate binary:
  - Windows: `keep-sorted.exe`
  - macOS ARM64: `keep-sorted-darwin-arm64`
  - macOS Intel: `keep-sorted-darwin-amd64`
  - Linux: `keep-sorted-linux-amd64`
- **Error Handling**:
  - Validates binary path and checksums
  - Handles spawn errors and timeouts
  - Parses binary error output (FIXED: timeout test gap remains)

---

#### **keepsortedopt.ts** — Option Parsing & Validation

- **Purpose**: Parses and validates keep-sorted configuration options
- **Key Functions**:
  - `parseOptions()`: Extract options from `keep-sorted start` line
  - `parseOptionValue()`: Convert string values to appropriate types
  - Option validation for:
    - `group_prefixes`: string[]
    - `numeric`: boolean
    - `case_sensitive`: boolean
    - `allow_duplicates`: boolean
    - Many others...
- **Comprehensive Test Coverage**: Excellent test suite with 100+ test cases
- **Error Handling**: Graceful parsing with sensible defaults

---

#### **instrumentation.ts** — Logging & Diagnostics

- **Purpose**: Centralized logging, error tracking, and diagnostic management
- **Key Classes**:
  - `LazyLogger`: Wrapper for winston logger with lazy initialization
  - `ErrorTracker`: Tracks extension errors for telemetry
- **Key Functions**:
  - `createLogger()`: Initialize winston logger with transports
  - `logAndGetError()`: Log error and return for handling (FIXED: now handles primitive strings
    correctly)
  - `setFileLogging()`: Enable/disable file logging
  - `contextualizeLogger()`: Create scoped logger for document/range
  - `relevantDiagnostics()`: Filter diagnostics by URI and range
  - `createGithubIssueAsUrl()`: Generate GitHub issue link with diagnostics
- **Logger Configuration**:
  - Console transport with readable format
  - Optional file transport (configurable)
  - Winston leveledLog method generation
- **Error Handling** (FIXED):
  - Now correctly handles primitive strings vs String objects
  - Proper type checking with `typeof` instead of `instanceof`

---

## Data Flow Diagrams

### Document Open/Change Flow

```
VS Code Document Event
        │
        ├─> extension.ts: onDidOpenTextDocument / onDidChangeTextDocument
        │
        ├─> workspace.ts: inScopeDocuments() / isInScope()
        │   └─> configuration.ts: fileExcluded()
        │
        ├─> keepsorted.ts: lint()
        │   └─> Binary process (keep-sorted)
        │
        ├─> instrumentation.ts: Create diagnostics
        │
        └─> extension.ts: Update DiagnosticCollection
```

### Sort Command Flow

```
User Command (Keyboard/Context Menu)
        │
        ├─> commands.ts: SortFileCommandHandler.handle()
        │
        ├─> workspace.ts: EditFactory.create()
        │
        ├─> keepsorted.ts: fixDocument()
        │   └─> Binary process (keep-sorted)
        │
        ├─> workspace.ts: Create WorkspaceEdit
        │
        ├─> VS Code API: applyEdit()
        │
        └─> instrumentation.ts: Clear diagnostics
```

### Code Action Flow

```
User Hovers on Diagnostic / Clicks Lightbulb
        │
        ├─> actions.ts: KeepSortedActionProvider.provideCodeActions()
        │
        ├─> Filter diagnostics by range
        │
        ├─> Create CodeAction for each issue
        │
        ├─> Link to SortFileCommandHandler
        │
        └─> VS Code executes command on selection
```

---

## Testing Structure

### Test Files Organization

```
src/test/
├── actions.test.ts          — KeepSortedActionProvider tests
├── commands.test.ts         — Command handler tests (FIXED: race condition checks)
├── completion.test.ts       — Autocomplete provider tests (HIGH: register() test gap)
├── configuration.test.ts    — Configuration parsing tests (FIXED: graceful error handling)
├── extension.test.ts        — Extension lifecycle tests (HIGH: disposal test gap)
├── instrumentation.test.ts  — Logging & diagnostics tests (FIXED: string type checking)
├── keepsorted.test.ts       — Binary interface tests (MEDIUM: timeout test gap)
├── keepsortedopt.test.ts    — Option parsing tests (EXCELLENT: comprehensive)
├── workspace.test.ts        — Document & edit tests
├── runTest.ts              — Test runner entry point
├── testing.ts              — Test utilities and mocks
└── suite/
    └── index.ts            — Mocha test suite configuration
```

### Framework & Tools

- **Framework**: Mocha + Chai + Sinon
- **Mocks**: Sinon stubs for VS Code API calls
- **Coverage**: 228+ passing tests

---

## Key Patterns & Conventions

### Error Handling Pattern

```typescript
try {
  // Risky operation
  await riskyOperation();
} catch (err: Error | unknown) {
  throw logAndGetError(logger, err);
}
```

### Async Command Pattern

```typescript
async handle(args?: unknown): Promise<void> {
  try {
    const edit = await this.createEdit(...);
    if (edit) {
      await vscode.workspace.applyEdit(edit.edit);
    }
  } catch (err: Error | unknown) {
    throw logAndGetError(logger, err);
  }
}
```

### Lazy Initialization Pattern

```typescript
const lazyLogger = contextualizeLogger(uri, range);
// Logger created and scoped only when needed
```

---

## Configuration Extension Points

### VS Code Extension Manifest

- **Commands**: `keep-sorted.fixFile` (command palette) and `keep-sorted.sortFile` (legacy alias)
- **Code Actions**: Diagnostic-based for unsorted blocks
- **Completion**: Inline suggestions for keep-sorted options
- **Configuration**: Settings namespace `keep-sorted`
- **Activation**: `onStartupFinished` (non-blocking)

---

## Recent Changes & Fixes (2026-08-12)

### Critical Bugs Fixed

1. ✅ Promise error handling: `Promise.all()` → `Promise.allSettled()`
2. ✅ Null check: Added validation for `document.uri`
3. ✅ Error handling: Nested try-catch for glob pattern parsing
4. ✅ Race condition: Added `isClosed` check for editor documents
5. ✅ Type checking: `instanceof String` → `typeof === 'string'`

### Test Updates

- Updated configuration error handling test (now graceful instead of throwing)
- All 228 tests passing

---

## Dependencies & External Libraries

- **winston**: Structured logging
- **glob-regex**: Convert glob patterns to regex
- **Sinon**: Test mocking framework (testing only)
- **Chai**: Assertion library (testing only)
- **Mocha**: Test runner (testing only)
- **VS Code API**: Extension host communication

---

## Development Guidelines

### Adding New Features

1. Create feature in appropriate module (commands, actions, etc.)
2. Create corresponding `.test.ts` file
3. Add comprehensive tests (error paths, edge cases)
4. Update configuration.ts if settings needed
5. Add logging via instrumentation.ts
6. Update this SOURCE_CODE.md document
7. Update README.md if user-facing
8. Update AI_GUIDELINES.md if process changes

### Code Quality Standards

- TypeScript with strict null checks enabled
- No `any` types without justification
- Comprehensive error handling with try-catch
- Explicit return types on all functions
- Logging for diagnostics and error tracking

### Testing Standards

- Test coverage for all exported functions
- Error path and edge case testing
- Integration tests for command flows
- 100+ test cases per major feature

---

## Performance Considerations

- **Lazy initialization**: Loggers created only when needed
- **Debouncing**: Document changes debounced to avoid excessive linting
- **Binary timeouts**: 30-second timeout on keep-sorted binary execution
- **File exclusion**: Early exit for out-of-scope files

---

## Future Enhancements

- [ ] SOURCE_CODE.md: ✅ COMPLETE (2026-08-12)
- [ ] KeepSortedCompletionProvider.register() test
- [ ] Extension deactivation cleanup tests
- [ ] Keep-sorted binary timeout scenario tests
- [ ] Performance optimization for large files
- [ ] Incremental linting for changed ranges
