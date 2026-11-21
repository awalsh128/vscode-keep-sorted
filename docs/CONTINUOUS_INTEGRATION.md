# Continuous Integration

The extension is an editor front end for keep-sorted and adds no sorting rules of its own, so CI
should run the [keep-sorted CLI](https://github.com/google/keep-sorted#usage) directly. Pin the same
version the extension bundles (e.g.`v0.10.0`) so CI and the editor agree.

In lint mode, keep-sorted exits with status 1 when any block is unsorted. This workflow fails the
check:

```yaml
name: keep-sorted
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-go@v6
        with:
          go-version: stable
      - run: go install github.com/google/keep-sorted@v0.10.0
      - run: git ls-files -z | xargs -0 -r keep-sorted --mode lint
```

To sort instead and commit the result, run the default fix mode, which rewrites files in place, and
commit any changes:

```yaml
name: keep-sorted
on:
  push:
    branches-ignore: [main]

permissions:
  contents: write

jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-go@v6
        with:
          go-version: stable
      - run: go install github.com/google/keep-sorted@v0.10.0
      - run: git ls-files -z | xargs -0 -r keep-sorted
      - run: |
          git diff --quiet && exit 0
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -am "Sort keep-sorted blocks"
          git push
```

Pushes made with the default `GITHUB_TOKEN` do not start new workflow runs, and the fix workflow
cannot push to pull requests from forks; use the lint workflow to check those. For local hooks, see
upstream's [pre-commit configuration](https://github.com/google/keep-sorted#pre-commit).

[Back to the README](../README.md)
