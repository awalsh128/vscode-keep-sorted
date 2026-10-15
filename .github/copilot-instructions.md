# GitHub Copilot Instructions

Read and follow [AGENTS.md](../AGENTS.md), the shared repository instructions. Its required
documentation review applies before completing every task: keep the README accurate to current code
and concise, or explain why no update is needed. Use the `docs-reviewer` agent for review when
available; otherwise perform the checklist directly.

Apply the shared Configuration Synchronization policy whenever settings change: keep the manifest,
runtime settings, regression tests, and README aligned. Editor-owned save actions are not extension
configuration properties.

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
