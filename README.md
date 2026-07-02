# Digital Check Register ![CI](https://github.com/axerazo/dcr/actions/workflows/ci.yml/badge.svg)

**Summary:** A personal project demonstrating ledger-first design, AI-assisted reconciliation, and human-in-the-loop AI engineering. Built collaboratively with Claude Code.

A ledger-first personal finance tool with AI-assisted reconciliation.

> **Status:** Active development, personal project. Not deployed. Not production-ready.

## Why this exists

Most personal finance apps treat the bank as the source of truth. This one inverts that — the user's register leads, bank data confirms.

The principle is simple: I record what I spend, I track its lifecycle (recorded → pending → cleared), and I use bank data to verify what I already know. AI helps surface discrepancies and suggest matches, but never makes decisions on my behalf. The user decides; AI assists.

This started as a replacement for a hand-built Excel check register I'd been using for years. The web app is being validated against that Excel workbook through parallel testing — both systems entering the same transactions, with reconciliation expected to match exactly.

## Current features

- Six-state transaction lifecycle (recorded, scheduled, in-flight, pending, cleared, void)
- Computed running balance, current balance, and available balance — distinct concepts, separately computed
- Month-by-month carry-forward with a four-state lifecycle (open → ready_to_close → soft_closed → hard_closed)
- AI-assisted daily reconciliation: surfaces gaps between register and bank state, suggests matches, lets the user decide
- Audit log for every state transition, including silent updates
- Multi-account ready (single-account in active use)

## Planned

- Bank sync via Plaid (Phase 3)
- CSV export / import (Phase 4)
- Statement-level reconciliation against bank monthly statements (Phase 4)
- Auto-carry of opening balance on month rollover (specified, not yet implemented)
- Account Settings UI for managing routing/account numbers (Phase 4)
- Supabase Edge Function migration for the Anthropic API call (currently client-side)
- Playwright end-to-end test suite

## Architecture highlights

- **Ledger-first model.** "Current balance" (everything non-void) and "Available balance" (cleared only) are distinct, separately computed values. The system never tries to mimic the bank's opaque "available balance" calculation, which sidesteps an entire class of timing-noise bugs.
- **Deterministic state transitions.** Status changes are driven by explicit user action or by data (a `scheduled_date` column drives scheduled/in-flight derivation). No regex parsing of free-text notes; no inferred state.
- **AI as suggester, not decider.** The AI reconciliation pipeline produces structured JSON suggestions; the user accepts or rejects each one. AI never writes to the database directly.
- **Differential validation.** The system has been parallel-tested against an existing Excel implementation across multiple months, achieving identical reconciliation as the correctness benchmark. Unit tests cover the financial math layer.

For full architectural detail, state machines, and design decisions, see [SPEC.md](./SPEC.md).

## Tech stack

- React 19, TypeScript, Vite
- Tailwind CSS
- Supabase (Postgres, Auth, Row-Level Security)
- Anthropic Claude API for reconciliation suggestions
- Vitest for unit tests; Playwright planned

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

## Testing

```bash
npm run test       # Run Vitest unit tests
npm run test:ui    # Run Vitest with UI
```

The unit suite currently covers the `balance.ts` financial math layer (28 tests): running balance computation, current/available/closing balance derivation, in-flight detection, and currency comparison with half-cent tolerance.

End-to-end testing has been done manually via parallel comparison against an Excel reference workbook. A Playwright suite is planned.

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
SPEC.md              Detailed system specification (continuously maintained)
README.md            This file
```

## Approach

This project is built collaboratively with Claude as an implementation partner. Design and review happen in conversation; Claude Code handles implementation. SPEC.md serves as the synchronization point between design sessions and implementation sessions, and as a living document of architectural decisions and their rationale.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
