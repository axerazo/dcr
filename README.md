# Digital Check Register ![CI](https://github.com/axerazo/dcr/actions/workflows/ci.yml/badge.svg)

**A differential validation harness for AI-generated output — and the ledger-first finance application it validates.**

> **Status:** Active development, personal project. Not deployed. Not production-ready.

Most projects that use an LLM verify the output by looking at it. This one doesn't. Every figure the AI-assisted reconciliation engine produces is diffed against an independently built ground-truth oracle, continuously, as the system evolves.

The finance application is the system under test. The validation approach is the point.

## Why this exists

Most personal finance apps treat the bank as the source of truth. This one inverts that — the user's register leads, bank data confirms.

The principle is simple: I record what I spend, I track its lifecycle (recorded → pending → cleared), and I use bank data to verify what I already know. AI helps surface discrepancies and suggest matches, but never makes decisions on my behalf. The user decides; AI assists.

This started as a replacement for a hand-built Excel check register I'd been using for years. That workbook became something more useful than a starting point: it is now the correctness oracle the application is validated against.

## The validation problem

"It looked right" is not a correctness standard.

When a model classifies a financial transaction there is no fixed expected value to assert against, and a plausible-looking wrong answer is indistinguishable from a correct one at a glance. That is the central testing problem in AI-backed systems, and conventional assertions don't reach it.

The approach here: maintain a parallel implementation of the same financial logic in a separate system — the Excel workbook, built independently of the application — and treat it as the oracle. Every calculation the application produces is diffed against it. Divergence is a defect in one of the two, and the process forces you to determine which.

### What the method actually caught

**The carry-forward rule.** The running-balance logic depends on how a register carries a balance forward. The rule was resolved empirically, by reading the oracle's formulas rather than by asking anyone: it is *status-blind* — the last amount-bearing, non-void row, regardless of cleared or pending status. That finding contradicted both my own verbal description of the rule and the AI's initial analysis of it. Two independent accounts of the requirement were wrong; the oracle was right.

**A latent defect in the oracle itself.** Differential validation cuts both ways. The process surfaced a long-standing bug in the Excel model — a `LOOKUP(100000, ...)` that silently mis-resolved above its literal ceiling, corrected to `LOOKUP(9.99E+307, ...)`. The ground truth had been quietly wrong for years, and the harness is what exposed it.

The second case is the more useful one. A validation strategy that can only ever indict the system under test isn't validation — it's confirmation. This one indicted the oracle.

## Current features

- Six-state transaction lifecycle (recorded, scheduled, in-flight, pending, cleared, void)
- Computed running balance, current balance, and available balance — distinct concepts, separately computed
- Month-by-month carry-forward with a four-state lifecycle (open → ready_to_close → soft_closed → hard_closed)
- AI-assisted daily reconciliation: surfaces gaps between register and bank state, suggests matches, lets the user decide
- Audit log for every state transition, including silent updates
- Multi-account ready (single-account in active use)

## Architecture highlights

- **Ledger-first model.** "Current balance" (everything non-void) and "Available balance" (cleared only) are distinct, separately computed values. The system never tries to mimic the bank's opaque "available balance" calculation, which sidesteps an entire class of timing-noise bugs.
- **Deterministic state transitions.** Status changes are driven by explicit user action or by data (a `scheduled_date` column drives scheduled/in-flight derivation). No regex parsing of free-text notes; no inferred state.
- **AI as suggester, not decider.** The reconciliation pipeline produces structured JSON suggestions; the user accepts or rejects each one. AI never writes to the database directly.
- **Differential validation as a standing process.** Not a one-time comparison — every financial calculation is reconciled against the Excel oracle as the application evolves, with divergences investigated in both directions.

For full architectural detail, state machines, and design decisions, see [SPEC.md](./SPEC.md).

## Testing

```bash
npm run test       # Vitest unit tests
npm run test:ui    # Vitest with UI
npm run test:e2e   # Playwright end-to-end suite
```

**Unit suite — 79 tests, CI green.** Covers the `balance.ts` financial math layer: running balance computation, current/available/closing balance derivation, in-flight detection, and currency comparison with half-cent tolerance. Established as a golden-master suite in Phase 1 and extended through Phase 1.5.

**End-to-end.** Playwright infrastructure is standing: local Supabase stack, complete migration schema including GRANT statements, environment bootstrap script, and CI jobs green on GitHub Actions. CUJ specs are being implemented wave by wave.

**[`docs/e2e/TEST_PLAN.md`](./docs/e2e/TEST_PLAN.md)** defines the E2E strategy: 12 critical user journeys across four implementation waves, traceability to SPEC sections, P0–P2 priority tiering, an explicit oracle definition per journey, and a written definition of done.

**Differential validation** runs continuously against the Excel reference workbook — see [The validation problem](#the-validation-problem) above.

## Known deviations

Documented rather than discovered — this section exists on purpose.

- **SPEC §19:** the Anthropic API key currently runs browser-side via `dangerouslyAllowBrowser: true` rather than being proxied through a Supabase Edge Function. A known, accepted deviation for the current single-user local deployment, tracked for remediation. Not suitable for a multi-user or hosted deployment as written.

## Planned

- Supabase Edge Function migration for the Anthropic API call (see Known deviations)
- Remaining Playwright CUJ waves per `TEST_PLAN.md`
- Bank sync via Plaid (Phase 3)
- CSV export / import (Phase 4)
- Statement-level reconciliation against bank monthly statements (Phase 4)
- Account Settings UI for managing routing/account numbers (Phase 4)

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS · Supabase (Postgres, Auth, Row-Level Security) · Anthropic Claude API · Vitest · Playwright · GitHub Actions

## Getting started

This project requires your own Supabase project and Anthropic API key. It is not currently set up for easy onboarding by others.

```bash
# Prerequisites: Node 20+, npm, Supabase CLI
git clone <repo-url>
cd <project>
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase URL, anon key, and Anthropic API key

# Set up database
supabase link --project-ref <your-project-ref>
supabase db push

# Run dev server
npm run dev
```

## Project structure

```
src/
  components/        UI components (register, accounts, reconciliation panels)
  hooks/             React hooks for data access (useTransactions, etc.)
  lib/               Pure logic — balance computation, AI reconciliation pipeline
    balance.ts       Core financial math (unit-tested)
    reconciliation/  System prompt, context builder, API caller, JSON parser
  types/             TypeScript type definitions
supabase/
  migrations/        Database schema migrations
docs/e2e/
  TEST_PLAN.md       E2E strategy: CUJs, waves, oracles, definition of done
SPEC.md              Detailed system specification (continuously maintained)
README.md            This file
```

## Approach

Built with Claude as an implementation partner, under a deliberate division of labor rather than an open-ended one.

Design and architectural decisions happen in conversation. Claude Code handles implementation and infrastructure scaffolding. **End-to-end test logic is human-authored** — I write the CUJ specs, Claude reviews them as a peer reviewer would review a pull request. `SPEC.md` is the synchronization point between design sessions and implementation sessions, and a living record of architectural decisions and their rationale.

The differential validation described above exists precisely because AI-assisted output needs an independent correctness standard. The methodology is part of the project, not incidental to it.

## License

MIT — see [LICENSE](LICENSE).
