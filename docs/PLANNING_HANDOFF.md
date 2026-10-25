# Planning handoff: from planning chats to GitHub issues

Status: Active. Changes go through a docs PR; Alex merges.

This is the contract between the planning chats (Claude desktop app, "DCR Planning"
project, often spoken) and the Claude Code session that files the issues. It adds to
CLAUDE.md "Planning → issues"; it does not replace it. The issue body format is
`.github/ISSUE_TEMPLATE/task.md`, which this file must not contradict. Issue #28 is the
example for format only: it predates the `Ready` rule, and its Dependencies line is prose
where a link or a settled decision would now be required.

## 1. The rolling planning file

One file, `planning/PLAN.md`, carries the work between planning chats. A chat has no memory
of earlier chats, so this file is the memory. Claude Code creates it in the first PR from the
skeleton in section 5.

- **Session start:** the planning chat clones the repo, reads `planning/PLAN.md`, and reads
  the open issues. If the file is not merged yet, Alex uploads the latest copy.
- **Wrap-up:** on "wrap up" / "give me the cases" the chat outputs the **full updated file**,
  not a diff. Claude Code commits it via PR; Alex merges.
- **Filing:** only when Alex says so. Claude Code files the `Ready` cases (section 3).

Parts of the file, in order:
1. **Increment goal**: what this batch of work is meant to achieve. Every case ties back to it.
2. **Case index**: a table of Case #, title, lane, status, issue.
3. **Cases**: one block each (section 2).
4. **Ideas parked**: one line each, never filed. Promoted to a case only by a later decision.
5. **Needs decision**: open questions that block a case.
6. **Process decisions**: changes to how we work, not tasks, each with `(Alex, YYYY-MM-DD)`.
   Claude Code puts these into CLAUDE.md via PR; they are never filed as issues.

### Statuses
- **Idea**: one line, no commitment. Lives under Ideas parked, not as a case.
- **Shaped**: has a lane and a draft Summary and Why; criteria or questions still missing.
- **Ready**: every `task.md` section is complete, every acceptance criterion is checkable,
  the lane is set, and no unresolved question blocks the start.
- **Filed (#N)**: keeps its row so it is not re-planned. **Dropped** keeps its row with a reason.

Case numbers are permanent and never reused. They are local to the file; GitHub issue numbers
are separate and are recorded in the index after filing.

### During a session
Each agreed case is confirmed in one sentence ("Case 3 captured: ..., dev lane"). A revised
case is updated in place, never duplicated. Case details are not read aloud. "Read back"
lists case numbers and titles only. Before wrap-up, Claude asks about any case missing an
acceptance criterion or a lane.

## 2. Case block

```
### Case N: <issue title>
Status: Shaped | Ready | Filed (#N) | Dropped
Labels: <comma-separated, or "none">
Blocked by: <Case numbers, or "none">

#### Summary
#### Why
#### Acceptance criteria (oracle)
- [ ]
#### Open for planning        <- optional; only if questions remain (as in #28)
#### Lane
#### References
#### Dependencies
```

In `PLAN.md` the section headings sit at level 4 so they nest under `### Case N`. The issue
body is everything from `#### Summary` down, with each heading promoted two levels
(`####` to `##`) when the body file is written, so the filed issue uses the `task.md`
headings exactly.

Rules for content:
- **Why** starts with `Decision (Alex, YYYY-MM-DD):` when a decision drove the case, and
  names exact file paths rather than areas.
- **Acceptance criteria** are observable and checkable. For E2E work, cite the TEST_PLAN §4
  oracle. The last criterion proves the claim by exercising the behaviour (for example "fires
  on a core change and stays silent on a non-core change"). A criterion satisfied by a clean
  exit code alone is not acceptable.
- **Lane** is `dev`, `test`, or `both` (matching `task.md`).
- **Dependencies** hold links to other cases and the real condition for starting. Prose such as
  "implement only after the questions are settled" must not replace a `Blocked by` link.
- A case whose criteria cannot be made checkable stays `Shaped`, or becomes a Needs decision.
- `docs/BACKLOG.md` stays the list of known gaps and bugs. When a BACKLOG item is shaped
  into a case, link the BACKLOG entry; do not copy its text.

## 3. Rules for the filing session (Claude Code)

1. Re-read the repo and open issues first (`git fetch`, `gh issue list --state all`).
   Do not rely on the planning file's description of current state.
2. File only cases marked `Ready` that Alex has asked to file.
3. Run `gh label list`. Use only labels that exist. Report any requested label that does not
   exist and stop before filing that case; creating labels needs Alex's OK.
4. Confirm flags with `gh issue create --help` before first use. Pass the body from a file.
5. File in dependency order. Issue numbers share a sequence with PRs, so never predict one:
   read the number from each `gh issue create` result.
6. After filing, replace each Case-number link in `Blocked by` / `Dependencies` with the real
   `#N` by editing the dependent issue, then show Alex a table of case number → issue
   number → URL.
7. Do not put the string that triggers `.github/workflows/claude.yml` (an `@`-mention of the
   bot) in any issue title or body unless Alex asks for a bot run. The workflow fires on
   `issues: opened` and on `issues: assigned`, so assigning an issue that contains the
   mention starts a run too.
8. Needs decision items are not filed; add a planning comment on the related issue in the
   style of #28: `**Planning priority (Alex, YYYY-MM-DD):** ...` (bold lead-in). Process
   decisions go into a CLAUDE.md PR.
9. Verify after filing: `gh issue view <N> --json title,body,labels` for each issue; confirm
   the body matches the case block (headings promoted to `##`, in `task.md` order) and the
   labels are applied.
10. Update `planning/PLAN.md` (status `Filed (#N)`, index row) in a docs-only PR.

## 4. Planning chat: session-start report

One line stating what was verified: repo tip commit, whether `planning/PLAN.md` was found,
whether the issue list was provided, and anything that failed.

## 5. Skeleton for `planning/PLAN.md`

```
# DCR planning

## Increment goal
(not yet set)

## Case index
| Case | Title | Lane | Status | Issue |
|------|-------|------|--------|-------|

## Cases

## Ideas parked

## Needs decision

## Process decisions
```

## 6. Decisions recorded and open points

Settled in PR #38:
- The CLAUDE.md "Planning → issues" paragraph names the "DCR Planning" project, drops the
  project-knowledge list, and points to `planning/PLAN.md` and this document.
- File path: `planning/PLAN.md`.
- The bullets under that CLAUDE.md paragraph match this process: a session ends with the full
  updated `planning/PLAN.md`, and only `Ready` cases are filed.

Still open:
- Add the optional `## Open for planning` section to `.github/ISSUE_TEMPLATE/task.md`?
  (#28 uses it; `task.md` does not include it.)

Outside the repo:
- **Hard rule 3** (no Excel workbook, nothing derived from it) applies to the planning
  project too. State it in the project's instructions.
