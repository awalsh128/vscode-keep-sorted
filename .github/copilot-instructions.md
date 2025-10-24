# GitHub Copilot Instructions

## Project Guidelines

This project has comprehensive development guidelines that **must** be followed by all AI assistants
and developers.

**📋 See [AI_GUIDELINES.md](../AI_GUIDELINES.md) for complete mandatory requirements.**

## Quick Reference

The AI_GUIDELINES.md file contains:

1. **Test Coverage Requirements** - Every TypeScript file must have its own test file
2. **Documentation Updates** - SOURCE_CODE.md, README.md, and AI_GUIDELINES.md must be kept in sync
   with code changes
3. **TypeScript Best Practices** - Type safety, error handling, async/await patterns
4. **Google TypeScript Style Guide** - Naming conventions, formatting, imports, comments
5. **Common Patterns** - Logging, error tracking, disposables, and testing patterns specific to this
   codebase
6. **Testing Best Practices (MANDATORY)** - Arrange-Act-Assert, constants for irrelevant values, no
   logic in tests, DAMP over DRY

## Before Making Changes

- [ ] Review [AI_GUIDELINES.md](../AI_GUIDELINES.md) for mandatory requirements
- [ ] Ensure every `.ts` file will have a corresponding `.test.ts` file
- [ ] Plan documentation updates for SOURCE_CODE.md if code structure changes
- [ ] Plan README.md updates if features or behavior changes
- [ ] Ensure tests follow mandatory best practices (Arrange-Act-Assert, constants, no logic)

## Code Standards

- Use Mocha + Chai + Sinon for testing
- Follow Google TypeScript Style Guide
- No `any` types - use explicit types
- All functions must have explicit return types
- Comprehensive error handling with logging
- JSDoc comments for all exported members
- Tests must use `/* eslint-disable @typescript-eslint/no-unused-expressions */` for Chai assertions

## Testing Requirements (MANDATORY)

All tests MUST unconditionally follow these principles:

1. **Use constants for irrelevant values** - Use descriptive constants like `ANY_FILE_PATH` when
   actual value doesn't matter
2. **Arrange-Act-Assert pattern** - Clear separation with comments
3. **Abstract irrelevant details** - Use factory functions and helpers
4. **No logic in tests** - No conditionals, loops, or complex calculations
5. **Parameterize common structures** - Use data-driven tests with `.forEach()`
6. **DAMP over DRY** - Prioritize readability over code reuse
7. **Follow Google Testing Blog** - See https://testing.googleblog.com/

## Enforcement

All changes must pass:

```bash
npm test       # All tests must pass
npm run lint   # No linting errors
npm run compile # No TypeScript errors
```

---

**For complete details, requirements, and examples, see [AI_GUIDELINES.md](../AI_GUIDELINES.md)**
