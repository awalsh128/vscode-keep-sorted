# Scripts Directory

This directory contains utility scripts for the vscode-keep-sorted project.

## Scripts

### `dev.ts`

Run `npm run dev` to compile and open the local extension in a separate Extension Development Host
on `test-workspace/`. Uses stable VS Code from `@vscode/test-electron`, downloaded if needed to
`$XDG_CACHE_HOME/vscode-keep-sorted` (default `~/.cache/vscode-keep-sorted`), with an isolated
profile and extensions directory under `.vscode-test/`. VS Code must live outside the repository: it
applies themes found inside the extension folder in place of `workbench.colorTheme`, so a copy under
`.vscode-test/` would make the window use a built-in dark theme. No tests run and no VSIX is
installed. The terminal command exits when the development window closes. The test workspace enables
the extension; sort-on-save remains opt-in. Each launch applies `DEV_PROFILE_SETTINGS` from
`dev.ts`, including `workbench.colorTheme`, because VS Code has no command-line theme option. Use a
built-in theme: the window runs with `--disable-extensions`, so Marketplace themes are unavailable.

`npm run check` (`dev.ts check`) verifies that related files agree and exits with status 1 on any
problem:

- `vX.Y.Z` versions in `README.md` and `docs/SOURCE_CODE.md` match `KEEP_SORTED_VERSION` in
  `create-binaries.ts`.
- Settings in `package.json` match the README settings table, including defaults, and the
  `KeepSortedConfiguration` interface.
- Commands in `package.json` are in the Command Palette menu and named in the README by ID and
  title.
- The `package.json` icon is a square PNG of at least 128 pixels (the Marketplace rejects SVG), and
  the README header shows it with alt text `<displayName> logo`.

The [husky](https://typicode.github.io/husky/) `.husky/pre-commit` hook runs it before each commit
(and `.husky/commit-msg` checks for Conventional Commits with commitlint), and CI runs it on pushes
and pull requests to `main`. The check reads the working tree, not only staged changes.

`npm run setup` (`npm install`, then `dev.ts setup`) prepares a fresh clone: `npm install` runs the
`prepare` script, which enables the husky hooks, then `dev.ts setup` installs the extensions
recommended in `.vscode/extensions.json` with the `code` CLI (listing them instead if the CLI is
unavailable) and compiles.

### `create-binaries.ts`

Downloads and builds the `keep-sorted` CLI binaries for multiple platforms from the upstream Go
project.

**What it does:**

- Verifies Go toolchain version (requires Go 1.23.1+)
- Builds binaries for Windows, macOS (Intel/ARM), and Linux
- Passes `GOOS`, `GOARCH`, and `CGO_ENABLED=0` directly to Go for static cross-compilation
- Sets every binary to mode `0755` on Unix hosts, including the Windows executable, regardless of
  existing permissions or the build process's umask
- Generates SHA256 checksums for each binary
- Sets checksum files to mode `0644` (non-executable)
- Outputs all binaries to the `bin/` directory
- Writes build logs to `scripts/bin-build-logs/`, outside the clone, so binaries report a clean
  version (`--version` shows the tag with Go 1.24+, otherwise the commit)

**Usage:**

```bash
npx tsx scripts/create-binaries.ts
```

After compilation, the equivalent entry point is `node out/scripts/create-binaries.js`. Both write
to the repository's `bin/` directory. The script owns all permission changes; the binary workflow
transfers a tar archive to preserve those modes across artifact downloads.

Rebuilding the bundled binaries is always intentional: the **Build Static Binaries** workflow runs
only when started manually (`gh workflow run create-binaries.yml`), then tests the script, builds
with Go 1.26, and commits `bin/`. Regular CI runs only the script's Go-free unit tests.

### `vscode-release/release-version.mts`

A semantic-release plugin shipped from gh-dev-powerpack's `vscode-extension` set (with its tests
there), not edited here. `release.config.cjs` loads it in place of
`@semantic-release/commit-analyzer`; it keeps releases on even minor versions and pre-releases
(`VSCE_PRE_RELEASE`) on odd ones, as [CONTRIBUTING.md](../CONTRIBUTING.md#publishing) describes.
Node.js 24 runs it without a build step, so `scripts/tsconfig.json` excludes it.

Labels sync from `.github/labels.yaml` with `crazy-max/ghaction-github-labeler` in the **Sync
Labels** workflow, and registry publishing uses `vsce` and `ovsx` in the **Publish Extension**
workflow, so neither has a script here.

## Testing

Scripts have corresponding test files in the `test/` subdirectory:

- `test/create-binaries.test.ts`
- `test/dev.test.ts`
- `test/packaging.test.ts` (checks the esbuild bundle and `vsce ls` file list; not tied to one
  script)

Run tests with:

```bash
npm run test:scripts
```
