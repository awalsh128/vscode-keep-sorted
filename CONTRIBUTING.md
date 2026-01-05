# Contributing to vscode-keep-sorted

Thank you for your interest in contributing to the vscode-keep-sorted VS Code extension! This
document provides guidelines for contributing to the project.

## Prerequisites

Before contributing, ensure you have:

- [Node.js](https://nodejs.org/) (version 18 or higher)
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
requirements in [AI_GUIDELINES.md](AI_GUIDELINES.md)**.

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
   ```

5. **Update documentation** if needed:
   - Update `README.md` for user-facing changes
   - Update `SOURCE_CODE.md` for code structure changes

### Testing

- Tests are written using **Mocha + Chai + Sinon**
- Test files go in `src/test/` with `.test.ts` extension
- Run tests with: `npm test`
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
- Review [AI_GUIDELINES.md](AI_GUIDELINES.md) for detailed development requirements
- Open an issue if you need clarification on requirements
- Look at existing tests for examples

## Publishing

Prefer to use the GitHub workflow for packaging and publishing the extension. Note, it is very
important to verify the version is accurate as packages are immutable. It is still possible to
manually delete packages but this is heavily discouraged as it can cause unforeseen problems for
users.

https://github.com/awalsh128/vscode-keep-sorted/actions/workflows/publish.yml

### Manual

New VSIX files can be manually updated through these sites (drag and drop) for both Microsoft
Marketplace and OpenVSX registry.

- https://marketplace.visualstudio.com/manage/publishers/awalsh128
- https://open-vsx.org/
- https://dev.azure.com/awalsh128/vscode-keep-sorted

To manually create VSCode extension packages
([also see MS docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)):

```bash
npm install -g @vscode/vsce
vsce package
vsce publish
```

## License

By contributing to this project, you agree that your contributions will be licensed under the
Apache-2.0 License.
