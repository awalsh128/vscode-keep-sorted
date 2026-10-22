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

### `ops.ts`

Release operations for Open VSX and the Visual Studio Marketplace. The **Publish Extension**
workflow runs `publish`; the other commands are for maintainers.

```bash
npm run ops -- list                          # versions on each registry
npm run ops -- publish --dry-run             # package only; add --pre-release if needed
npm run ops -- delete-versions --before 1.0.0  # show older versions that would be deleted
npm run ops -- delete-versions 0.0.1 --yes   # delete specific versions
npm run ops -- deprecate --replacement publisher.other --reason "Renamed"
```

- `publish` packages the `package.json` version once and publishes that VSIX to each registry that
  does not have it yet, so a rerun after a partial failure only fills the gap.
- `delete-versions` deletes permanently: neither registry can hide a single version, and a deleted
  version number can never be published again. Without `--yes` it only prints the plan. It refuses
  the `package.json` version and each registry's latest version.
- `deprecate` prints the request text to submit by hand, since neither registry has a deprecation
  API: a comment on the Marketplace
  [Deprecated extensions discussion](https://github.com/microsoft/vscode-discussions/discussions/1)
  and an issue on [EclipseFdn/open-vsx.org](https://github.com/EclipseFdn/open-vsx.org/issues/new).

`publish` and `delete-versions --yes` read `VSCE_PAT` (Marketplace) and `OVSX_PAT` (Open VSX).

### `sync-labels.ts`

Synchronizes GitHub repository labels from a YAML configuration file.

**What it does:**

- Reads label configuration from `.github/labels.yaml`
- Creates, updates, or verifies GitHub repository labels
- Uses GitHub API to manage labels automatically

**Usage:**

```bash
# Set required environment variables:
export GITHUB_TOKEN=your_github_token
export GITHUB_REPOSITORY=owner/repo

npx tsx scripts/sync-labels.ts
```

## Testing

Scripts have corresponding test files in the `test/` subdirectory:

- `test/create-binaries.test.ts`
- `test/sync-labels.test.ts`
- `test/dev.test.ts`
- `test/ops.test.ts`
- `test/packaging.test.ts` (checks the `vsce ls` file list; not tied to one script)

Run tests with:

```bash
npm run test:scripts
```
