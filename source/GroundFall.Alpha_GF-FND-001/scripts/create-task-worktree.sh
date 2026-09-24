#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <task-id> [base-revision]" >&2
  exit 2
fi
TASK_ID="$1"
BASE_REV="${2:-HEAD}"
ROOT="$(git rev-parse --show-toplevel)"
PARENT="$(dirname "$ROOT")/GroundFall.Alpha-worktrees"
SAFE="$(printf '%s' "$TASK_ID" | tr -cs 'A-Za-z0-9._-' '-')"
BRANCH="task/$SAFE"
DEST="$PARENT/$SAFE"
mkdir -p "$PARENT"
if [[ -e "$DEST" ]]; then
  echo "Worktree destination already exists: $DEST" >&2
  exit 3
fi
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Task branch already exists: $BRANCH" >&2
  exit 4
fi
git worktree add -b "$BRANCH" "$DEST" "$BASE_REV"
printf 'task_id=%s\nbranch=%s\nbase_revision=%s\nworktree=%s\n' "$TASK_ID" "$BRANCH" "$(git -C "$DEST" rev-parse HEAD)" "$DEST"
