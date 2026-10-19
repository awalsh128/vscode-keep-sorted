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
│     ├─> hover.ts (Option Hover Documentation)          │
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

### Repository Layout

```
bin/             — Bundled keep-sorted binaries and checksums
docs/            — Architecture (this file) and AI development guidelines
images/          — Extension icon (logo.png, from logo.svg) and README media
scripts/         — Development, binary build, and label sync scripts (own tsconfig.json)
src/             — Extension source and tests (own tsconfig.json)
test-workspace/  — Fixture workspace for tests and npm run dev
tsconfig.json    — Build entry point referencing src/ and scripts/
tsconfig.base.json — Compiler options shared by both projects
```

Prettier settings live under the `prettier` key in `package.json`. Root-level `AGENTS.md` and
`CLAUDE.md` stay at the root because agent tools discover them there.

### Manual Extension Development Host

[scripts/dev.ts](../scripts/dev.ts) launches a stable VS Code, cached outside the repository so its
built-in themes are not treated as the extension's own, with the locally compiled extension and test
workspace, without an extension-test entry point. `npm run dev` compiles first; the launcher
verifies build output and removes `ELECTRON_RUN_AS_NODE` from the child environment. Separate
profile/extension directories isolate it from the normal editor.
[scripts/test/dev.test.ts](../scripts/test/dev.test.ts) tests launch arguments and failure handling
without opening an editor or downloading VS Code.

### Bundled Binary Generation

[scripts/create-binaries.ts](../scripts/create-binaries.ts) cross-compiles upstream keep-sorted
v0.10.0 using explicit `GOOS`, `GOARCH`, and `CGO_ENABLED=0` environment values. Both the source and
compiled JavaScript entry points resolve outputs to the repository's `bin/` directory. Each binary
is assigned mode `0755`, including the Windows executable, before its SHA256 is written. The script
also assigns checksums mode `0644`. The binary workflow transfers a tar archive to preserve these
modes after artifact download without a separate chmod step. Regression tests check exact modes
under a restrictive umask, archive permission preservation, checksum contents, and target executable
headers.

### Agent Configuration

- [AGENTS.md](../AGENTS.md): Shared agent policy, including the required concise, code-verified
  README review before task completion.
- [.github/copilot-instructions.md](../.github/copilot-instructions.md): Copilot entry point that
  references the shared policy and development guidelines.
- [CLAUDE.md](../CLAUDE.md): Claude Code entry point; imports the shared policy with `@AGENTS.md`.
- [.github/agents/docs-reviewer.agent.md](../.github/agents/docs-reviewer.agent.md) and
  [.claude/agents/docs-reviewer.md](../.claude/agents/docs-reviewer.md): Read-only documentation
  reviewers in each tool's native discovery layout. The main agent applies findings and validates
  changes. No separate Claude settings file or expanded permissions are required.

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
  - Register the `keep-sorted.fixFile` and `keep-sorted.fixWorkspace` sorting commands (the former
    legacy alias is removed)
  - Lint in-scope documents on activation (`inScopeDocuments()`) and on open, change, and save
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
  - `SortWorkspaceCommandHandler`: Sorts every in-scope file with keep-sorted diagnostics
    - `affectedUris()` reads files with findings from the diagnostic collection
    - Merges each file's `EditFactory.create()` result into one WorkspaceEdit
    - Skips and reports files that fail; refreshes diagnostics only after the edit is applied
  - `EditCommandHandler`: Base class for single-document edit command handlers
    - Manages command registration and execution
    - Handles edit application and post-edit diagnostic reevaluation
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
  - `ActionProvider`: Implements `vscode.CodeActionProvider`
    - Triggered when diagnostics exist on a line
    - Returns sort actions for intersecting keep-sorted blocks
- **Key Methods**:
  - `provideCodeActions()`: Returns array of CodeAction objects
  - Filters diagnostics by range intersection
  - Creates file-level sort action for affected document, plus a workspace sort action when other
    files also have diagnostics (quick fixes only, never on save)
- **Integration**: Connected via VS Code's codeActionProvider extension point
- **Sort on Save**: `ActionProvider` also advertises `source.fixAll.keepSorted` and returns a
  preferred file-level action when VS Code requests that kind. The action executes
  `keep-sorted.fixFile`; the save participant applies the changes before writing the file.

### Sorting Regression Coverage

[src/test/extension.test.ts](../src/test/extension.test.ts) runs `keep-sorted.fixFile` in the real
extension host and verifies that the removed legacy command is not registered, with an explicit
document and with no arguments (Command Palette behavior). Tests check all blocks, unchanged
surrounding text, cleared diagnostics, and idempotence. Save tests invoke the editor Save command
and verify both document and disk contents with `source.fixAll.keepSorted` set to `"explicit"` or
`"never"`.

Each regression uses a unique fixture URI and restores workspace settings. A temporary no-op
source-action provider probes VS Code's save-participant readiness before the fixture is populated,
avoiding startup timing failures without a fixed delay.

---

#### **completion.ts** — Autocomplete & IntelliSense

- **Purpose**: Provides intelligent suggestions for keep-sorted options on `keep-sorted start` lines
- **Key Classes**:
  - `KeepSortedCompletionProvider`: Implements `vscode.CompletionItemProvider`
    - Detects `keep-sorted start` marker lines
    - Offers option names with descriptions, omitting options already on the line and options that
      conflict with them (`by_regex`/`ignore_prefixes`, `group_start_regex`/`group_end_regex`)
    - Inserts `key=` with a choice of known values, non-default values first
    - After `=`, suggests known values (`yes`/`no`, `order`, `remove_duplicates` modes) and replaces
      the whole value; free-form values and YAML lists get no suggestions
    - Registers space, `=`, `_`, and letters as trigger characters because VS Code disables quick
      suggestions in comments by default
- **Key Methods**:
  - `provideCompletionItems()`: Returns option-name or value completions
  - `register()`: Register provider for in-scope URI schemes (all languages)
  - Supports multiple comment styles (C, Python, HTML, etc.)

---

#### **hover.ts** — Option Hover Documentation

- **Purpose**: Shows an option's documentation when hovering its key or value after `start` on a
  `keep-sorted start` line, using the same Markdown as completion items
- **Key Classes**:
  - `KeepSortedHoverProvider`: Implements `vscode.HoverProvider`; ignores unknown options and
    non-directive lines. Registered with the other providers, so it follows `keep-sorted.enabled`
    but not `keep-sorted.autoComplete`

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
- **Settings UI metadata**: The manifest uses ordered `markdownDescription` fields to explain
  save-action setup, autocomplete tooltips, regex-first exclusions, and logging paths. The
  configuration tests guard metadata/defaults and keep editor-owned save settings out of the
  extension's configuration properties. AGENTS.md defines the shared synchronization policy.
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
    - `refreshDiagnostics()`: Replaces file diagnostics from the current buffer, including an empty
      result to clear resolved problems. It is the only writer of the diagnostic collection:
      document listeners call it on open/change/save, and commands call it before edit generation
      and after successful edits; failed edit application retains diagnostics instead of clearing
      them optimistically. `relevantDiagnostics()` is the matching reader, optionally filtered by
      range for code actions.
    - `applyToEdit()`: Add the whole-file fix to a WorkspaceEdit (private)
- **Key Methods**:
  - `inScopeDocuments()`: Open in-scope workspace files from `findFiles("**/*")` for activation
    linting, skipping files that cannot be opened as text
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
    - Returns `{ content, range }` (a single block or the whole file), or null when the document has
      no findings
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

- **Purpose**: Describes and parses keep-sorted directive options for autocomplete
- **Key Exports**:
  - `KEEP_SORTED_OPTS`: Option metadata matching the bundled binary's
    [options.go](https://github.com/google/keep-sorted/blob/v0.10.0/keepsorted/options.go): value
    type, upstream default, suggested values, conflicts, and examples. Update it whenever
    `KEEP_SORTED_VERSION` changes in `scripts/create-binaries.ts`.
  - `KeepSortedOption.parseValue()`: Mirrors the upstream parser (case-sensitive keywords, untrimmed
    comma lists, YAML lists, Go inline regex flags dropped before JavaScript validation)
  - `Directive`: Splits a `keep-sorted start` line into well-formed and malformed option tokens
  - `isValidCompletionPosition()`: Checks that the cursor follows `start`
- **Diagnostics**: Option warnings shown in the editor come from the keep-sorted binary;
  `getDirectiveAndErrors()` and `validateOptionsInFile()` are not wired into linting

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
        │   └─> refreshDiagnostics(): Lint current buffer before creating edits
        │
        ├─> keepsorted.ts: fixDocument()
        │   └─> Binary process (keep-sorted)
        │
        ├─> workspace.ts: Create WorkspaceEdit
        │
        ├─> VS Code API: applyEdit()
        │
        ├─> Rejected edit: Retain current diagnostics and report failure
        │
        └─> Successful edit: Reopen updated document and refreshDiagnostics()

Sort All Files with Problems
        │
        └─> commands.ts: SortWorkspaceCommandHandler.handle()
            ├─> affectedUris(): Files with diagnostics in the collection
            ├─> EditFactory.create() per file, merged into one WorkspaceEdit
            └─> applyEdit(), then refreshDiagnostics() for each sorted file
```

### Code Action Flow

```
User Hovers on Diagnostic / Clicks Lightbulb
        │
        ├─> actions.ts: ActionProvider.provideCodeActions()
        │
        ├─> Filter diagnostics by range
        │
        ├─> Create CodeAction for each issue
        │
        ├─> Link to SortFileCommandHandler (and SortWorkspaceCommandHandler when other files
        │   have diagnostics)
        │
        └─> VS Code executes the file sort command on the document
```

---

## Testing Structure

### Test Files Organization

```
src/test/
├── actions.test.ts          — ActionProvider tests
├── commands.test.ts         — Command handler tests (FIXED: race condition checks)
├── completion.test.ts       — Autocomplete provider tests
├── hover.test.ts            — Hover provider tests
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

- **Commands**: `keep-sorted.fixFile` and `keep-sorted.fixWorkspace` (Command Palette); the legacy
  sort alias has been removed
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

The reusable CI and publishing workflows pin Ubuntu 24.04 and Node 24-based actions. CI installs
Node.js 24 for development tooling and runs extension tests through the runner's `xvfb-run` instead
of a separate JavaScript wrapper action. These build-time requirements do not change the extension's
VS Code engine requirement.

- **winston**: Structured logging
- **glob-regex**: Convert glob patterns to regex
- **Sinon**: Test mocking framework (testing only)
- **Chai**: Assertion library (testing only)
- **Mocha**: Test runner (testing only)
- **VS Code API**: Extension host communication
- **@vscode/test-cli**: Loads the development test configuration; version 0.0.15 or newer avoids the
  older chokidar/braces dependency chain and requires Node.js 22+.
- **@vscode/vsce**: Local extension packaging tooling. Open VSX publishing is handled by the release
  workflow; the unused local `ovsx` dependency is not installed.

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
