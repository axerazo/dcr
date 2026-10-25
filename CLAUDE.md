# CLAUDE.md — Digital Check Register (DCR)

Ledger-first personal finance app. The user's register is the source of truth; bank
data confirms it. AI assists reconciliation but never decides — human-in-the-loop
always. Full requirements live in `SPEC.md`; consult it before changing any behavior
it governs, and cite the section (e.g., "SPEC §9") in commit messages when relevant.

## Naming

- Canonical name: **Digital Check Register (DCR)**. Never introduce "PFM" in new
  code, docs, or commits (legacy references may still exist; migrate them when touched).

## Commands

- `npm run dev` — Vite dev server
- `npm run test:run` — full Vitest suite (must be green before every commit)
- `npm run build` — typecheck (`tsc -b`) + production build (must pass before every commit)
- `npm run lint` — ESLint (flat config)
- `npm test` — Vitest watch mode; `npm run test:ui` — Vitest UI
- `npm run dev:test` — Vite in `test` mode on 127.0.0.1:5173 (strict port; local E2E target)
- `npm run build:test` / `npm run preview:test` — production build in `test` mode, served on
  the same host/port (CI's E2E target; see "E2E target" below)

## Architecture map

- `src/lib/balance.ts` — **the calculation engine.** Pure functions implementing
  Formulas A–E from SPEC §9/§15. INVARIANT: balance is NEVER stored in the database;
  it is always computed. Do not add a stored/cached balance anywhere.
- `src/lib/monthStatus.ts` — month lifecycle state machine:
  open → ready_to_close → soft_closed → hard_closed
- `src/lib/reconciliation/` — AI-assisted reconciliation (system prompt, context
  builder, service). Model calls go through `reconciliationService.ts` only.
- `src/lib/golden.test.ts` — golden-master suite (Phase 1). Data-driven: every JSON in
  `src/lib/__fixtures__/golden/` is auto-discovered. Add coverage by adding a fixture,
  never by editing the test file. Fixture format: `docs/golden-master/FIXTURE_SCHEMA.md`.
  `scripts/extract-fixtures.mjs` turns a **sanitized** workbook into fixture JSON (Hard rule 3).
- `src/lib/audit.ts` — audit-log writer; `src/lib/supabase.ts` — client;
  `src/lib/database.types.ts` — generated DB types; `src/types/` — app domain types
- `src/pages/` (`LoginPage`, `AppPage`) and `src/components/` (`register/`, `accounts/`,
  `reconciliation/`, `ui/`) — React UI
- `src/hooks/` — data access via TanStack Query + Supabase
- `src/store/` — Zustand (auth, session)
- `supabase/migrations/` — schema is migration-only; never edit an existing
  migration, always add a new numbered one
- `scripts/write-env-test.mjs` (`npm run env:test`) — reads `supabase status` and writes the
  local Supabase URL/keys (including the service-role key) into `.env.test`
- `docs/` — `BACKLOG.md` (known gaps and bugs), `DCR_Phase0_Audit.md`, `e2e/TEST_PLAN.md`,
  `golden-master/`
- Transaction lifecycle (six states): recorded, scheduled, in_flight, pending,
  cleared, void. Void rows: balance = null, excluded from all balance math.

## Hard rules

1. **Any change touching `src/lib/balance.ts` or `src/lib/monthStatus.ts` requires
   the full test suite green BEFORE and AFTER, and new/updated tests covering the
   change.** These files are the product. Treat every edit as high-risk.
   **Core = the balance calculations and the monthly roll-over**, and it is protected at all
   cost. Besides the two files above, the roll-over lives in `src/components/register/RegisterView.tsx`
   (register auto-creation, carry-forward to next month's opening, mismatch prompt) and
   `useMostRecentRegisterBefore` in `src/hooks/useRegister.ts`; the golden fixtures are its
   expectations. Flag any change that touches core to the user immediately, before proceeding.
   Everything else follows normal development. Nothing else is core (AI reconciliation
   included) unless the user decides so. CI guard: #28.
2. Currency values currently use floating-point with `currencyEq` (±0.005)
   tolerance. A migration to integer cents is planned but MUST NOT begin until the
   golden-master suite exists. Until then, always use `currencyEq` for currency
   comparison — never `===`.
3. Ground truth for calculation correctness is the user's Excel workbook
   (differential validation, confidence-gated, ongoing). The workbook lives outside
   the repo and contains real financial data — never request it, copy it, or commit
   data derived from it. Test fixtures must be sanitized (real edge-case structure,
   fabricated amounts/payees).
4. Never commit secrets. `VITE_ANTHROPIC_API_KEY` in `.env.local` is a known
   temporary weakness (browser-side key, `dangerouslyAllowBrowser`); the planned fix
   is a Supabase Edge Function proxy. Do not extend the browser-side pattern to new
   features.
5. AI reconciliation is assistive only: it may surface discrepancies and suggest
   matches; it must never auto-apply a state transition. Every transition goes
   through the audit log (`src/lib/audit.ts`).
6. Dates are parsed as local midnight (see `isInFlight`) — never introduce
   UTC-shifted date parsing for scheduled/transaction dates.

## Workflow conventions

- Plan before edit for anything multi-file; small single-file fixes may proceed directly.
- Run `npm run test:run && npm run build` before declaring any task complete.
- Commit messages: imperative mood, reference SPEC sections where applicable.
- The `.claude/agents/code-quality-reviewer.md` subagent should be invoked after
  significant changes; it keeps project memory.

## Parallel workflow (two lanes)

Two git worktrees of the same repo, each with its own branch and Claude session:

| Folder | Lane | Scope |
| --- | --- | --- |
| `C:\workspace\dcr` | Test lane (user writes, Claude reviews) | `e2e/` specs; E2E PRs never touch `src/` |
| `C:\workspace\dcr-dev` | Dev lane (Claude writes, user reviews) | `src/`, golden-master, docs, bug fixes |

- Check `git worktree list` / the current folder before acting; stay in your lane's folder.
- Both lanes share one local Supabase stack and port 5173 (`dev:test` is `--strictPort`).
  **Only the test lane runs E2E locally**; the dev lane verifies with Vitest + build and
  relies on CI for E2E (see PR flow below).
- Branch from `origin/main`, one branch per task (`fix/<issue>-<slug>`, `docs/<slug>`,
  `phase1/<slug>`). After the other lane merges, rebase onto `origin/main` before merging.
- Every PR gets the automatic Claude review (`.github/workflows/claude-code-review.yml`);
  `@claude` in PR/issue comments triggers `.github/workflows/claude.yml`. The user merges.
- Tasks come from planning sessions and are tracked as GitHub issues (see "Planning → issues");
  reference the issue (`Fixes #N`) in the PR.
- A new worktree needs its own setup: `npm ci`, `npm run env:test`, and a copy of
  `.env.local` (both env files are gitignored).
- **Session-start sync check:** `.claude/settings.json` runs `.claude/hooks/sync-check.sh` when
  every session starts. It fetches and reports whether the checkout is behind `origin/main`. It
  never pulls: when it reports "behind", tell the user first and pull, rebase or switch only after
  a yes. Locally, VS Code's `git.autofetch` (in each folder's gitignored `.vscode/settings.json`)
  shows the same thing as a ↓N count in the status bar.

### Planning → issues (where tasks come from)

Planning happens outside the repo, in a Claude app Project ("DCR Planning") that has
`CLAUDE.md`, `SPEC.md`, `docs/e2e/TEST_PLAN.md` and `docs/BACKLOG.md` as project knowledge.
Never add the Excel workbook or anything derived from it (Hard rule 3).
- Each planning session ends with a list of tasks in the shape of
  `.github/ISSUE_TEMPLATE/task.md`: summary, why, acceptance criteria (the oracle), lane,
  SPEC/TEST_PLAN refs, and blocked-by/blocks links.
- The user brings that list to a VS Code session, which files each task as a GitHub issue
  (`gh issue create`), shows the issue numbers and links dependencies.
- Issues are the backlog. Lanes pick them up by number; nothing is re-explained.
- Decisions that change how we work go into this file (via PR), not just into chat.

### PR flow: dev → QA → merge (the PR is the meeting point)

1. **Dev lane** opens the PR as a **draft**, referencing the issue (`Fixes #N`). CI runs the
   full E2E suite on the branch. Once pushed, the dev lane **releases the branch**
   (`git switch --detach origin/main`). Git allows a branch to be checked out in only one
   worktree, so otherwise the test lane's `gh pr checkout <N>` fails with "already used by
   worktree". If the dev lane needs more commits later, it checks the branch out again only
   after confirming the test lane isn't on it.
2. If the bug was found by a spec marked `test.fail(...)`, CI reports **"Expected to fail,
   but passed"**. That red result means the fix works and is the hand-off signal to QA,
   not a regression.
3. **Unblock the spec in the same PR**, so fix and spec ship together and `main` never runs red:
   - **Pre-authorized (dev lane may do it):** only lines tagged `// BLOCKED-BY #N` (see below).
   - **Anything else in `e2e/`:** the test lane joins the branch (`gh pr checkout <N>`), makes
     the change and pushes to the same PR.
4. **QA's last step before merging:** `npm run test:e2e:flake` (3x, no retries, TEST_PLAN §6)
   on the affected specs. CI allows retries, so a CI pass alone doesn't meet §6.
5. **Merge (QA's sign-off):** after the flake check passes, the user clicks **Ready for review**
   (the button in the merge box at the bottom of the Conversation tab; or `gh pr ready <N>`), then:
   - **Checks already green:** GitHub offers only **Squash and merge**. Use it.
   - **Checks still running** (e.g. right after a push or "Update branch"): GitHub shows
     **Enable auto-merge** (or `gh pr merge <N> --auto --squash`) and merges by itself once every
     required check passes.

   Merged branches are deleted automatically. Then run `git switch main && git pull` in the test
   lane. Claude never merges and never enables auto-merge; that click is QA's sign-off. Squash
   merging is the convention: each PR lands as one commit ending in `(#N)`.

#### `BLOCKED-BY #N`: pre-authorized spec unblocks

QA tags spec code that is waiting on an app fix, with the tag directly above it:

```ts
// BLOCKED-BY #17: status menu covered by later rows
test.fail('Changing Statuses - Balances Updated Accordingly', async (...) => {

// BLOCKED-BY #13: uncomment when fixed
// await expect(auditRows).toHaveLength(1)
```

When the dev lane fixes issue #N, it runs `grep -rn "BLOCKED-BY #N" e2e/`. For each hit it
may **only** delete the tag line and either change `test.fail(` → `test(` on the next line,
or uncomment the contiguous commented block directly below the tag.
- Put this in its own commit (`Unblock CUJ-NN: #N fixed`) so QA can review it separately.
- If CI then fails that spec, revert the unblock commit and report back. Never edit test
  logic or assertions to make it pass.
- QA's step 4 (flake check) still applies before merge.

Prefer `test.fail` over commented-out assertions: only `test.fail` produces the automatic
"Expected to fail, but passed" signal.

`main` is protected by the "main: PR + CI required" ruleset: PRs only, "Lint, build, test" and
"E2E (Playwright)" must pass on a branch that is up to date with `main`, no bypass. Never try to
push to `main` directly. When another PR merges first, the waiting PR needs **"Update branch"**
on GitHub, after which CI reruns and auto-merge proceeds. Repo settings: auto-merge allowed;
merged branches are deleted automatically.

## E2E tests (Playwright)

The E2E suite covers twelve Critical User Journeys (CUJs) and no more. The plan lives in
`docs/e2e/TEST_PLAN.md`; **§4 is the oracle** for each journey. Anything provable at a lower
layer (formula correctness, float boundaries) belongs in Vitest, not here.

- Commands: `npm run test:e2e` (full run), `npm run test:e2e:flake` (zero-flake check:
  `--repeat-each=3 --retries=0 --workers=1`), `npm run test:e2e:ui`, `npm run test:e2e:report`,
  `npm run test:e2e:clean` (`supabase db reset`; clears accumulated E2E users).
  Supabase local must be running (`supabase start`, `npm run env:test`).
- **E2E target: build once, test what ships.** Playwright rebuilds (`build:test`) and serves the
  production bundle (`preview:test`) instead of the dev server in two cases, with no flags needed:
  - **CI** (`E2E_TARGET=preview` in `ci.yml`), which then uploads that exact `dist/` as the
    `dcr-build-<sha>` artifact.
  - **`npm run test:e2e:flake`**, QA's pre-merge gate, so the local sign-off tests the same
    bundle CI does.

  Everyday commands (`test:e2e`, `test:e2e:ui`, `test:e2e:headed`) use the fast dev server. To
  run any of them against the build, prefix with `E2E_TARGET=preview` (Git Bash). Service
  workers are blocked in all runs (`serviceWorkers: 'block'`) so `page.route()` mocks stay
  reliable.
- Layout: `e2e/NN-<journey>.spec.ts` (specs), `e2e/fixtures/` (`seed`, `seedUnauthenticated`,
  `register`, paths/env/admin client), `e2e/pages/` (page objects, e.g. `RegisterPage`),
  `e2e/support/` (helpers, e.g. `money()`), `e2e/setup/auth.setup.ts`.
- Fixtures encode architecture, so don't bypass them:
  - `seed` = authenticated per-test user with bank data. Use it for every journey where
    login is a precondition.
  - `seedUnauthenticated` = same data, no browser session. CUJ-01 (login is the subject)
    uses it together with `test.use({ storageState: { cookies: [], origins: [] } })`.
  - `STORAGE_STATE_PATH` / `STORAGE_STATE_EMAIL` (in `e2e/fixtures/paths.ts`) belong to the
    long-lived setup user with no accounts; keep them out of `auth.setup.ts` to avoid the
    Playwright import-time `setup()` error.
  - Month-boundary race: capture `now` once, pin it with `context.clock.setFixedTime(now)`,
    and pass the same `now` into the seed so Node and browser agree on the current month.
    Use `setFixedTime`, not `clock.install()`: install also fakes timers and risks stalling
    TanStack Query's refetch/retry behavior.
- Selectors: `getByRole` / `getByLabel` first; `data-testid` only where semantics are absent.
- Page objects hold the helpers: locators and actions. They may wait for the page to settle,
  but never assert an oracle. Specs hold the oracles and claims. A one-off page used by a
  single journey (the login form in CUJ-01) needs no page object.
- "Wish test first": write the assertion you wish you could write, then build the locator or
  helper that makes it possible.
- A missing `data-testid` / `aria-label` (or a selector that needs a structural workaround such
  as XPath) is logged in `docs/BACKLOG.md` as a `UI-only` item, not fixed in the test PR.
- Definition of done (TEST_PLAN §6): passes 3x consecutively with no retries, locally and in
  CI; asserts the oracle, not incidental DOM; creates and tears down its own data. CI config
  allows retries, but a test that passes only on retry is a failure, not a pass.
- Audit-writing journeys cannot tear down their data: `audit_log` is append-only
  (`audit_log_no_delete` trigger). This is by design. Leftover users never
  affect later runs (each test seeds its own user), so reset only to tidy up:
  `npm run test:e2e:clean`. CI starts from a fresh stack. Today those are the journeys that
  close/unlock a month, resolve an opening-balance mismatch or run reconciliation
  (e.g. CUJ-06, -07, -08, -11). CUJ-03's UI void writes no audit row (see TEST_PLAN §6).
- Do not change anything under `src/` in an E2E PR. If a test exposes an app bug, report it
  separately; do not fix it inside the test PR.
- When reviewing E2E changes: check the asserted oracle against TEST_PLAN §4 and the
  actual `src/` behavior (SPEC citations), not against the PR description. Review the test
  logic as a PR reviewer; do not rewrite it.

## Current phase context (update as phases complete)

- Phase 0 (audit) complete 2026-07-01 — see `docs/DCR_Phase0_Audit.md`
- Phase 1 (golden-master suite on the calc engine) — IN PROGRESS
- Phase 2 (integer-cents migration, dependency majors, Edge Function key proxy) — pending
- Phase 3 (AI-augmented QA layer: subagents, hooks, MCP server, plugin) — pending
- E2E suite: Waves 1–2 (CUJ-01–06) done 2026-10-23; Wave 3 (CUJ-07–10) next. Per-journey
  status lives in TEST_PLAN §3.
- AI reconciliation is being re-planned (it doesn't work the way it was intended), so CUJ-11 is
  on hold until the planning side settles the new design. Don't build on the current
  reconciliation flow.
