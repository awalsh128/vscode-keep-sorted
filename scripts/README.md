# Scripts Directory

This directory contains utility scripts for the vscode-keep-sorted project.

## Scripts

### `create-binaries.ts`

Downloads and builds the `keep-sorted` CLI binaries for multiple platforms from the upstream Go
project.

**What it does:**

- Verifies Go toolchain version (requires Go 1.23.1+)
- Builds binaries for Windows, macOS (Intel/ARM), and Linux
- Generates SHA256 checksums for each binary
- Outputs all binaries to the `bin/` directory

**Usage:**

```bash
npx tsx scripts/create-binaries.ts
```

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

Both scripts have corresponding test files in the `test/` subdirectory:

- `test/create-binaries.test.ts`
- `test/sync-labels.test.ts`

Run tests with:

```bash
npm test
```
