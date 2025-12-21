#!/bin/sh
#
# Setup script to configure git hooks for the MarkSyncr project
# Run this after cloning the repository: ./scripts/setup-hooks.sh

echo "🔧 Setting up git hooks..."

# Configure git to use the .githooks directory (which is tracked by git)
git config core.hooksPath .githooks

echo "✅ Git hooks configured successfully!"
echo ""
echo "Git is now using hooks from the .githooks/ directory."
echo "The following hooks are active:"
echo "  - pre-commit: Runs build and tests before each commit"
