#!/usr/bin/env bash
# Links the copy-review skill into ~/.claude/skills so /copy-review works in every project.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)/skill/copy-review"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/copy-review"
mkdir -p "$(dirname "$DEST")"
if [ -L "$DEST" ]; then
  rm "$DEST"
elif [ -e "$DEST" ]; then
  echo "$DEST already exists and is not a symlink. Move it aside and run again." >&2
  exit 1
fi
ln -s "$SRC" "$DEST"
echo "Linked $DEST -> $SRC"
echo "Run /copy-review in any project."
