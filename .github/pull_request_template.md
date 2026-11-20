## Summary

Describe what changed and why.

Closes #

## Type of change

Use the matching Conventional Commits prefix in the PR title (`fix:`, `feat:`, `docs:`, `refactor:`,
`perf:`, `test:`, `build:`, `ci:`, `chore:`), and add `!` for a breaking change.

- [ ] `fix` or `perf`: bug fix or speedup (patch)
- [ ] `feat`: new feature (minor)
- [ ] `docs`, `refactor`, `test`, `build`, `ci` or `chore`: no release on its own

**Breaking change:** yes / no

Answer even when the answer is no. It's breaking if anyone using this has to change something after
upgrading: a removed or renamed export, input, output, CLI flag or config key, a changed default or
behavior they rely on, or a raised minimum runtime version (`engines`, Node). If yes, add `!` to the
title (`feat!:`) and a `BREAKING CHANGE:` footer saying what users must change.

## Implementation notes

Call out important design choices, tradeoffs, or migration details.

## Validation

List the commands you ran and their results.

```bash
# e.g. npm test, npm run lint, npm run compile, npm run check, npm run format:check
```

## Checklist

- [ ] I followed the
      [contribution guide](https://github.com/awalsh128/vscode-keep-sorted/blob/main/CONTRIBUTING.md).
- [ ] I added or updated tests where needed.
- [ ] I updated docs or comments where needed.
- [ ] Workflow and action changes keep pinned commit SHAs.
- [ ] No secrets were introduced.
