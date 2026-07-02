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

## Current phase context (update as phases complete)

- Phase 0 (audit) complete 2026-07-01 — see `docs/DCR_Phase0_Audit.md`
- Phase 1 (golden-master suite on the calc engine) — IN PROGRESS
- Phase 2 (integer-cents migration, dependency majors, Edge Function key proxy) — pending
- Phase 3 (AI-augmented QA layer: subagents, hooks, MCP server, plugin) — pending
