#!/usr/bin/env bash
# SessionStart hook: fetch, then report whether this checkout is behind origin/main
# (CLAUDE.md "Parallel workflow"). Report only: never pulls, rebases or switches.
# Output: systemMessage for the user, additionalContext so Claude can offer the pull.

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

emit() {
  printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$1" "$2"
}

if ! git fetch --quiet --prune origin 2>/dev/null; then
  emit "Sync check: git fetch failed (offline?). Status vs origin/main unknown." \
       "Session-start sync check could not fetch origin; tell the user their branch status vs origin/main is unknown."
  exit 0
fi

folder=$(basename "$(git rev-parse --show-toplevel)")
branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo "detached")
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)

if [ "$behind" -eq 0 ]; then
  emit "Sync check ($folder, $branch): up to date with origin/main." \
       "Session-start sync check: $folder on $branch is up to date with origin/main."
elif [ "$branch" = "main" ]; then
  emit "Sync check ($folder): main is $behind commit(s) behind origin/main. Pull before starting." \
       "Session-start sync check: in $folder, local main is $behind commit(s) behind origin/main. Before any other work, tell the user and offer to run git pull --ff-only (do not pull without a yes)."
elif [ "$branch" = "detached" ]; then
  emit "Sync check ($folder, detached): $behind commit(s) behind origin/main." \
       "Session-start sync check: $folder is detached and $behind commit(s) behind origin/main. If this is the idle dev lane, offer git switch --detach origin/main before starting a new task (do not run it without a yes)."
else
  emit "Sync check ($folder, $branch): $behind commit(s) behind origin/main. Update before merging." \
       "Session-start sync check: in $folder, branch $branch is $behind commit(s) behind origin/main. Tell the user; the branch needs a rebase onto origin/main or GitHub's Update branch before merging (do not rebase without a yes)."
fi
