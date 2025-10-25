#!/bin/bash

# VS Code Keep Sorted Extension - Development Environment Setup
# This script sets up all dependencies and configurations needed for development

set -e  # Exit on any error

echo "🚀 Setting up VS Code Keep Sorted development environment..."

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js version (require Node 18+)
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node -v)"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js $(node -v) and npm $(npm -v) found"

# Clean previous installations
echo "🧹 Cleaning previous installations..."
rm -rf node_modules package-lock.json
npm cache clean --force

# Install all dependencies
echo "📦 Installing all project dependencies..."
npm install

# Install additional VS Code testing dependencies if not already present
echo "🔧 Installing additional development dependencies..."
ADDITIONAL_PACKAGES=(
  @vscode/test-electron
)

for package in "${ADDITIONAL_PACKAGES[@]}"; do
    if ! npm list "$package" &> /dev/null; then
        echo "   Installing $package..."
        npm install --save-dev "$package"
    else
        echo "   ✅ $package already installed"
    fi
done

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

# Run linting
echo "🔍 Running linting checks..."
npm run lint

# Create binaries if script exists
if [ -f "scripts/create-binaries.ts" ]; then
    echo "⚙️  Creating binaries..."
    npm run create-binaries
fi

# Verify VS Code extension host can be found
echo "🧪 Verifying VS Code extension environment..."
if command -v code &> /dev/null; then
    echo "✅ VS Code CLI found: $(code --version | head -n1)"
else
    echo "⚠️  VS Code CLI not found in PATH. Extension debugging may require manual setup."
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📄 Creating .env file..."
    cat > .env << 'EOF'
# Development environment variables
# Add any environment-specific configurations here
NODE_ENV=development
EOF
    echo "✅ Created .env file"
fi

# Success message
echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "Next steps:"
echo "  1. Open this folder in VS Code: code ."
echo "  2. Install recommended extensions when prompted"
echo "  3. Press F5 to start debugging the extension"
echo "  4. Run tests with: npm test (when test script is added)"
echo ""
echo "Available commands:"
echo "  npm run compile  - Compile TypeScript"
echo "  npm run watch    - Watch and compile TypeScript"
echo "  npm run lint     - Run ESLint"
echo "  npm run create-binaries - Create binary dependencies"
echo ""
