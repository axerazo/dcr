# Claude review bot cheat sheet

Runbook for the two Claude GitHub workflows. Git and PR steps live in
`git-workflow-cheatsheet.md`.

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/claude-code-review.yml` | PR opened, synchronized, reopened, ready for review | Runs the `code-review` plugin and posts findings as PR comments (`claude[bot]`) |
| `.github/workflows/claude.yml` | `@claude` in an issue, PR comment or review | Does what the comment asks; can read CI results (`actions: read`) |

Both authenticate with the `CLAUDE_CODE_OAUTH_TOKEN` repo secret.

---

## 1. The review step fails with an authentication error

**Fix:** create a new token and replace the secret.

```bash
claude setup-token                      # run locally; prints a long-lived OAuth token (Pro/Max)
gh secret set CLAUDE_CODE_OAUTH_TOKEN   # paste the token when prompted
```

Then re-run the failed job (GitHub → Actions → the run → "Re-run jobs"), or push a commit.
Both workflows share this secret, so one update fixes both.

---

## 2. The review runs green but posts nothing

Each line in the review step's config fixes a cause of this. Keep them all:

| Config in `claude-code-review.yml` | Without it | Added |
|---|---|---|
| `--comment` in `prompt` | The plugin prints its review to the job log only | `0083633` |
| Full `https://github.com/.../pull/N` URL in `prompt` | `gh pr view` only accepts a number, an https URL or a branch name, so `owner/repo/pull/N` fails | `1c0f593` (#8) |
| `--allowedTools` listing the inline-comment tool and `gh pr comment/diff/view` | The bot isn't allowed to post | `0083633` |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1"` | Review subagents may run as background tasks. Added while troubleshooting the empty review (#8 → #10) | `1155a40` (#10) |

**To debug a silent run:** temporarily add `show_full_output: true` under `with:`. It logs every
Claude message and tool result. **These logs are public on this repo**, and the action warns
that they may contain secrets, so remove it after one run. (It was used for exactly this in #8
and removed in #11.)

---

## 3. A PR that edits `claude-code-review.yml` gets no review

By design: the action validates the workflow file against `main`, so a PR that changes it is
skipped. The change takes effect once merged.

---

## 4. Approvals and sign-off

The bot comments; it does not approve. Your merge is the sign-off (CLAUDE.md "PR flow",
`git-workflow-cheatsheet.md` §9).

---

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Review job fails at auth | Token in the secret no longer valid | §1 |
| Green run, no comment | One of the §2 settings is missing | Restore it; debug with `show_full_output` (§2) |
| No review on a workflow-editing PR | Workflow validation | Expected (§3) |
| `@claude` comment does nothing | `claude.yml` only runs when the body (or issue title) contains `@claude` | Include `@claude` in the comment itself |
