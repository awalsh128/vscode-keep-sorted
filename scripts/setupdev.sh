#!/bin/bash
# VS Code Keep Sorted Extension - Development Environment Setup
set -e

echo "🚀 Setting up VS Code Keep Sorted development environment..."

# Prerequisites check
command -v node >/dev/null 2>&1 || { echo "❌ Node.js required. Install from https://nodejs.org/"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm required. Install Node.js from https://nodejs.org/"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_VERSION" -lt 18 ] && { echo "❌ Node.js 18+ required. Current: $(node -v)"; exit 1; }

echo "✅ Node.js $(node -v) and npm $(npm -v)"

# Clean install
echo "📦 Installing dependencies..."
rm -rf node_modules package-lock.json 2>/dev/null || true
npm cache clean --force >/dev/null 2>&1
npm install --silent

# Build and verify
echo "🔨 Building project..."
npm run compile --silent
npm run lint --silent
[ -f "scripts/create-binaries.ts" ] && npm run create-binaries --silent

# Environment setup
[ ! -f ".env" ] && echo "NODE_ENV=development" > .env

echo "🎉 Setup complete! Run 'code .' then press F5 to debug."
