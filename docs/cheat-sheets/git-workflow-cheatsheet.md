# Git Workflow Cheat Sheet

One branch → one PR → CI green → merge → clean up. Run commands in Git Bash.

> **Golden rule:** a branch carries every commit it can reach. Always start a new
> branch from an up-to-date `main`, never from another feature branch, or the PR
> will carry that branch's commits too.

---

## 0. Daily start (new day in VS Code)

```bash
git checkout main && git pull
npm ci          # NOT `npm i` — installs exactly what's committed, never edits the lockfile
```

To *update* packages, do it deliberately on a branch: `npm outdated` → `npm update`
(or a specific bump) → review the diff → PR. `npm i` does not update anything and can
leave lockfile noise (npm version differences) in your working tree.

---

## 1. Start

```bash
git checkout main && git pull           # always get the latest first
git checkout -b [branch name]           # created from main because you are ON main
```

Safer one-liner (works from any branch, order-independent):

```bash
git fetch origin
git switch -c [branch name] --no-track origin/main
```

## 2. Work

... make changes ...

## 3. Verify BEFORE committing

Run the full set. A clean exit code only counts if the check actually exercises the
change, so run all of them.

```bash
npm ci                                  # only needed after package.json / lockfile changes
npm run lint                            # whole repo (eslint .)
npm run build                           # tsc -b + vite build (catches what dev server hides)
npm run test:run                        # unit tests
npx tsc -p e2e/tsconfig.json --noEmit   # e2e type-check
npm run test:e2e:flake                  # 3x repeat, 0 retries, 1 worker (zero-flake bar)
```

Quick e2e-only lint: `npx eslint e2e; echo $?`

`test:e2e:flake` needs local Supabase running (`supabase start`, `npm run env:test`).

## 4. Stage — explicit paths only

```bash
git add [list of files to check-in]     # NEVER `git add .` or `git add -A`
git status --short                      # only intended files staged? untracked stuff still `??`?
git diff --cached --stat                # last look at exactly what will be committed
```

## 5. Commit

```bash
git commit -m "Commit message"          # imperative mood; cite SPEC § where relevant
```

## 6. Check what the PR will carry — before pushing

```bash
git log --oneline origin/main..HEAD
```

Lists exactly the commits the PR will contain. If one is not yours for this PR, stop.

## 7. Push

```bash
git push -u origin [branch name]
```

## 8. Open the PR

```bash
gh pr create --fill                     # or open the compare URL GitHub prints after the push
```

## 9. Review, wait for CI, merge

- Wait for **Lint, build, test** and **E2E (Playwright)** to go green (required by the ruleset).
- Read the Claude review comment (`claude[bot]`) and any feedback; address it on the same branch.
- Your merge is the approval.
- **Exception:** a PR that changes `.github/workflows/claude-code-review.yml` is skipped by
  the review action by design (workflow validation). It works once merged.

## 10. End where you started

```bash
git checkout main && git pull
```

## 11. Clean up

```bash
git branch -d [branch name]             # refuses if the branch isn't merged — that's the safety
git fetch --prune                       # drop remote-tracking refs for deleted remote branches
```

Tip: GitHub → Settings → General → "Automatically delete head branches" removes the
remote branch for you after merge.

---

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| PR contains commits you didn't expect | Branch was created from another feature branch | Create from `main` (§1); check with §6 before pushing |
| `git add .` staged files you didn't mean to commit | Untracked files in the tree | Explicit paths only (§4) |
| `fatal: a branch named X already exists` | You already created it (`checkout -b` and `switch -c` do the same thing) | Harmless; `git switch X` |
| `npm i` shows lockfile changes you didn't make | Different npm versions rewrite lockfile metadata | Use `npm ci`; only commit lockfile changes you intended |
| `git branch -d` refuses | Branch not merged into your current branch | Merge first, or `-D` only if you are certain you want to discard it |
| `CRLF will be replaced by LF` warning | `.gitattributes` normalizes to LF | Harmless |

## Quick reference

```bash
git status --short                      # what changed
git log --oneline --graph -10           # where am I in history
git diff --stat                         # size of unstaged changes
git switch -                            # jump back to the previous branch
```
