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

2. **Set up the clone**. This installs dependencies, which enables the
   [husky](https://typicode.github.io/husky/) Git hooks (pre-commit runs `npm run check`; commit-msg
   checks for Conventional Commits), installs the recommended VS Code extensions, and builds the
   project:

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
   npm run check     # Check that docs, settings, and commands agree; generated agent docs are current
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
- After changing the option metadata, the language table, or the AI tool specs, run `npm run gen:ai`
  to regenerate `docs/ai/options.md`, the comment syntax table, and the
  `keep-sorted.wrap.preferences` schema and `languageModelTools` in `package.json`; `npm run check`
  fails until you do
- Agent evals live in `src/test/ai/evals/`: `npm run test:ai-evals` runs the automated layer, and
  its README describes manual agent runs

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
husky `commit-msg` hook, enabled by `npm install`, checks them with commitlint.

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
by hand on `main`. It defaults to a dry run that prints the next version and release notes:

```sh
gh workflow run publish.yml --ref main -f dry-run=false                     # release
gh workflow run publish.yml --ref main -f dry-run=false -f pre-release=true # pre-release
```

After checking that CI passed on the commit, a run:

1. Computes the version from the commits since the last `v*` tag. Without `fix` or `feat` commits it
   publishes nothing.
2. Tags `vX.Y.Z` and creates a GitHub release with the notes and the packaged VSIX. Released issues
   and pull requests get a comment and the `released` label. Releases never commit: the version is
   written into `package.json` in the CI workspace only, so the tag is the record of each release.
3. Publishes that release's VSIX to the Visual Studio Marketplace and Open VSX with
   `npm run ops -- publish --vsix` ([scripts/ops.ts](scripts/ops.ts)), at the version of the newest
   `v*` tag on the commit, skipping a registry that already has it. After a partial failure, use
   **Re-run failed jobs**: the commit already carries the tag, so the rerun publishes it to the
   remaining registries.

`pre-release` publishes on the odd minor line and marks the release as a pre-release on both
registries and on GitHub. Its issues and pull requests also get the `released` label, so a later
release does not label them again. Registries accept only `major.minor.patch` versions, so the odd
minor, rather than a suffix like `-beta.1`, is what separates pre-releases.

`npm run ops -- publish --dry-run` packages the VSIX and lists the registries that do not have the
version yet, from any machine.

### Release Credentials

The workflows store no secrets. Each job exchanges its GitHub OIDC token (`id-token: write`) for
short-lived credentials:

| Credential            | Used by                                        | Issued under                                                                                    |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GitHub token for tags | The `semantic-release` action in `publish.yml` | Octo STS trust policy [release.sts.yaml](.github/chainguard/release.sts.yaml)                   |
| Registry credentials  | The publish job of `publish.yml`               | Each registry's [trusted publishers](#trusted-publishing), which name the `release` environment |

GitHub rejects tag creation by `GITHUB_TOKEN` under a ruleset that restricts it, so tags go through
the [Octo STS](https://github.com/octo-sts/app) GitHub App, which mints a token when a job's OIDC
token matches a trust policy in `.github/chainguard/`. Setup:

1. [Install the Octo STS app](https://github.com/apps/octo-sts/installations/new) on this
   repository.
2. Add a ruleset that restricts creating, updating, and deleting `v*` tags, with the app as a bypass
   actor.
3. Restrict the `release` environment to `main`. The registries trust only jobs in it.

Octo STS reads trust policies from the default branch (`main`). The policy matches the owner and
repository IDs in the OIDC subject, the branch, and the exact workflow file.

The tagging job runs outside the `release` environment, so semantic-release and its plugins never
hold an OIDC token that a registry accepts; the publish job, in the environment, publishes the
GitHub release's VSIX. Both jobs install dependencies with `--ignore-scripts`.

semantic-release and its plugins are locked in
[.github/actions/semantic-release/package-lock.json](.github/actions/semantic-release/package-lock.json),
apart from the root workspace. To update them, edit that directory's `package.json` and run
`npm install --package-lock-only --ignore-scripts` there.

### Trusted Publishing

Every registry is reached with trusted publishing: the job's GitHub OIDC token is exchanged for
short-lived credentials. Each registry must list this repository, `publish.yml`, and the `release`
environment as a trusted publisher:

| Registry            | Where to configure it                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| VS Code Marketplace | The `awalsh128` publisher's trusted publishers; `vsce publish --oidc` exchanges the token.                                                        |
| Open VSX            | The namespace's [trusted publishers](https://open-vsx.org/user-settings/trusted-publishers); `ops.ts` exchanges the token for a publishing token. |

Run a dry run of the workflow after changing `release.config.cjs`. A dry run checks the
configuration but does not publish.

### Manual

[scripts/ops.ts](scripts/ops.ts) handles the other release operations; see
[scripts/README.md](scripts/README.md#opsts) for details.

```bash
npm run ops -- list                            # versions on each registry
npm run ops -- deprecate --replacement publisher.other
```

The publisher pages are also available for manual changes:

- https://marketplace.visualstudio.com/manage/publishers/awalsh128
- https://open-vsx.org/

## License

By contributing to this project, you agree that your contributions will be licensed under the
Apache-2.0 License.
