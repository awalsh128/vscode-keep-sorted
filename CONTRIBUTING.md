# Contributing to vscode-keep-sorted

Thank you for your interest in contributing to the vscode-keep-sorted VS Code extension! This
document provides guidelines for contributing to the project.

## Prerequisites

Before contributing, ensure you have:

- [Node.js](https://nodejs.org/) (22.13.0+ on the Node 22 line; Node.js 24 is recommended and used
  by CI)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Go](https://golang.org/) (version 1.23.1 or higher) - required for building binaries

## Getting Started

1. **Fork and clone** the repository:

   ```bash
   git clone https://github.com/your-username/vscode-keep-sorted.git
   cd vscode-keep-sorted
   ```

2. **Set up the clone**. This installs dependencies, enables the Git hooks (pre-commit runs
   `npm run check`; commit-msg checks for Conventional Commits), installs the recommended VS Code
   extensions, and builds the project:

   ```bash
   npm run setup
   ```

3. **Run tests** to ensure everything works:
   ```bash
   npm test
   ```

## Development Workflow

### Code Standards

This project follows strict development guidelines. **All contributions must comply with the
requirements in [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md)**.

#### Key Requirements:

- **Test Coverage**: Every `.ts` file MUST have a corresponding `.test.ts` file
- **TypeScript Standards**: Strict typing, explicit return types, proper error handling
- **Documentation**: Update relevant docs when making changes
- **Code Quality**: All tests must pass, no linting errors

### Making Changes

1. **Create a branch** for your feature or fix:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Write tests first** - Every new `.ts` file needs a `.test.ts` file in `src/test/` or
   `scripts/test/`

3. **Make your changes** following the coding standards

4. **Run the validation commands**:

   ```bash
   npm run lint      # Check for linting errors
   npm run compile   # Check for TypeScript errors
   npm test          # Run all tests (must pass)
   npm run test:scripts # Also run when changing scripts
   npm run check     # Check that docs, settings, and commands agree
   ```

5. **Update documentation** if needed:
   - Update `README.md` for user-facing changes
   - Update `docs/SOURCE_CODE.md` for code structure changes

### Testing

For manual testing, run `npm run dev`. It compiles the local code and opens a separate VS Code
Extension Development Host on the test workspace, without installing a VSIX or running tests.
Downloads stable VS Code to `~/.cache/vscode-keep-sorted` (or `$XDG_CACHE_HOME`) when not already
cached. Its profile and extensions are isolated from your normal editor under `.vscode-test/`. Close
the window to finish the command. The test workspace enables the extension; enable the save action
separately when testing sort-on-save.

- Tests are written using **Mocha + Chai + Sinon**
- Test files go in `src/test/` with `.test.ts` extension
- Run tests with: `npm test`. Each run uses a fresh temporary VS Code profile. The first
  sort-on-save test may wait up to 90 seconds while VS Code finishes installing save participants in
  an unfocused window.
- Use VS Code's test runner for debugging tests

### Building Binaries

To build the keep-sorted CLI binaries:

```bash
npm run create-binaries
```

This downloads and builds binaries for all supported platforms.

## Pull Request Process

1. **Ensure all tests pass** and there are no linting errors
2. **Create a clear pull request** with:
   - Descriptive title and summary
   - Reference any related issues
   - Explain what changes were made and why
3. **Wait for review** - maintainers will review and provide feedback
4. **Address feedback** and update your PR as needed

## Code of Conduct

- Be respectful and constructive in all interactions
- Follow the project's coding standards
- Test your changes thoroughly
- Keep pull requests focused and atomic

## Getting Help

- Check the [README.md](README.md) for usage information
- Review [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) for detailed development requirements
- Open an issue if you need clarification on requirements
- Look at existing tests for examples

## Publishing

Releases are versioned by [semantic-release](https://semantic-release.gitbook.io/) from commit
messages, so commits must follow [Conventional Commits](https://www.conventionalcommits.org/); the
`commit-msg` hook installed by `npm run setup` checks them with commitlint.

| Commit                                                       | Calls for |
| ------------------------------------------------------------ | --------- |
| `fix: ...`, `perf: ...`                                      | patch     |
| `feat: ...`                                                  | minor     |
| `feat!: ...` or a `BREAKING CHANGE:` footer                  | major     |
| `docs:`, `ci:`, `chore:`, `refactor:`, `test:`, `build:` ... | none      |

Versions follow VS Code's
[pre-release convention](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions):
releases use even minor versions (1.0.x, 1.2.x) and pre-releases odd ones (1.1.x, 1.3.x).
[scripts/release-version.ts](scripts/release-version.ts) turns the commits into a bump that keeps
that split:

| Last version | Run         | Commits             | Next version    |
| ------------ | ----------- | ------------------- | --------------- |
| 1.0.2        | pre-release | `fix` or `feat`     | 1.1.0           |
| 1.1.0        | pre-release | `fix` or `feat`     | 1.1.1           |
| 1.1.1        | release     | any, including none | 1.2.0 (promote) |
| 1.2.0        | release     | `fix`               | 1.2.1           |
| any          | release     | breaking            | next major      |

Features go out as a pre-release first: a release run refuses `feat` commits after a release, since
it would have to skip an odd minor. Breaking changes ship as a release, not a pre-release.

Start the
[Publish Extension workflow](https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/publish.yml)
by hand. It defaults to a dry run that prints the next version and release notes:

```bash
gh workflow run publish.yml -f dry_run=false                     # release
gh workflow run publish.yml -f dry_run=false -f pre_release=true # pre-release
```

After CI passes, a release run:

1. Computes the version from the commits since the last `v*` tag. With no `fix` or `feat` commits,
   it publishes nothing.
2. Packages the VSIX with that version and publishes it to the Visual Studio Marketplace and Open
   VSX ([semantic-release-vsce](https://github.com/felipecrs/semantic-release-vsce)).
3. Commits the new `package.json` version as `chore(release): X.Y.Z [skip ci]`, tags it `vX.Y.Z`,
   and creates a GitHub release with the notes and the VSIX. Released issues and pull requests get a
   comment and the `released` label.

`pre_release` publishes on the odd minor line and marks the release as a pre-release on both
registries and on GitHub. Registries accept only `major.minor.patch` versions, so the odd minor,
rather than a suffix like `-beta.1`, is what separates pre-releases.

Open VSX uses trusted publishing: the `awalsh128` namespace registers this repository and
`publish.yml` at [trusted publishers](https://open-vsx.org/user-settings/trusted-publishers), and
`npm run ops -- openvsx-token` exchanges the job's GitHub OIDC token for a short-lived publishing
token that semantic-release-vsce reads as `OVSX_PAT`. No Open VSX secret is stored.

The Marketplace does not offer trusted publishing yet, so it uses the `VS_MARKETPLACE_TOKEN` secret.
`VS_MARKETPLACE_TOKEN` must be an Azure DevOps PAT created for **All accessible organizations** with
the **Marketplace (Manage)** scope (a PAT for one organization fails with `TF400813`). Azure DevOps
stops supporting such PATs on December 1, 2026.

If publishing fails after the tag is pushed, rerunning the workflow does not publish again, because
the version is already tagged. Check out the tag and run `npm run ops -- publish` (add
`--pre-release` for an odd minor), which publishes only to registries that do not have the version
yet.

### Manual

[scripts/ops.ts](scripts/ops.ts) handles manual publishing and the other release operations; see
[scripts/README.md](scripts/README.md#opsts) for details.

```bash
npm run ops -- list                            # versions on each registry
npm run ops -- delete-versions --before 1.0.0  # dry run; add --yes to delete
npm run ops -- deprecate --replacement publisher.other
```

Publishing or deleting versions from a workstation needs `OVSX_PAT`, and `VSCE_PAT` or an
interactive Azure DevOps sign-in. The publisher pages are also available for manual changes:

- https://marketplace.visualstudio.com/manage/publishers/awalsh128
- https://open-vsx.org/
- https://dev.azure.com/awalsh128/vscode-keep-sorted

## License

By contributing to this project, you agree that your contributions will be licensed under the
Apache-2.0 License.
