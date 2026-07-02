# DCR Phase 0 Audit — July 1, 2026

Fresh-clone audit of `github.com/axerazo/dcr` @ `78ea1f3` ("Updated configs").

## Verdict: Salvage. A rewrite is not on the table.

The codebase is small (~37 source files, ~1,100 lines of core lib/logic), cleanly layered
(components / hooks / lib / store / types), spec-driven (SPEC.md, 122 sections), and
well-commented with formula references back to the spec. The balance engine is a set of
pure functions with a "balance is NEVER stored" invariant documented at the top of the
file. This is a healthy foundation. Rewriting it would destroy embedded knowledge
(month lifecycle edge cases, timezone-safe date parsing, void-row semantics) for zero
architectural gain. **Decision: incremental modernization.**

## Verified green baseline

- `npm ci` → clean install
- `npm run test:run` → **28/28 tests pass** (single file: `src/lib/balance.test.ts`)
- Repo state matches expectations: React 18.3 + TS + Vite 6 + Tailwind 3 + Supabase,
  reconciliation via Anthropic SDK, 5 SQL migrations, existing `.claude/agents/`
  subagent with project memory, 2 GitHub workflows (Claude review only)

## Findings — Priority 1 (fix before any feature work)

**P1-1. `npm run build` is BROKEN.** `tsc -b` fails on 4 unused-symbol errors:
- `RegisterView.tsx:24` — `DbRegister` declared, never used
- `RegisterView.tsx:66` — `addUnlockedRegister` declared, never read
- `balance.ts:125` — `floatEq` is dead code
- `reconciliationService.ts:8` — `ParseErrorType` declared, never used

~15-minute fix, but it means the repo cannot currently produce a production build.
Nobody noticed because nothing runs the build automatically — see P1-3.

**P1-2. `npm run lint` is BROKEN.** ESLint 9 is installed but no `eslint.config.js`
(flat config) exists and no legacy `.eslintrc` either. Lint exits with the migration
notice and checks nothing.

**P1-3. No CI.** The two GitHub workflows are Claude code-review only. Tests, build,
and lint never run on push — which is exactly how P1-1 and P1-2 went unnoticed.
Add a minimal GitHub Actions workflow: install → lint → typecheck/build → test.
For a QA professional's portfolio repo, a green CI badge is table stakes.

**P1-4. Anthropic API key runs in the browser.** `reconciliationService.ts` uses
`VITE_ANTHROPIC_API_KEY` with `dangerouslyAllowBrowser: true`. Two problems:
1. Any `VITE_`-prefixed variable is compiled into the JS bundle — a built copy of the
   app contains the key in plaintext.
2. For a repo whose purpose is demonstrating AI engineering judgment to hiring
   managers, this is the first thing a senior reviewer flags.

Acceptable for a localhost-only personal tool; not acceptable as the portfolio story.
Fix: proxy Claude calls through a **Supabase Edge Function** (key lives server-side as
a Supabase secret; the app calls the function with the user's auth token). This is also
a strong resume/interview artifact: "moved LLM inference behind an authenticated
server-side proxy."

## Findings — Priority 2 (address during modernization)

**P2-1. Floating-point currency arithmetic.** The engine accumulates
`running += (credit ?? 0) - (debit ?? 0)` on IEEE doubles, with a half-cent
`currencyEq` tolerance papering over drift. Standard fix for financial software:
integer cents (or a decimal type) end-to-end. **This is the highest-risk change in the
codebase and must not be attempted until the golden-master suite (Phase 1) is in place.**
The tolerance function is the smell that says drift has already been observed.

**P2-2. Dependency staleness** (current → latest as of 2026-07-01):
| Package | Current | Latest |
|---|---|---|
| react / react-dom | 18.3.1 | 19.2.7 |
| vite | 6.x | 8.1.2 |
| vitest | 2.1.9 | 4.1.9 |
| tailwindcss | 3.4.14 | 4.3.2 |
| react-router-dom | 6.27.0 | 7.18.1 |
| @anthropic-ai/sdk | 0.108.0 | 0.109.1 |

Nothing urgent or vulnerable-looking, but React 18→19, Tailwind 3→4, and Vite 6→8 are
majors. Sequence: **after** Phase 1's golden-master suite exists, one major at a time,
suite green between each.

**P2-3. Dead dependency: `dexie`.** Listed in `dependencies`, imported nowhere in
`src/`. Remove it (or implement the offline layer it was staged for — but decide).

**P2-4. `package.json` name is still `"pfm"`.** Violates your locked naming
convention (DCR canonical). Rename to `"dcr"`.

**P2-5. Résumé/repo factual drift — flagging per your standing rule.** Your résumé
and project notes say **React 19** and **claude-sonnet-4-5**. The repo is
**React 18.3.1**, and `reconciliationService.ts` calls **claude-sonnet-4-6**. An
interviewer who clones the repo can catch both. Cleanest resolution: the React 19
upgrade in P2-2 makes the résumé true, and update notes/résumé to Sonnet 4.6 (which
reads better anyway).

## Findings — Priority 3 (test-coverage map)

Tested: `lib/balance.ts` only (28 tests, good coverage of the five formulas + helpers).

Untested, in risk order:
1. `lib/reconciliation/reconciliationService.ts` — response parsing / malformed-block
   recovery / `ReconciliationParseError` path (pure logic, very testable)
2. `lib/monthStatus.ts` — month lifecycle transitions (open → ready_to_close →
   soft_closed → hard_closed); state machines want exhaustive tests
3. `lib/reconciliation/buildContext.ts` — context assembly for the LLM
4. Hooks (`useTransactions`, `useRegister`, `useAccounts`) — need Supabase mocking;
   lower priority, higher effort
5. E2E — Playwright is "planned"; defer until after Phase 1/2

## Recommended sequence

1. **Now (~1 session):** Fix build (P1-1), add `eslint.config.js` (P1-2), CI workflow
   (P1-3), remove dexie (P2-3), rename package (P2-4), commit `CLAUDE.md`.
2. **Phase 1:** Golden-master suite — sanitized fixture set derived from the Excel
   oracle (real edge cases, fake amounts/payees), asserting all five formulas across
   full month lifecycles. Excel workbook stays local; fixtures go in the repo.
3. **Phase 2:** Integer-cents migration (P2-1), then dependency majors one at a time
   (P2-2), suite green between each. Edge Function proxy for the API key (P1-4).
4. **Phase 3:** AI-augmented QA layer — test-generation subagent, post-edit hook
   running the suite, MCP server, plugin bundle. Each one a portfolio artifact.
