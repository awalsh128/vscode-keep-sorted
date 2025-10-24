# AI Development Guidelines

This file contains mandatory requirements and guidelines for AI assistants (Claude, GitHub Copilot,
ChatGPT, Gemini, etc.) and human developers when working on the vscode-keep-sorted project.

**Purpose**: These guidelines ensure consistency, quality, and maintainability across all
contributions, whether made by AI assistants or human developers.

## Mandatory Requirements

### 1. Test Coverage

**REQUIREMENT**: Every TypeScript file must have its own test file.

- **Location**: Tests must be placed in `src/test/` directory with `.test.ts` extension
- **Naming Convention**: Test files must match source files (e.g., `actions.ts` → `actions.test.ts`)
- **Framework**: Use Mocha + Chai + Sinon for all tests
- **Coverage**: Each test file must cover:
  - All exported functions and classes
  - Main execution paths (happy path and error cases)
  - Edge cases and boundary conditions
  - Integration points with VS Code API

**Current Test Files** (must be maintained):

- `src/test/actions.test.ts` - Tests for `src/actions.ts` (FixCommandHandler,
  KeepSortedActionProvider)
- `src/test/configuration.test.ts` - Tests for `src/configuration.ts` (getConfiguration,
  affectsConfiguration, onDidChangeConfiguration)
- `src/test/extension.test.ts` - Tests for `src/extension.ts` (activation, event listeners, document
  filtering)
- `src/test/instrumentation.test.ts` - Tests for `src/instrumentation.ts` (KeepSortedDiagnostics,
  ErrorTracker, createGithubIssueAsUrl)
- `src/test/keep_sorted.test.ts` - Tests for `src/keep_sorted.ts` (KeepSorted class, binary
  interface, linting, fixing)
- `src/test/shared.test.ts` - Tests for `src/shared.ts` (displayName constant, memoize function)
- `scripts/test/create-binaries.test.ts` - E2E test for `scripts/create-binaries.ts`

**Verification**:

```bash
npm test  # All tests must pass
```

### 2. Documentation Updates

#### 2.1 SOURCE_CODE.md Updates

**REQUIREMENT**: `docs/SOURCE_CODE.md` must be updated when code changes.

Update this file when:

- **Adding new files**: Add file description, classes, functions, and usage examples
- **Modifying functions**: Update function signatures, parameters, return types, and descriptions
- **Changing classes**: Update class properties, methods, and usage patterns
- **Refactoring**: Update data flow diagrams and architecture diagrams
- **Adding dependencies**: Update dependency graphs
- **Changing error handling**: Update error handling section

**File Structure to Maintain**:

- Architecture Overview (with ASCII diagrams)
- File Descriptions (one section per file)
- Data Flow diagrams
- Extension Lifecycle
- Error Handling
- Best Practices
- Dependencies

#### 2.2 README.md Updates

**REQUIREMENT**: `README.md` must be updated when changes affect features or codebase state.

Update this file when:

- **Adding features**: Document new capabilities, commands, or settings
- **Removing features**: Remove documentation for deprecated functionality
- **Changing configuration**: Update configuration examples and descriptions
- **Modifying installation**: Update installation instructions
- **Changing requirements**: Update prerequisites or dependencies
- **Adding examples**: Provide usage examples for new features
- **Updating screenshots**: Capture new UI or behavior

**Key Sections to Maintain**:

- Features list
- Installation instructions
- Configuration options
- Usage examples
- Requirements
- Known issues

#### 2.3 AI_GUIDELINES.md Updates

**REQUIREMENT**: `AI_GUIDELINES.md` must be updated to reflect the current state of the codebase
when changes are made.

Update this file when:

- **Codebase structure changes**: Update file locations, test file paths, or directory organization
- **Adopting new patterns**: Add new coding patterns or conventions to the project
- **Changing style rules**: Update formatting, naming, or organizational standards
- **Adding best practices**: Document new TypeScript or VS Code API patterns
- **Modifying test patterns**: Update testing conventions or frameworks
- **Changing linting rules**: Update code quality or style enforcement rules
- **Updating Google TS Style Guide compliance**: Reflect changes in adherence to the guide
- **Adding common patterns**: Document new reusable patterns discovered in the codebase
- **Deprecating patterns**: Mark old patterns as deprecated and provide alternatives
- **Technology stack changes**: Update framework versions, testing libraries, or build tools
- **Adding/removing dependencies**: Update references to external libraries or VS Code APIs
- **Process changes**: Update pre-commit checks, code review checklists, or enforcement rules

**Key Sections to Maintain**:

- Test Coverage requirements and file locations
- TypeScript Best Practices
- Google TypeScript Style Guide adherence
- Common Patterns in This Codebase
- Enforcement rules and checklists
- Testing patterns
- Version History (add entry for each update)

### 3. TypeScript Best Practices

**REQUIREMENT**: Must follow TypeScript best practices consistently throughout the codebase.

#### 3.1 Type Safety

- **No `any` types**: Use specific types or generics instead
- **Explicit return types**: All functions must declare return types
- **Interface over type**: Prefer interfaces for object shapes
- **Strict null checks**: Handle `undefined` and `null` explicitly
- **Type guards**: Use type guards for runtime type checking

```typescript
// ✅ Good
function processDocument(doc: vscode.TextDocument): string | undefined {
  if (!doc) {
    return undefined;
  }
  return doc.getText();
}

// ❌ Bad
function processDocument(doc: any) {
  return doc.getText();
}
```

#### 3.2 Error Handling

- **Try-catch blocks**: Wrap risky operations
- **Typed errors**: Use Error types or custom error classes
- **Error logging**: Always log errors with context
- **User feedback**: Provide meaningful error messages

```typescript
// ✅ Good
try {
  await binaryOperation();
  errorTracker.recordSuccess();
} catch (error) {
  logger.error("Binary operation failed", error);
  errorTracker.recordError(error as Error, "binaryOperation");
  throw error;
}
```

#### 3.3 Async/Await

- **Prefer async/await**: Over raw promises
- **Handle rejections**: Always catch async errors
- **No floating promises**: Await or explicitly handle all promises

```typescript
// ✅ Good
async function lintDocument(doc: vscode.TextDocument): Promise<void> {
  try {
    const diagnostics = await linter.lint(doc);
    diagnosticsCollection.set(doc.uri, diagnostics);
  } catch (error) {
    logger.error("Linting failed", error);
  }
}
```

#### 3.4 Code Organization

- **Single responsibility**: One class/function, one purpose
- **Dependency injection**: Pass dependencies as constructor parameters
- **Immutability**: Prefer `const` and readonly properties
- **Exports**: Only export what's needed

### 4. Google TypeScript Style Guide

**REQUIREMENT**: Must follow the Google TypeScript Style Guide consistently.

Reference: https://google.github.io/styleguide/tsguide.html

#### 4.1 Naming Conventions

```typescript
// Classes, Interfaces, Types, Enums: PascalCase
class KeepSorted {}
interface DiagnosticInfo {}
type ConfigOptions = {};
enum LogLevel {}

// Functions, methods, variables: camelCase
function lintDocument() {}
const errorCount = 0;

// Constants: camelCase (not SCREAMING_SNAKE_CASE)
const maxRetries = 3;
const defaultTimeout = 5000;

// Private members: prefix with underscore (optional but recommended)
class Example {
  private readonly _logger: vscode.LogOutputChannel;
}

// File names: kebab-case with extension
// keep-sorted.ts, error-tracker.ts
```

#### 4.2 Formatting

```typescript
// Line length: Maximum 80 characters (prefer 100 for readability)
// Indentation: 2 spaces (no tabs)
// Semicolons: Required
// Quotes: Single quotes preferred
// Trailing commas: Required in multi-line

const config = {
  enabled: true,
  logLevel: "info",
  timeout: 5000, // Trailing comma
};
```

#### 4.3 Imports

```typescript
// Order: Node built-ins, external, internal
import * as path from "path";
import * as vscode from "vscode";
import { KeepSorted } from "./keep_sorted";
import { ErrorTracker } from "./instrumentation";

// Avoid default exports (use named exports)
// ✅ Good
export class KeepSorted {}

// ❌ Avoid
export default class KeepSorted {}
```

#### 4.4 Comments and Documentation

```typescript
/**
 * JSDoc comments for all exported functions and classes.
 * Use complete sentences with proper punctuation.
 *
 * @param document The document to lint
 * @returns Array of diagnostics or undefined on error
 */
export async function lintDocument(
  document: vscode.TextDocument
): Promise<vscode.Diagnostic[] | undefined> {
  // Implementation comments use // and explain why, not what
  // Start with lowercase unless it's a sentence

  // Complex logic should have comments explaining the reasoning
  if (shouldSkipLinting(document)) {
    return undefined; // Skip untitled or git documents
  }

  return await performLinting(document);
}
```

#### 4.5 Type Annotations

```typescript
// Always annotate function parameters and return types
function process(input: string): boolean {
  return input.length > 0;
}

// Use type inference for simple assignments
const count = 5; // Type inferred as number
const items: string[] = []; // Explicit when not obvious

// Use interfaces for object shapes
interface Config {
  readonly enabled: boolean;
  readonly logLevel: string;
}

// Use generics appropriately
function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T {
  // Implementation
}
```

#### 4.6 Control Flow

```typescript
// Use early returns to reduce nesting
function process(data: Data | undefined): Result | undefined {
  if (!data) {
    return undefined;
  }

  if (!data.isValid) {
    return undefined;
  }

  return performProcessing(data);
}

// Prefer const over let
const items = getItems(); // ✅
let items = getItems(); // ❌ (unless reassignment needed)

// Use optional chaining and nullish coalescing
const value = obj?.prop?.nested ?? defaultValue;
```

## Enforcement

### Pre-Commit Checks

Before committing changes:

1. **Run tests**: `npm test` - All tests must pass
2. **Run linter**: `npm run lint` - No errors allowed
3. **Compile**: `npm run compile` - No TypeScript errors
4. **Review docs**: Check if `SOURCE_CODE.md` or `README.md` need updates

### Code Review Checklist

When reviewing changes:

- [ ] Every modified/new `.ts` file has a corresponding `.test.ts` file
- [ ] All tests pass (`npm test`)
- [ ] `docs/SOURCE_CODE.md` updated if code structure changed
- [ ] `README.md` updated if features or behavior changed
- [ ] Code follows TypeScript best practices (no `any`, explicit types, error handling)
- [ ] Code follows Google TS Style Guide (naming, formatting, comments)
- [ ] JSDoc comments added for all exported members
- [ ] Error handling is comprehensive with logging
- [ ] No floating promises or unhandled rejections
- [ ] VS Code API used correctly with proper disposables
- [ ] **Tests use constants for irrelevant values (MANDATORY)**
- [ ] **Tests follow Arrange-Act-Assert pattern with comments (MANDATORY)**
- [ ] **Tests abstract irrelevant details with factories/helpers (MANDATORY)**
- [ ] **Tests contain no logic (no conditionals, loops, complex calculations) (MANDATORY)**
- [ ] **Common test structures are parameterized (MANDATORY)**
- [ ] **Tests prioritize DAMP over DRY for readability (MANDATORY)**
- [ ] **Tests follow Google Testing Blog principles (MANDATORY)**
- [ ] VS Code API used correctly with proper disposables

## Common Patterns in This Codebase

### Logging Pattern

```typescript
// Always create logger with createLogger()
const logger = createLogger("ComponentName");

// Log at appropriate levels
logger.debug("Detailed information", { data });
logger.info("Important events", { event });
logger.warn("Recoverable issues", { warning });
logger.error("Critical failures", error);
```

### Error Tracking Pattern

```typescript
// Always use ErrorTracker for binary operations
try {
  const result = await binaryOperation();
  errorTracker.recordSuccess(); // Reset error count
  return result;
} catch (error) {
  errorTracker.recordError(error as Error, "operationContext");
  throw error;
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

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("methodName", () => {
    it("should handle normal case", () => {
      // Arrange
      const input = "test";

      // Act
      const result = method(input);

      // Assert
      expect(result).to.equal("expected");
    });

    it("should handle error case", () => {
      // Test error handling
    });
  });
});
```

### Testing Best Practices

**MANDATORY REQUIREMENT**: All tests MUST unconditionally follow these principles. No exceptions.

These requirements apply to ALL test code without exception. Violations MUST be corrected during
code review.

#### 1. Use Constants for Irrelevant Values (MANDATORY)

**RULE**: When the presence of a value is needed but the actual value is not relevant to the test
behavior, you MUST use descriptive constants.

```typescript
// ✅ Good - Value is irrelevant to test behavior
const ANY_FILE_PATH = "/test/file.ts";
const ANY_ERROR_MESSAGE = "test error";

it("should handle file processing", () => {
  const result = processFile(ANY_FILE_PATH);
  expect(result).to.exist;
});

// ❌ Bad - Magic values distract from test intent
it("should handle file processing", () => {
  const result = processFile("/some/random/path.ts");
  expect(result).to.exist;
});
```

#### 2. Keep Tests Focused (Arrange-Act-Assert) (MANDATORY)

**RULE**: Each test MUST clearly separate the three phases with comments. No mixing of phases is
allowed.

Each test MUST have:

- **Arrange**: Set up test data and conditions
- **Act**: Execute the behavior being tested
- **Assert**: Verify the expected outcome

```typescript
// ✅ Good - Clear separation of concerns
it("should parse valid JSON findings", () => {
  // Arrange
  const jsonOutput = '{"path": "/test", "message": "error"}';
  const mockProcess = createMockProcess(1, jsonOutput);

  // Act
  const result = await parser.parse(mockProcess);

  // Assert
  expect(result).to.have.length(1);
  expect(result[0].message).to.equal("error");
});

// ❌ Bad - Unclear test structure
it("should parse valid JSON findings", () => {
  const result = await parser.parse(createMockProcess(1, '{"path": "/test", "message": "error"}'));
  expect(result).to.have.length(1);
  expect(result[0].message).to.equal("error");
});
```

#### 3. Abstract Irrelevant Details (MANDATORY)

**RULE**: Implementation details not relevant to the test behavior MUST be abstracted using factory
functions, helper functions, or constants.

Use factory functions, helper functions, or constants to hide details not relevant to the behavior
under test:

```typescript
// ✅ Good - Factory abstracts irrelevant document details
function createMockDocument(overrides: Partial<vscode.TextDocument> = {}) {
  return {
    uri: vscode.Uri.file("/test/file.ts"),
    fsPath: "/test/file.ts",
    fileName: "/test/file.ts",
    isUntitled: false,
    languageId: "typescript",
    version: 1,
    isDirty: false,
    isClosed: false,
    eol: vscode.EndOfLine.LF,
    lineCount: 10,
    getText: () => "content",
    ...overrides,
  } as unknown as vscode.TextDocument;
}

it("should lint typescript documents", () => {
  const doc = createMockDocument({ languageId: "typescript" });
  const result = linter.shouldLint(doc);
  expect(result).to.be.true;
});

// ❌ Bad - Repetitive setup obscures test intent
it("should lint typescript documents", () => {
  const doc = {
    uri: vscode.Uri.file("/test/file.ts"),
    fsPath: "/test/file.ts",
    fileName: "/test/file.ts",
    isUntitled: false,
    languageId: "typescript",
    version: 1,
    isDirty: false,
    isClosed: false,
    eol: vscode.EndOfLine.LF,
    lineCount: 10,
    getText: () => "content",
  } as unknown as vscode.TextDocument;
  const result = linter.shouldLint(doc);
  expect(result).to.be.true;
});
```

#### 4. No Logic in Tests (MANDATORY)

**RULE**: Tests MUST NOT contain conditional logic, loops, or complex calculations. Parameterize
instead.

Tests should not contain conditional logic, loops, or complex calculations. If you need these, the
test is too complex or should be parameterized:

```typescript
// ✅ Good - No logic, clear test intent
it("should handle exit code 0", async () => {
  const mockProcess = createMockProcess(0, "output", "");
  const result = await handler.execute(mockProcess);
  expect(result).to.equal("output");
});

it("should handle exit code 1", async () => {
  const mockProcess = createMockProcess(1, "output", "");
  const result = await handler.execute(mockProcess);
  expect(result).to.equal("output");
});

// ❌ Bad - Logic obscures what's being tested
it("should handle different exit codes", async () => {
  for (const exitCode of [0, 1]) {
    const mockProcess = createMockProcess(exitCode, "output", "");
    const result = await handler.execute(mockProcess);
    expect(result).to.equal("output");
  }
});
```

#### 5. Parameterize Tests with Common Structure (MANDATORY)

**RULE**: When multiple tests share the same structure but differ only in input/output, you MUST use
parameterized tests.

When multiple tests share the same structure but differ only in input/output, use parameterized
tests:

```typescript
// ✅ Good - Parameterized test with clear data
[
  { scheme: "file", expected: true, description: "file scheme" },
  { scheme: "untitled", expected: false, description: "untitled scheme" },
  { scheme: "git", expected: false, description: "git scheme" },
].forEach(({ scheme, expected, description }) => {
  it(`should return ${expected} for ${description}`, () => {
    const doc = createMockDocument({ uri: vscode.Uri.parse(`${scheme}:/path`) });
    expect(shouldLint(doc)).to.equal(expected);
  });
});

// ❌ Bad - Repetitive tests
it("should return true for file scheme", () => {
  const doc = createMockDocument({ uri: vscode.Uri.parse("file:/path") });
  expect(shouldLint(doc)).to.equal(true);
});

it("should return false for untitled scheme", () => {
  const doc = createMockDocument({ uri: vscode.Uri.parse("untitled:/path") });
  expect(shouldLint(doc)).to.equal(false);
});

it("should return false for git scheme", () => {
  const doc = createMockDocument({ uri: vscode.Uri.parse("git:/path") });
  expect(shouldLint(doc)).to.equal(false);
});
```

#### 6. Keep Tests DAMP (Descriptive And Meaningful Phrases) (MANDATORY)

**RULE**: Tests MUST prioritize readability over DRY (Don't Repeat Yourself). Clarity is
non-negotiable.

DAMP promotes readability over DRY (Don't Repeat Yourself) in tests:

- **To maintain code, you first need to understand it**
- **To understand it, you have to read it**
- **Consider how much time you spend reading code - it's a lot**
- **DAMP increases maintainability by reducing time to read and understand**

```typescript
// ✅ Good - DAMP: Clear what's being tested
it("should create diagnostic with correct severity", () => {
  const finding = createFinding({ message: "Lines not sorted" });
  const diagnostic = converter.toDiagnostic(finding);
  expect(diagnostic.severity).to.equal(vscode.DiagnosticSeverity.Warning);
});

it("should create diagnostic with correct message", () => {
  const finding = createFinding({ message: "Lines not sorted" });
  const diagnostic = converter.toDiagnostic(finding);
  expect(diagnostic.message).to.equal("Lines not sorted");
});

// ❌ Bad - Too DRY, unclear what each test verifies
function testDiagnosticProperty(property: string, expectedValue: unknown) {
  const finding = createFinding({ message: "Lines not sorted" });
  const diagnostic = converter.toDiagnostic(finding);
  expect(diagnostic[property]).to.equal(expectedValue);
}

it("diagnostic severity", () =>
  testDiagnosticProperty("severity", vscode.DiagnosticSeverity.Warning));
it("diagnostic message", () => testDiagnosticProperty("message", "Lines not sorted"));
```

#### 7. Follow Google Testing Blog Guidance (MANDATORY)

**RULE**: All tests MUST follow principles from the authoritative Google Testing Blog.

Reference the authoritative testing guidance at: **https://testing.googleblog.com/**

Key principles from Google Testing Blog:

- **Test Behavior, Not Implementation**: Focus on what the code does, not how it does it
- **Write Clear Test Names**: Test names should describe the expected behavior
- **Keep Tests Independent**: Each test should run in isolation
- **Make Tests Deterministic**: Tests should always produce the same result
- **Test One Thing**: Each test should verify a single behavior
- **Make Failures Clear**: When a test fails, it should be obvious what went wrong

```typescript
// ✅ Good - Test name describes behavior clearly
it("should skip documents with untitled scheme", () => {
  const untitledDoc = createMockDocument({
    uri: vscode.Uri.parse("untitled:Untitled-1"),
  });
  expect(shouldLint(untitledDoc)).to.be.false;
});

// ❌ Bad - Test name describes implementation
it("should check document.uri.scheme property", () => {
  const doc = createMockDocument();
  shouldLint(doc);
  expect(doc.uri.scheme).to.exist;
});
```

## Version History

- **2025-10-23**: Initial version with mandatory requirements
- **2025-10-23**: Added comprehensive testing best practices section

## Questions?

If requirements are unclear or conflict with each other, prefer this priority:

1. **Test coverage** - Every file must have tests
2. **Type safety** - No `any`, explicit types
3. **Documentation** - Keep docs synchronized
4. **Style guide** - Follow Google TS conventions
5. **Best practices** - Clean, maintainable code

When in doubt, look at existing code in the repository for examples of the preferred patterns.
