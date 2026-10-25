# **Project BACKLOG**

## **Updates/Improvements**

- **E2E: void x status matrix** (test-only, no `src/` change; no legend tag applies)
  - Analysis: `CUJ-03_void_matrix_analysis.xlsx` (Matrix sheet). Summary below.
  - Why: CUJ-03 exercises one cell only (recorded debit -> void). SPEC section 10 says void is available from any status.
  - What the math distinguishes (SPEC section 9): the 8 starting-status x entry-type cases collapse to 4 distinct outcomes. Actual and later running balances move for every case (a voided debit raises them, a voided credit lowers them). Available moves only when the voided row was cleared (Formula B counts cleared rows only). The voided row's own balance cell empties in every case.
  - Gap in CUJ-03 today: a recorded debit can never change Available, so the one case that can is untested.
  - Recommended follow-up cases, in order: (1) cleared debit (the only case where Available also moves), (2) one credit case, for the sign. The remaining cases are optional (same outcome groups, UI wiring only).
  - Scope: CUJ-03 is checked in as the single P0 case. The matrix is a table-driven follow-up after merge. It is not folded into CUJ-03 and is not a thirteenth journey (TEST_PLAN section 1).
  - Open question (confirm before building): `TransactionStatus` has six values. The row status menu offers Recorded, Pending, Cleared and Void, plus Scheduled only when the row has a scheduled date. `in_flight` is not offered. Decide which starting statuses are in scope.
  - Test-writing rules: use literal expected movements from the SPEC, not re-implemented formulas (keeps the oracle independent), and assert the chosen status on the row before voiding (guards against a vacuous pass).
  - Also worth a case (from `monthStatus.ts`, not from the spreadsheet): voiding the last uncleared row of a month should take it open -> ready_to_close, because void is excluded from the uncleared count.
  - Dependency: when the void audit gap is fixed (issue #12), every case also needs an audit assertion and the teardown expectation changes (TEST_PLAN section 6).

- **Build warning: Anthropic SDK pulls `node:fs` / `node:path` into the browser bundle** (touches-core)
  - Seen in every production build (`build:test`, CI E2E). Vite externalizes them from the `@anthropic-ai/sdk` credential modules. Harmless but noisy.
  - Root cause: the SDK runs browser-side (`dangerouslyAllowBrowser`, CLAUDE.md hard rule 4).
  - Fix: Phase 2's Supabase Edge Function proxy removes the SDK from the browser bundle, and the warning goes with it. Don't add a Vite shim just to silence it.

- **Build warning: main JS chunk > 500 kB** (UI-only)
  - `dist/assets/index-*.js` is about 655 kB minified (181 kB gzip), likely mostly the Anthropic SDK.
  - Revisit after the Edge Function proxy lands, since the bundle should shrink. If it's still large, code-split with dynamic `import()` (e.g. lazy-load the reconciliation panel and yearly summary).
  - Not a correctness issue. The E2E suite (production build in CI) is unaffected.

## **New Features**

- **Option to hide voided rows** (UI-only if session-scoped; touches-data if persisted per user)
  - Today voided rows always render struck-through (SPEC section 10). The SPEC defines no hide option.
  - **The default must stay "shown".** CUJ-03's oracle (TEST_PLAN section 4) asserts the voided row is visible, struck-through, with an empty balance cell. If the default ever becomes "hidden", CUJ-03 and every void-matrix case need a precondition that switches voided rows to shown.
  - Guardrail: filter at render time, after running balances are computed. Do not touch `src/lib/balance.ts` (CLAUDE.md hard rule 1). Hiding a row must not change any balance.
  - Tests when built: add toggle cases to the void matrix (hidden -> row absent, all balances identical).

### **LEGEND:**

Tag List to use:

- **UI-only**
- **touches-data**
- **touches-core**
