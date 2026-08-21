# DCR End-to-End Test Plan — Critical User Journeys

**Status:** Draft v1 (pending approval) · **Owner:** Alex Erazo · **Tooling:** Playwright (`@playwright/test`)
**Scope basis:** SPEC.md as of Phase 1.5 (`8dde301`) — oracle carry-forward rule, register auto-creation

---

## 1. Purpose and scope

This plan scopes DCR's end-to-end test suite around **critical user journeys (CUJs)** — the
goal-oriented paths a user takes through the running application. Unit tests (Vitest, 28) prove
the calculation engine in isolation; the golden-master suite (51) proves the engine against the
independent Excel oracle; the E2E suite proves that the *assembled application* — React UI,
TanStack Query state, Supabase persistence, auth, and month-lifecycle wiring — delivers those
same guarantees to a real browser session.

E2E tests are the most expensive layer of the pyramid, so this suite deliberately covers
**twelve journeys and no more**. Anything provable at a lower layer is tested at that layer;
journeys exist to catch what unit tests cannot: wiring, persistence, navigation, and
lifecycle-effect behavior across real page interactions.

**Out of scope for E2E:** formula correctness across edge-case data (golden-master suite),
floating-point boundaries (unit tests), Supabase RLS policy correctness (Phase 2/3 concern,
tested via API-level tests when the Edge Function proxy lands), visual regression, and
performance/load.

## 2. Environment strategy

| Concern | Decision | Rationale |
| --- | --- | --- |
| Backend | **Supabase local** via CLI (Docker) | Hermetic runs; identical in CI; no cloud-project pollution |
| Auth | Sign in once in **global setup**, persist `storageState` | Each journey starts authenticated; login itself is CUJ-01, tested explicitly once |
| Test data | Seed helpers create an **isolated account per test** via the Supabase client | No cross-test coupling; UI-based setup only where the setup *is* the journey |
| Anthropic API | **Mocked** with `page.route()` interception (CUJ-11 only) | Deterministic, free, offline-capable; realistic fixture responses captured from real sessions |
| Browsers | Chromium in CI; Chromium + WebKit locally on demand | DCR is a personal-finance PWA; broad matrix deferred |
| Diagnostics | Trace + video on first retry; HTML report uploaded as CI artifact | Debuggability without slowing green runs |
| Selectors | `getByRole` / `getByLabel` first; `data-testid` only where semantics are absent | Doubles as a passive accessibility audit |

## 3. Journey inventory

Priority tiers: **P0** = smoke-critical (must pass before any merge), **P1** = core lifecycle,
**P2** = important but lower frequency. Status reflects implementation waves.

| # | Journey | Priority | Spec file | Status |
| --- | --- | --- | --- | --- |
| CUJ-01 | Sign in and land on the current month's register | P0 | `e2e/auth.setup.ts` + `e2e/01-auth.spec.ts` | Wave 1 |
| CUJ-02 | Record a transaction and see running balances update | P0 | `e2e/02-record-transaction.spec.ts` | Wave 1 |
| CUJ-03 | Void a transaction — strikethrough renders, balances unchanged | P0 | `e2e/03-void-transaction.spec.ts` | Wave 1 |
| CUJ-04 | Month rollover — register auto-created, opening balance live-carries | P0 | `e2e/04-auto-carry.spec.ts` | Wave 2 |
| CUJ-05 | Transaction status lifecycle — pending → cleared; available vs current balances diverge and reconverge | P1 | `e2e/05-status-lifecycle.spec.ts` | Wave 2 |
| CUJ-06 | Close & Archive — ready-to-close prompt, soft close, lock banner, prior-month hard-close cascade | P1 | `e2e/06-close-archive.spec.ts` | Wave 2 |
| CUJ-07 | Unlock an archived month, edit, re-lock — including re-lock blocked while uncleared transactions exist | P2 | `e2e/07-unlock-relock.spec.ts` | Wave 3 |
| CUJ-08 | Opening-balance mismatch prompt — "Use closing balance" resolves; "Keep" requires a reason | P1 | `e2e/08-mismatch-prompt.spec.ts` | Wave 3 |
| CUJ-09 | Edit a transaction amount — balances cascade in-month and next month's opening updates live | P1 | `e2e/09-edit-cascade.spec.ts` | Wave 3 |
| CUJ-10 | First-ever register initialization — the only remaining manual opening-balance entry | P2 | `e2e/10-first-register.spec.ts` | Wave 3 |
| CUJ-11 | AI reconciliation session — suggestions render from (mocked) Claude; accept/reject updates statuses | P1 | `e2e/11-ai-reconciliation.spec.ts` | Wave 4 |
| CUJ-12 | Yearly Summary — populated rows for existing months, navigation back to a month register | P2 | `e2e/12-yearly-summary.spec.ts` | Wave 4 |

## 4. Journey specifications

Each journey below lists goal, preconditions, the essential path, and the oracle — what the
test asserts to declare success. Steps are outlines, not scripts; the spec files are the
executable source of truth.

### CUJ-01 — Sign in and land on the current month's register (P0)
**Goal:** An existing user authenticates and arrives at their account's register for the
current calendar month.
**Preconditions:** Seeded user + account + current-month register.
**Path:** Load app → enter credentials → submit.
**Oracle:** Register header shows account nickname and current month/year label; transaction
table renders. Global setup persists `storageState` here for all later journeys.
**Traceability:** SPEC §16 (auth), §11.

### CUJ-02 — Record a transaction and see running balances update (P0)
**Goal:** The core write path: user adds a debit and a credit; on-screen balances reflect
Formula D exactly.
**Preconditions:** Authenticated; register with known opening balance and no transactions.
**Path:** Add debit (date, description, amount) → observe row balance → add credit → observe.
**Oracle:** Each new row shows the correct running balance; header Actual Balance equals
opening − debit + credit. Same invariant the golden suite proves at unit level, now verified
through the assembled UI — one invariant, two layers of the pyramid.
**Traceability:** SPEC §9 Formulas A/C/D.

### CUJ-03 — Void a transaction (P0)
**Goal:** User voids an erroneous entry; the record stays visible but leaves every balance
untouched.
**Preconditions:** Register with three transactions and known balances.
**Path:** Void the middle transaction → confirm in the prompt.
**Oracle:** Row renders struck-through with dimmed styling; its balance cell empties; all
other rows' balances and the header balances are unchanged — the void-injection metamorphic
property, verified through the UI. Audit expectation noted for a later API-level check.
**Traceability:** SPEC §10 Void Rule (incl. 2026-07 scope note), §9 Formula D.

### CUJ-04 — Month rollover with auto-carry (P0)
**Goal:** The Phase 1.5 flagship behavior: navigating to a month with no register silently
creates it from the prior month's closing balance, and the opening stays live.
**Preconditions:** Current month register with transactions including a trailing pending row
(the $840-not-$870 shape from the golden fixtures).
**Path:** Navigate to next month → observe auto-created register → navigate back → add a
transaction to the prior month → return to next month.
**Oracle:** No Initialize form appears; opening balance equals the prior month's closing
balance (status-blind, last amount-bearing row); after the prior-month edit, the opening has
live-updated. The informational banner shows the auto-carry copy with the pending count.
**Traceability:** SPEC §11 auto-carry, §9 Formula E.

### CUJ-05 — Status lifecycle: pending → cleared (P1)
**Goal:** User marks a transaction pending, then cleared; the available/current split behaves.
**Preconditions:** Register with mixed-status transactions.
**Path:** Set a transaction to pending → observe header balances → set to cleared.
**Oracle:** While pending, Available and Current diverge by exactly the pending amount; on
clearing, they reconverge; when the last uncleared row clears, the ready-to-close prompt
appears (bridging into CUJ-06).
**Traceability:** SPEC §9 Formula B, §10, §11 ready-to-close.

### CUJ-06 — Close & Archive (P1)
**Goal:** User closes a fully reconciled month; the register locks and the lifecycle cascades.
**Preconditions:** Register with all transactions cleared (ready_to_close); next-month
register exists.
**Path:** Accept the close prompt → Close & Archive.
**Oracle:** Month shows the closed/locked banner; editing affordances disabled; next month's
opening balance equals the closing balance and is frozen from this month's perspective; if a
prior soft-closed month existed, it is promoted to hard_closed (Direction A).
**Traceability:** SPEC §11–§12 close flow.

### CUJ-07 — Unlock, edit, re-lock (P2)
**Goal:** User reopens an archived month to fix an entry, then re-locks it.
**Preconditions:** A soft-closed register.
**Path:** Unlock (confirm dialog) → edit a transaction amount → attempt re-lock with an
uncleared row present (expect blocked) → clear it → re-lock.
**Oracle:** Unlock banner appears; re-lock is refused with the validation message while
uncleared rows exist; succeeds after clearing; month returns to soft_closed.
**Traceability:** SPEC §11–§12 unlock/re-lock rules.

### CUJ-08 — Opening-balance mismatch prompt (P1)
**Goal:** The SPEC §2 guarantee — nothing changes without user knowledge — for the one case
where silent carry is forbidden: a manually-entered next-month opening.
**Preconditions:** Next-month register created via manual initialization (is_manual_opening)
with an opening that differs from the prior month's closing balance.
**Path A:** Choose "Use closing balance" → prompt resolves, opening updates.
**Path B:** Type a reason → choose "Keep opening balance" → prompt dismisses, opening intact.
**Oracle:** Prompt shows both balances and the difference; Path B's Keep button is disabled
until a reason is entered; the chosen outcome persists across navigation.
**Traceability:** SPEC §2, §11 carry-forward propagation.

### CUJ-09 — Edit cascades (P1)
**Goal:** Editing an amount mid-month ripples forward — through the month and into the next
month's live opening.
**Preconditions:** Two adjacent months, next month auto-carried (not manual).
**Path:** Edit an early transaction's amount in the prior month → observe both months.
**Oracle:** Every subsequent row's balance in the edited month shifts by the delta; the next
month's opening balance updates silently to the new closing balance.
**Traceability:** SPEC §9 Formula D, §11 propagation ("mathematically correct ledger
behavior").

### CUJ-10 — First-ever register initialization (P2)
**Goal:** The one remaining manual path: a brand-new account with no history.
**Preconditions:** Fresh account, no registers.
**Path:** Navigate to the register view → Initialize form appears → enter opening balance →
create.
**Oracle:** Form is shown only in this no-prior-register case; register is created with the
entered opening; navigating to the *next* month then auto-creates (proving the form never
appears again).
**Traceability:** SPEC §11 Initialize-modal cases (revised 2026-07).

### CUJ-11 — AI reconciliation session (P1)
**Goal:** The AI-differentiator journey: user runs reconciliation; suggestions arrive; user
accepts one and rejects one.
**Preconditions:** Register with rows shaped to produce match/mismatch suggestions;
`page.route()` intercepts the Anthropic API with a canned structured-JSON response.
**Path:** Open reconciliation → run session → review suggestions → accept one → reject one.
**Oracle:** Suggestions render from the mocked payload; accepting updates the transaction's
status; rejecting leaves it untouched; AI is suggester-not-decider throughout (no status
changes without explicit user action). Also asserts graceful handling of a mocked error
response.
**Traceability:** SPEC §13–§14.

### CUJ-12 — Yearly Summary (P2)
**Goal:** The year-at-a-glance view reflects existing registers and links back to months.
**Preconditions:** Several months of registers with known closing balances.
**Path:** Open Yearly Summary tab → verify rows → navigate to a month from the summary.
**Oracle:** Each existing month shows its figures; months without registers render as such;
navigation lands on the correct register.
**Traceability:** SPEC §15 (summary view).

## 5. Implementation waves

Wave 1 (CUJ-01–03) establishes the scaffold: config, global auth setup, seed helpers, CI job.
Wave 2 (CUJ-04–06) covers the month lifecycle now that its behavior is Phase-1.5-final.
Wave 3 (CUJ-07–10) completes lifecycle edges. Wave 4 (CUJ-11–12) adds the AI mock harness and
summary. Each wave lands as one reviewed patch with CI green.

## 6. Definition of done (per journey)

A journey is done when its spec passes 3× consecutively locally and in CI (no flake), uses
role-based selectors or documented exceptions, creates and tears down its own data, asserts
the oracle (not incidental DOM), and is traceable here by CUJ number.

---
*Maintained alongside SPEC.md; update this plan in the same PR as any journey change.*
