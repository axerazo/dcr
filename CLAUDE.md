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

## Architecture map

- `src/lib/balance.ts` — **the calculation engine.** Pure functions implementing
  Formulas A–E from SPEC §9/§15. INVARIANT: balance is NEVER stored in the database;
  it is always computed. Do not add a stored/cached balance anywhere.
- `src/lib/monthStatus.ts` — month lifecycle state machine:
  open → ready_to_close → soft_closed → hard_closed
- `src/lib/reconciliation/` — AI-assisted reconciliation (system prompt, context
  builder, service). Model calls go through `reconciliationService.ts` only.
- `src/hooks/` — data access via TanStack Query + Supabase
- `src/store/` — Zustand (auth, session)
- `supabase/migrations/` — schema is migration-only; never edit an existing
  migration, always add a new numbered one
- Transaction lifecycle (six states): recorded, scheduled, in_flight, pending,
  cleared, void. Void rows: balance = null, excluded from all balance math.

## Hard rules

1. **Any change touching `src/lib/balance.ts` or `src/lib/monthStatus.ts` requires
   the full test suite green BEFORE and AFTER, and new/updated tests covering the
   change.** These files are the product. Treat every edit as high-risk.
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

## E2E tests (Playwright)

The E2E suite covers twelve Critical User Journeys (CUJs) and no more. The plan lives in
`docs/e2e/TEST_PLAN.md`; **§4 is the oracle** for each journey. Anything provable at a lower
layer (formula correctness, float boundaries) belongs in Vitest, not here.

- Commands: `npm run test:e2e` (full run), `npm run test:e2e:flake` (zero-flake check:
  `--repeat-each=3 --retries=0 --workers=1`), `npm run test:e2e:ui`, `npm run test:e2e:report`.
  Supabase local must be running (`supabase start`, `npm run env:test`).
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
- Definition of done (TEST_PLAN §6): passes 3x consecutively with no retries, locally and in
  CI; asserts the oracle, not incidental DOM; creates and tears down its own data. CI config
  allows retries, but a test that passes only on retry is a failure, not a pass.
- Audit-writing journeys cannot tear down their data: `audit_log` is append-only
  (`audit_log_no_delete` trigger). This is by design. Locally, reset with
  `supabase db reset`; CI starts from a fresh stack. Today those are the journeys that
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
