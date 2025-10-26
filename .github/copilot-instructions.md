# GitHub Copilot Instructions

## MANDATORY COMPLIANCE REQUIRED

All AI assistants and developers working on vscode-keep-sorted MUST follow the comprehensive
guidelines in **AI_GUIDELINES.md**.

**NO EXCEPTIONS. NO COMPROMISES. NO DEVIATIONS.**

## Quick Reference

**BEFORE ANY CHANGES:**

- [ ] Every `.ts` file WILL have its corresponding `.test.ts` file
- [ ] Update SOURCE_CODE.md for code structure changes
- [ ] Update README.md for behavior changes
- [ ] Follow the 7 mandatory testing principles

## Enforcement

All changes MUST pass:

```bash
npm test       # All tests must pass
npm run lint   # No linting errors
npm run compile # No TypeScript errors
```

**📋 For complete requirements, examples, and enforcement rules, see AI_GUIDELINES.md**
