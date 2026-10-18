#!/usr/bin/env bash
# Links the copyproof skill into ~/.claude/skills so /copyproof works in every project.
# Also removes the link left by the old name, copy-review.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)/skill/copyproof"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/copyproof"
mkdir -p "$(dirname "$DEST")"
OLD="$(dirname "$DEST")/copy-review"
[ -L "$OLD" ] && rm "$OLD"
if [ -L "$DEST" ]; then
  rm "$DEST"
elif [ -e "$DEST" ]; then
  echo "$DEST already exists and is not a symlink. Move it aside and run again." >&2
  exit 1
fi
ln -s "$SRC" "$DEST"
echo "Linked $DEST -> $SRC"
echo "Run /copyproof in any project."
