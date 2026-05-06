#!/bin/bash
# Pre-commit/push hook: checks if project docs might need updating
# Exit 0 = allow, exit 2 = block

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Get list of changed files (staged + unstaged)
CHANGED=$(git diff --name-only HEAD 2>/dev/null; git diff --cached --name-only 2>/dev/null)

if [ -z "$CHANGED" ]; then
  exit 0
fi

WARNINGS=""

# Check if DB schema changed but SPEC.md wasn't touched
if echo "$CHANGED" | grep -q "atelier-db.ts" && ! echo "$CHANGED" | grep -q "SPEC.md"; then
  WARNINGS="${WARNINGS}DB schema changed (atelier-db.ts) but SPEC.md not updated.\n"
fi

# Check if new API routes added but SPEC.md wasn't touched
if echo "$CHANGED" | grep -q "src/app/api/" && ! echo "$CHANGED" | grep -q "SPEC.md"; then
  WARNINGS="${WARNINGS}API routes changed but SPEC.md not updated.\n"
fi

# Check if new components added but CLAUDE.md wasn't touched
if echo "$CHANGED" | grep -q "src/components/" && ! echo "$CHANGED" | grep -q "CLAUDE.md"; then
  WARNINGS="${WARNINGS}Components changed but CLAUDE.md not updated.\n"
fi

# Check if providers changed but SPEC.md wasn't touched
if echo "$CHANGED" | grep -q "src/lib/providers/" && ! echo "$CHANGED" | grep -q "SPEC.md"; then
  WARNINGS="${WARNINGS}AI providers changed but SPEC.md not updated.\n"
fi

# Check if auth files changed
if echo "$CHANGED" | grep -qE "(solana-auth|atelier-auth|privy)" && ! echo "$CHANGED" | grep -q "SPEC.md"; then
  WARNINGS="${WARNINGS}Auth files changed but SPEC.md not updated.\n"
fi

# Check if hooks or lib structure changed
if echo "$CHANGED" | grep -q "src/hooks/" && ! echo "$CHANGED" | grep -q "CLAUDE.md"; then
  WARNINGS="${WARNINGS}Hooks changed but CLAUDE.md not updated.\n"
fi

# Check if package.json changed (new deps)
if echo "$CHANGED" | grep -q "^package.json$"; then
  WARNINGS="${WARNINGS}package.json changed -- check if new deps need documenting in CLAUDE.md.\n"
fi

if [ -n "$WARNINGS" ]; then
  echo "DOC_CHECK_WARNINGS:"
  echo -e "$WARNINGS"
  echo "Run /sync-docs to update, or proceed if docs are already current."
  exit 0
fi

exit 0
