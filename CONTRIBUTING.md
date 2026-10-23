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

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build the project**:

   ```bash
   npm run compile
   ```

4. **Run tests** to ensure everything works:
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

2. **Write tests first** - Every new `.ts` file needs a `.test.ts` file in `src/test/`

3. **Make your changes** following the coding standards

4. **Run the validation commands**:

   ```bash
   npm run lint      # Check for linting errors
   npm run compile   # Check for TypeScript errors
   npm test          # Run all tests (must pass)
   npm run test:scripts # Also run when changing scripts
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

Prefer the
[Publish Extension workflow](https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/publish.yml),
which runs `npm run ops -- publish` for each GitHub release (manual runs default to a dry run).
Verify the `package.json` version first: published versions are immutable, and a deleted version
number can never be reused.

The workflow publishes to Open VSX with the `OPEN_VSX_TOKEN` secret and to the Visual Studio
Marketplace with [trusted publishing](https://github.com/microsoft/vscode-vsce#trusted-publishing)
(`vsce publish --oidc`), so no Marketplace token is stored. This requires a trusted publishing
policy on the
[awalsh128 publisher](https://marketplace.visualstudio.com/manage/publishers/awalsh128) for the
`awalsh128/vscode-keep-sorted` repository and the `publish.yml` workflow.

### Manual

[scripts/ops.ts](scripts/ops.ts) handles the other release operations; see
[scripts/README.md](scripts/README.md#opsts) for details.

```bash
npm run ops -- list                            # versions on each registry
npm run ops -- delete-versions --before 1.0.0  # dry run; add --yes to delete
npm run ops -- deprecate --replacement publisher.other
```

Publishing or deleting versions from a workstation needs `VSCE_PAT` and `OVSX_PAT`. The publisher
pages are also available for manual changes:

- https://marketplace.visualstudio.com/manage/publishers/awalsh128
- https://open-vsx.org/
- https://dev.azure.com/awalsh128/vscode-keep-sorted

## License

By contributing to this project, you agree that your contributions will be licensed under the
Apache-2.0 License.
