#!/bin/sh
#
# Setup script to install git hooks for the MarkSyncr project
# Run this after cloning the repository: ./scripts/setup-hooks.sh

HOOKS_DIR=".git/hooks"
SCRIPT_DIR="$(dirname "$0")"

echo "🔧 Setting up git hooks..."

# Create pre-commit hook
cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/sh
#
# Pre-commit hook to run build and tests before committing
# This ensures code quality and prevents broken commits

echo "🔨 Running pre-commit checks..."

# Run build
echo "📦 Building..."
pnpm build
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the errors before committing."
    exit 1
fi

# Run tests
echo "🧪 Running tests..."
pnpm test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Please fix the failing tests before committing."
    exit 1
fi

echo "✅ All pre-commit checks passed!"
exit 0
EOF

# Make the hook executable
chmod +x "$HOOKS_DIR/pre-commit"

echo "✅ Git hooks installed successfully!"
echo ""
echo "The following hooks are now active:"
echo "  - pre-commit: Runs build and tests before each commit"
