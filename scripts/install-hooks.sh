#!/usr/bin/env bash
# Install Git hooks for the repository

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SCRIPT_DIR="$REPO_ROOT/scripts"

echo "Installing Git hooks..."

# Check if we're in a git repository
if [ ! -d "$HOOKS_DIR" ]; then
    echo "Error: Not in a Git repository or .git/hooks directory not found"
    exit 1
fi

# Install pre-commit hook
if [ -f "$HOOKS_DIR/pre-commit" ]; then
    echo -e "${YELLOW}⚠ pre-commit hook already exists, backing up to pre-commit.backup${NC}"
    cp "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/pre-commit.backup"
fi

cp "$SCRIPT_DIR/pre-commit" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
echo -e "${GREEN}✓${NC} Installed pre-commit hook"

echo ""
echo -e "${GREEN}✓ Git hooks installed successfully!${NC}"
echo ""
echo "The pre-commit hook will now run automatically before each commit to:"
echo "  - Format Go code (gofmt)"
echo "  - Run Go vet"
echo "  - Run ESLint on TypeScript/JavaScript files"
echo "  - Run TypeScript type checking"
echo ""
echo "To bypass the hook for a specific commit (not recommended):"
echo "  git commit --no-verify"
