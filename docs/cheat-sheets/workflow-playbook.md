# Workflow playbook

The day-to-day DCR workflow on one page, from planning through merge. The rules behind it live
in CLAUDE.md ("Parallel workflow", "PR flow"). Git and PR commands are in
`git-workflow-cheatsheet.md`, and the review bot is in `claude-review-bot-cheatsheet.md`.

---

## A. One-time setup (confirm each is done)

- [ ] Archive the old DCR Desktop project. Keep DCR Planning only.
- [x] Retire `planning/PLAN.md` (the issues are the backlog) and make CLAUDE.md "Planning → issues"
      match. Done in #57; the contract is `docs/PLANNING_HANDOFF.md`.
- [ ] Core guard is listed as Required in the "main: PR + CI required" ruleset.
- [ ] Allow the safe commands (tests, build, lint, `git add`/`commit`, `gh issue view`) in
      `.claude/settings.json`.
- [ ] Fix the connector's write access: on GitHub, Issues and Pull requests need Read and write,
      then reconnect in Claude Desktop.

---

## B. Planning chat (Claude Desktop → DCR Planning)

1. Open with:
   > "Planning session. Read open issues with labels, PRs merged since last session, and
   > BACKLOG. Report ready count per lane, any label/comment mismatches, and the top 3
   > candidates. Don't rely on memory for repo state."
2. Go through one item at a time. Claude drafts each in `task.md` format, with oracle-style
   acceptance criteria and "Closing: Fixes or Refs" stated up front.
3. You decide core vs. non-core, and dev lane vs. `@claude`.
4. File the issues. Use the connector if it can write. Otherwise paste the drafts into the dev
   lane: "File these with `gh issue create`."
5. **Exit check:** at least 3–5 ready dev issues, and labels match the decisions.

---

## C. Dev lane (VS Code → `C:\workspace\dcr-dev`)

1. Check the window title. If the sync hook says "behind," say yes to the pull.
2. > "Work issue #N. Read it with `gh issue view N --comments`; comments supersede the body.
   > Follow CLAUDE.md. Plan first and wait for approval."
3. Review the plan (5–10 min) and answer every question before you leave.
4. Claude opens a draft PR, finishes, marks it Ready, and releases the branch.

---

## D. Test lane (VS Code → `C:\workspace\dcr`)

1. `git switch main && git pull`
2. Write the spec using the TEST_PLAN §4 oracle, then get Claude's peer review in the session.
3. `gh pr create --draft --fill`, then `gh pr ready <N>` when the spec is done.
4. If the spec finds an app bug: `// BLOCKED-BY #N` + `test.fail`, file the bug, and don't touch
   `src/`.

---

## E. QA sign-off (every PR, in this order)

1. Read the bot review (`claude[bot]`). Fixes get pushed and are re-reviewed automatically.
2. Manual steps, if listed (log in as `qa-manual@example.test` / `dcr-qa-manual-local`).
3. `npm run test:e2e:flake` on the affected specs.
4. Core PRs only: apply `core-change-approved` last.
5. Check the keyword: `Refs` means you close the issue by hand after the proof.
6. Squash and merge, then `git switch main && git pull` in the test lane. The dev lane needs
   nothing; it branches from a fresh `origin/main` at its next task.

---

## F. Daily 2-minute check

- [ ] 3 or more ready dev issues?
- [ ] Any PR waiting on you?
- [ ] Any labels that don't match the last comment?

---

## G. The five rules

1. GitHub is the shared memory, so read it first.
2. Labels are the status.
3. Answer questions before you leave the window.
4. Closed means proven.
5. Keep the queue full.
