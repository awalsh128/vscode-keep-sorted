# VS Code Keep-Sorted Extension

This VS Code extension provides linting and auto-fixing capabilities for sorting lines using Google's keep-sorted tool.

## Project Structure
- Extension wraps the keep-sorted binary for line sorting
- Provides diagnostics for unsorted lines  
- Offers code actions to fix sorting issues
- Bundles keep-sorted binary for standalone operation
- Built with TypeScript and esbuild
- Includes automated binary download for multiple platforms

## Development Guidelines
- Use TypeScript for extension development
- Follow VS Code extension best practices
- Test with various file types and sorting scenarios
- Ensure keep-sorted binary is properly packaged
- The extension activates on any language and provides real-time linting
- Configuration options allow users to customize behavior

## Key Features
- Real-time diagnostics for unsorted keep-sorted blocks
- Quick fix code actions to apply sorting
- Commands for manual linting and fixing
- Auto-fix on save functionality
- Cross-platform binary distribution
- Configurable through VS Code settings