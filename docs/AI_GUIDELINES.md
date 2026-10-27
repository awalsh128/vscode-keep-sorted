# AI Development Guidelines

**MANDATORY COMPLIANCE REQUIRED**: All AI assistants (Claude, GitHub Copilot, ChatGPT, Gemini) and
human developers MUST follow these guidelines unconditionally when working on vscode-keep-sorted.

**NO EXCEPTIONS. NO COMPROMISES. NO DEVIATIONS.**

## Pre-Flight Checklist

**COMPLETE BEFORE ANY CHANGES OR YOUR CODE WILL BE REJECTED:**

- [ ] **TEST COVERAGE**: Every `.ts` file WILL have its corresponding `.test.ts` file - NO
      EXCEPTIONS
- [ ] **DOCUMENTATION SYNC**: Update SOURCE_CODE.md for code structure changes - MANDATORY
- [ ] **FEATURE DOCUMENTATION**: Update README.md for behavior changes - REQUIRED
- [ ] **GUIDELINE UPDATES**: Update AI_GUIDELINES.md for process changes - ABSOLUTE
- [ ] **TEST COMPLIANCE**: All tests WILL follow the 7 mandatory principles below - OR DIE

## Non-Negotiable Requirements

### 1. Test Coverage - ABSOLUTE REQUIREMENT

**EVERY** TypeScript file MUST have its own test file. **NO EXCEPTIONS. VIOLATIONS WILL BE
REJECTED.**

- **Location**: `src/test/` (extension) or `scripts/test/` (scripts) with `.test.ts` extension -
  MANDATORY
- **Naming**: Match source files exactly (`actions.ts` → `actions.test.ts`) - REQUIRED
- **Framework**: Mocha + Chai + Sinon ONLY - NO ALTERNATIVES
- **Coverage**: ALL exported functions, classes, error paths, edge cases - COMPLETE OR REJECTED

**Current Test Files** (MAINTAIN OR DIE):

- `src/test/actions.test.ts` - ActionProvider quick fixes and fix-all source action
- `src/test/commands.test.ts` - SortFileCommandHandler, SortWorkspaceCommandHandler
- `src/test/completion.test.ts` - KeepSortedCompletionProvider
- `src/test/configuration.test.ts` - getConfig, handleConfigurationChange, excluded, change events
- `src/test/extension.test.ts` - activation, event listeners, sorting and save integration
- `src/test/hover.test.ts` - KeepSortedHoverProvider
- `src/test/instrumentation.test.ts` - logAndGetError, relevantDiagnostics, logging setup
- `src/test/keepsorted.test.ts` - KeepSorted class, binary interface, linting, fixing
- `src/test/keepsortedopt.test.ts` - option metadata and directive parsing
- `src/test/scheduler.test.ts` - LintScheduler debouncing
- `src/test/workspace.test.ts` - EditFactory, isInScope, toJson
- `scripts/test/create-binaries.test.ts` - E2E test for binary creation
- `scripts/test/dev.test.ts` - development launcher, consistency checks, setup
- `scripts/test/ops.test.ts` - Release operations against fake registries
- `scripts/test/packaging.test.ts` - Bundle inlines runtime packages; VSIX excludes development
  files
- `scripts/test/sync-labels.test.ts` - label synchronization

**Verification**: `npm test` MUST pass. Always. FAILURES WILL BE REJECTED.

**Running Tests**:

- `npm test` compiles, then runs `src/test` in a downloaded VS Code instance
- `npm run test:scripts` runs `scripts/test` with Mocha in Node
- Test files compile to `out/test/**/*.test.js` and `out/scripts/test/**/*.test.js` - AUTOMATIC
- Shared test helpers live in `src/test/testing.ts`

### 2. Documentation Synchronization - MANDATORY

**UPDATE DOCS OR YOUR CHANGES WILL BE REJECTED.**

#### SOURCE_CODE.md Updates - REQUIRED

Update `docs/SOURCE_CODE.md` when you:

- Add/modify files, functions, classes - UPDATE OR REJECTED
- Change architecture or data flows - DOCUMENT OR DIE
- Add dependencies or error handling - RECORD OR REJECTED

#### README.md Updates - MANDATORY

Before completing every task, apply the **Required Documentation Review** in
[AGENTS.md](../AGENTS.md). Verify README claims against current code, remove stale or redundant
content, validate affected examples and links, and explain when no README update is needed. This
policy is shared by Copilot and Claude through their repository entry points.

For settings changes, also apply the **Configuration Synchronization** policy in AGENTS.md: update
manifest metadata, runtime configuration, regression tests, and user documentation together as
needed. Do not redefine editor-owned settings or enable optional save actions through defaults.

Update `README.md` when you:

- Add/remove features or commands - DOCUMENT OR REJECTED
- Change configuration, installation, or requirements - UPDATE OR DIE
- Update examples or screenshots - REFRESH OR REJECTED

#### AI_GUIDELINES.md Updates - ABSOLUTE

Update THIS FILE when you:

- Change codebase structure or patterns - UPDATE OR REJECTED
- Modify testing frameworks or standards - DOCUMENT OR DIE
- Add/deprecate common patterns - RECORD OR REJECTED
- Change enforcement rules - UPDATE OR DIE

**All three files MUST stay synchronized with code changes. OUT OF SYNC = REJECTED.**

### 3. TypeScript Standards - NON-NEGOTIABLE

**FOLLOW THESE OR YOUR CODE WILL BE REJECTED.**

#### Type Safety - MANDATORY

- **NO `any` TYPES** - Use specific types or generics - VIOLATIONS REJECTED
- **EXPLICIT RETURN TYPES** - All functions MUST declare return types - REQUIRED
- **STRICT NULL CHECKS** - Handle `undefined` and `null` explicitly - OR DIE
- **TYPE GUARDS** - Use type guards for runtime type checking - MANDATORY

#### Error Handling - ABSOLUTE

- **TRY-CATCH BLOCKS** - Wrap ALL risky operations - NO EXCEPTIONS
- **ERROR LOGGING** - Always log errors with context - REQUIRED
- **TYPED ERRORS** - Use Error types or custom error classes - MANDATORY

#### Async/Await - NON-NEGOTIABLE

- **PREFER ASYNC/AWAIT** - Over raw promises - REQUIRED
- **HANDLE REJECTIONS** - Always catch async errors - OR DIE
- **NO FLOATING PROMISES** - Await or explicitly handle ALL promises - MANDATORY

### 4. Google TypeScript Style Guide - MANDATORY

**Reference**: https://google.github.io/styleguide/tsguide.html

**VIOLATIONS WILL BE REJECTED. FOLLOW EXACTLY.**

#### Naming (ENFORCED - NO EXCEPTIONS)

```typescript
// Classes, Interfaces, Types, Enums: PascalCase
class KeepSorted {}
interface DiagnosticInfo {}

// Functions, methods, variables: camelCase
function lintDocument() {}
const errorCount = 0;

// Module-level constants: CONSTANT_CASE; local constants: camelCase
const LINT_DELAY_MS = 300;
const maxRetries = 3;

// File names: lowercase, matching existing modules
// keepsorted.ts, keepsortedopt.ts, scheduler.ts
```

#### Formatting (REQUIRED - NO DEVIATIONS)

- **Line length**: Maximum 100 characters - ENFORCED
- **Indentation**: 2 spaces (NO TABS) - MANDATORY
- **Semicolons**: REQUIRED - NO EXCEPTIONS
- **Trailing commas**: REQUIRED in multi-line - OR DIE

#### Imports (MANDATORY ORDER - FOLLOW EXACTLY)

```typescript
// 1. Node built-ins
import * as path from "path";
// 2. External libraries
import * as vscode from "vscode";
// 3. Internal modules
import { KeepSorted } from "./keepsorted";
```

#### Documentation (REQUIRED - NO EXCEPTIONS)

- **JSDoc comments** for ALL exported functions and classes - MANDATORY
- **Implementation comments** explain WHY, not WHAT - REQUIRED

## Enforcement

### Pre-Commit Checks - MANDATORY

Before committing changes:

1. **Run tests**: `npm test` - All tests must pass - FAILURES REJECTED
2. **Run linter**: `npm run lint` - No errors allowed - VIOLATIONS DIE
3. **Compile**: `npm run compile` - No TypeScript errors - OR REJECTED
4. **Check consistency**: `npm run check` - Docs, settings, and commands agree - the pre-commit hook
   runs this
5. **Review docs**: Check if `SOURCE_CODE.md` or `README.md` need updates - UPDATE OR DIE

### Code Review Checklist - ABSOLUTE

When reviewing changes:

- [ ] Every modified/new `.ts` file has a corresponding `.test.ts` file - MISSING = REJECTED
- [ ] All tests pass (`npm test`) - FAILURES = REJECTED
- [ ] `docs/SOURCE_CODE.md` updated if code structure changed - OUTDATED = REJECTED
- [ ] `README.md` updated if features or behavior changed - MISSING = REJECTED
- [ ] Code follows TypeScript best practices (no `any`, explicit types, error handling) - VIOLATIONS
      = REJECTED
- [ ] Code follows Google TS Style Guide (naming, formatting, comments) - DEVIATIONS = REJECTED
- [ ] JSDoc comments added for all exported members - MISSING = REJECTED
- [ ] Error handling is comprehensive with logging - INCOMPLETE = REJECTED
- [ ] No floating promises or unhandled rejections - VIOLATIONS = REJECTED
- [ ] VS Code API used correctly with proper disposables - ERRORS = REJECTED
- [ ] **Tests use constants for irrelevant values (MANDATORY)** - VIOLATIONS = REJECTED
- [ ] **Tests follow Arrange-Act-Assert pattern with comments (MANDATORY)** - DEVIATIONS = REJECTED
  - Every `it(...)` test MUST include three comment markers inside the test body (or a combined
    Act+Assert comment when appropriate):
    - `// Arrange` - test setup
    - `// Act` - the operation being tested
    - `// Assert` - expectations
  - This is enforced by reviewers and should be visible in the test source for readability.
  - Quick reviewer helper (lists test locations):
    ```bash
    # Lists all test occurrences so you can manually verify AAA comments nearby
    grep -n "^\s*it(" src/test | sed -E 's/:.*//;s/^/ - /'
    ```
- [ ] **Tests abstract irrelevant details with factories/helpers (MANDATORY)** - MISSING = REJECTED
- [ ] **Tests contain no logic (no conditionals, loops, complex calculations) (MANDATORY)** -
      VIOLATIONS = REJECTED
- [ ] **Common test structures are parameterized (MANDATORY)** - NOT PARAMETERIZED = REJECTED
- [ ] **Tests prioritize DAMP over DRY for readability (MANDATORY)** - DRY VIOLATIONS = REJECTED
- [ ] **Tests follow Google Testing Blog principles (MANDATORY)** - DEVIATIONS = REJECTED

## Common Patterns in This Codebase

### Logging Pattern

```typescript
// Use the shared logger, or scope it to a document with contextualizeLogger()
import { contextualizeLogger, logger } from "./instrumentation";
const documentLogger = contextualizeLogger(document.uri);

// Log at appropriate levels
logger.debug("Detailed information", { data });
logger.info("Important events", { event });
logger.warn("Recoverable issues", { warning });
logger.error("Critical failures", error);
```

### Error Handling Pattern

```typescript
// Log with context and rethrow a proper Error
try {
  return binaryOperation();
} catch (err: Error | unknown) {
  throw logAndGetError(logger, err);
}
```

### Disposable Pattern

```typescript
// Register all disposables with context
export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand("cmd", handler);
  context.subscriptions.push(disposable);

  // Or for custom disposables
  context.subscriptions.push({
    dispose: () => cleanup(),
  });
}
```

### Testing Pattern

```typescript
import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";

describe("ComponentName", () => {
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // For timer-related tests, use shouldAdvanceTime for proper async handling
    clock = sinon.useFakeTimers({
      shouldAdvanceTime: true,
    });
  });

  afterEach(() => {
    clock.restore();
    sandbox.restore();
  });

  describe("methodName", () => {
    it("should lint once edits pause", () => {
      // Arrange
      const lint = sandbox.stub();
      const scheduler = new LintScheduler(lint);

      // Act
      scheduler.schedule(document);
      clock.tick(LINT_DELAY_MS); // Advance fake time

      // Assert
      expect(lint.calledOnceWithExactly(document)).to.equal(true);
    });
  });

  [
    { value: 0, expected: "0" },
    { value: true, expected: "true" },
  ].forEach(({ value, expected }) => {
    it(`should format value ${value} as ${expected}`, () => {
      // Act & Assert
      expect(String(value)).to.equal(expected);
    });
  });
});
```

## Version History

- **2025-10-25**: Merged copilot instructions, streamlined with forceful language
- **2025-10-23**: Added comprehensive testing best practices section
- **2025-10-23**: Initial version with mandatory requirements

## Questions?

If requirements are unclear or conflict with each other, prefer this priority - NO EXCEPTIONS:

1. **Test coverage** - Every file must have tests - ABSOLUTE PRIORITY
2. **Type safety** - No `any`, explicit types - NON-NEGOTIABLE
3. **Documentation** - Keep docs synchronized - MANDATORY
4. **Style guide** - Follow Google TS conventions - REQUIRED
5. **Best practices** - Clean, maintainable code - OR DIE

When in doubt, look at existing code in the repository for examples of the preferred patterns -
FOLLOW EXACTLY.
