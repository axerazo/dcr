// ============================================================
// Golden-master suite — SPEC §9 Formulas A–E validated against
// the independent Excel oracle (see docs/golden-master/FIXTURE_SCHEMA.md).
//
// Data-driven: every JSON file in __fixtures__/golden/ is discovered
// automatically. Add coverage by adding fixtures, never by editing
// this file.
//
// Carry-forward rule (settled 2026-07, empirically from workbook
// formulas): carry_forward = last amount-bearing non-void row balance
// = computeClosingBalance. Status is irrelevant except void.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeRunningBalance,
  computeCurrentBalance,
  computeAvailableBalance,
  computeClosingBalance,
  computeBalanceSummary,
  currencyEq,
} from './balance'
import { computeLastClearedRunningBalance } from './monthStatus'
import type { DbTransaction, TransactionStatus } from '@/types'

// ── Fixture types (mirror docs/golden-master/FIXTURE_SCHEMA.md) ─────────────

interface FixtureTransaction {
  row_order: number
  date: string | null
  description: string
  status: TransactionStatus
  debit: number | null
  credit: number | null
  check_number?: number | null
  notes?: string | null
}

interface FixtureMonth {
  label: string
  opening_balance: number
  opening_source: 'manual' | 'carry'
  transactions: FixtureTransaction[]
  expected: {
    running_balances: (number | null)[]
    current_balance: number
    available_balance: number
    actual_balance: number
    closing_balance: number
    is_reconciled: boolean
    available_source: string
  }
}

interface Fixture {
  schema_version: number
  scenario: string
  source: string
  description: string
  months: FixtureMonth[]
  expected_chain?: { carry_forwards: number[] }
}

// ── Fixture discovery ────────────────────────────────────────────────────────

const fixtureModules = import.meta.glob<Fixture>('./__fixtures__/golden/*.json', {
  eager: true,
  import: 'default',
})
const fixtures: Fixture[] = Object.values(fixtureModules)

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDb(month: FixtureMonth): DbTransaction[] {
  return month.transactions.map((t, i) => ({
    id: `${month.label}-tx-${i + 1}`,
    register_id: `reg-${month.label}`,
    row_order: t.row_order,
    check_number: t.check_number ?? null,
    date: t.date ?? `${month.label}-01`,
    description: t.description,
    status: t.status,
    debit: t.debit,
    credit: t.credit,
    notes: t.notes ?? null,
    scheduled_date: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }))
}

function expectCurrency(actual: number, expected: number, context: string) {
  expect(currencyEq(actual, expected), `${context}: expected ${expected}, got ${actual}`).toBe(true)
}

function expectBalanceArray(
  actual: (number | null)[],
  expected: (number | null)[],
  context: string,
) {
  expect(actual.length, `${context}: row count`).toBe(expected.length)
  actual.forEach((a, i) => {
    const e = expected[i]
    if (e === null) {
      expect(a, `${context} row ${i + 1}: expected null balance`).toBeNull()
    } else {
      expect(a, `${context} row ${i + 1}: expected numeric balance`).not.toBeNull()
      expectCurrency(a as number, e, `${context} row ${i + 1}`)
    }
  })
}

function voidRow(monthLabel: string, position: string): DbTransaction {
  return {
    id: `${monthLabel}-injected-void-${position}`,
    register_id: `reg-${monthLabel}`,
    row_order: -1, // ordering is array position; row_order unused by the engine
    check_number: null,
    date: `${monthLabel}-15`,
    description: `Injected void (${position})`,
    status: 'void',
    debit: 999.99,
    credit: null,
    notes: null,
    scheduled_date: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const NON_CLEARED_NON_VOID: TransactionStatus[] = [
  'recorded',
  'scheduled',
  'in_flight',
  'pending',
]

// ── Sanity: fixtures exist ───────────────────────────────────────────────────

describe('golden-master fixture discovery', () => {
  it('finds at least the three seed fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(3)
  })
  it('all fixtures declare schema_version 1 and unique scenarios', () => {
    const names = fixtures.map((f) => f.scenario)
    expect(new Set(names).size).toBe(names.length)
    fixtures.forEach((f) => expect(f.schema_version).toBe(1))
  })
})

// ── Per-fixture oracle assertions ────────────────────────────────────────────

for (const fixture of fixtures) {
  describe(`golden: ${fixture.scenario}`, () => {
    for (const month of fixture.months) {
      describe(`month ${month.label}`, () => {
        const txs = toDb(month)
        const exp = month.expected

        it('Formula D — per-row running balances match the oracle', () => {
          const rows = computeRunningBalance(month.opening_balance, txs)
          expectBalanceArray(
            rows.map((r) => r.balance),
            exp.running_balances,
            `${fixture.scenario}/${month.label}`,
          )
        })

        it('Formula A — current balance matches the oracle', () => {
          expectCurrency(
            computeCurrentBalance(month.opening_balance, txs),
            exp.current_balance,
            'current_balance',
          )
        })

        it('Formula B — available balance matches the oracle', () => {
          expectCurrency(
            computeAvailableBalance(month.opening_balance, txs),
            exp.available_balance,
            'available_balance',
          )
        })

        it('Formula C — actual ≡ current (same computation, different label)', () => {
          const summary = computeBalanceSummary(month.opening_balance, txs)
          expectCurrency(summary.actual_balance, exp.actual_balance, 'actual_balance')
          expect(summary.actual_balance).toBe(summary.current_balance)
        })

        it('Formula E input — closing balance matches the oracle (last-row rule)', () => {
          expectCurrency(
            computeClosingBalance(month.opening_balance, txs),
            exp.closing_balance,
            'closing_balance',
          )
        })

        it('balance summary — is_reconciled and gap are consistent', () => {
          const summary = computeBalanceSummary(month.opening_balance, txs)
          expect(summary.is_reconciled).toBe(exp.is_reconciled)
          expectCurrency(
            summary.gap,
            exp.current_balance - exp.available_balance,
            'gap',
          )
        })

        it('convergence invariant — when fully reconciled, all formulas agree', () => {
          const summary = computeBalanceSummary(month.opening_balance, txs)
          if (summary.is_reconciled) {
            expectCurrency(summary.current_balance, summary.available_balance, 'converged current=available')
            expectCurrency(
              computeClosingBalance(month.opening_balance, txs),
              summary.current_balance,
              'converged closing=current',
            )
          } else {
            // Not reconciled: closing (status-blind) still equals current by Formula C/E.
            expectCurrency(
              computeClosingBalance(month.opening_balance, txs),
              summary.current_balance,
              'closing=current regardless of status',
            )
          }
        })

        // ── Metamorphic property 1: void injection changes nothing ──────────
        it('metamorphic — injecting a void row at any position changes no balance', () => {
          const positions: [string, number][] = [
            ['first', 0],
            ['middle', Math.floor(txs.length / 2)],
            ['last', txs.length],
          ]
          const baseBalances = computeRunningBalance(month.opening_balance, txs)
            .map((r) => r.balance)
            .filter((b) => b !== null)

          for (const [name, idx] of positions) {
            const variant = [...txs.slice(0, idx), voidRow(month.label, name), ...txs.slice(idx)]

            const variantRows = computeRunningBalance(month.opening_balance, variant)
            // The injected row itself must be null.
            expect(variantRows[idx].balance, `void row (${name}) balance`).toBeNull()
            // Every original row's balance is unchanged.
            const variantBalances = variantRows
              .filter((r) => !r.id.includes('injected-void'))
              .map((r) => r.balance)
              .filter((b) => b !== null)
            expectBalanceArray(variantBalances, baseBalances, `void-inject ${name}`)

            expectCurrency(
              computeCurrentBalance(month.opening_balance, variant),
              exp.current_balance,
              `void-inject ${name}: current`,
            )
            expectCurrency(
              computeAvailableBalance(month.opening_balance, variant),
              exp.available_balance,
              `void-inject ${name}: available`,
            )
            expectCurrency(
              computeClosingBalance(month.opening_balance, variant),
              exp.closing_balance,
              `void-inject ${name}: closing`,
            )
          }
        })

        // ── Metamorphic property 2: non-cleared status relabeling ────────────
        it('metamorphic — relabeling non-cleared/non-void statuses changes no formula output', () => {
          const rotate = (s: TransactionStatus): TransactionStatus => {
            const i = NON_CLEARED_NON_VOID.indexOf(s)
            if (i === -1) return s // cleared and void untouched
            return NON_CLEARED_NON_VOID[(i + 1) % NON_CLEARED_NON_VOID.length]
          }
          const variant = txs.map((t) => ({ ...t, status: rotate(t.status) }))

          expectBalanceArray(
            computeRunningBalance(month.opening_balance, variant).map((r) => r.balance),
            exp.running_balances,
            'status-permute: Formula D',
          )
          expectCurrency(
            computeCurrentBalance(month.opening_balance, variant),
            exp.current_balance,
            'status-permute: current',
          )
          expectCurrency(
            computeAvailableBalance(month.opening_balance, variant),
            exp.available_balance,
            'status-permute: available (cleared set unchanged)',
          )
          expectCurrency(
            computeClosingBalance(month.opening_balance, variant),
            exp.closing_balance,
            'status-permute: closing',
          )
        })
      })
    }

    // ── Chain assertions ─────────────────────────────────────────────────────
    if (fixture.months.length > 1) {
      it('Formula E — carry-forward chain links verify end-to-end', () => {
        const oracleCarries = fixture.expected_chain?.carry_forwards
        expect(oracleCarries, 'multi-month fixture must declare expected_chain').toBeDefined()
        expect(oracleCarries!.length).toBe(fixture.months.length - 1)

        for (let i = 0; i < fixture.months.length - 1; i++) {
          const prior = fixture.months[i]
          const next = fixture.months[i + 1]
          const computedClosing = computeClosingBalance(prior.opening_balance, toDb(prior))

          // App's computed closing == oracle's recorded carry-forward.
          expectCurrency(
            computedClosing,
            oracleCarries![i],
            `chain link ${prior.label}→${next.label}: computed closing vs oracle carry`,
          )
          // Oracle's carry-forward == next month's opening as recorded.
          expectCurrency(
            next.opening_balance,
            oracleCarries![i],
            `chain link ${prior.label}→${next.label}: next opening vs oracle carry`,
          )
          expect(next.opening_source).toBe('carry')
        }
      })
    }
  })
}

// ── Characterization: legacy last-cleared rule divergence ────────────────────
// computeLastClearedRunningBalance implements the superseded last-cleared rule.
// Under trailing non-cleared rows it diverges from the oracle by exactly the
// sum of amounts after the last cleared row. This test PINS the current
// behavior and documents the divergence; it must be updated (or the function
// deleted) when RegisterView adopts the oracle rule (computeClosingBalance).
// TODO(phase-1.5): replace last-cleared carry-forward wiring with closing-balance rule.

describe('characterization: legacy last-cleared carry-forward rule', () => {
  const trailing = fixtures.find((f) => f.scenario === 'seed_trailing_pending')

  it('diverges from the oracle when the month ends with pending rows', () => {
    expect(trailing).toBeDefined()
    const month = trailing!.months[0]
    const txs = toDb(month)

    const lastCleared = computeLastClearedRunningBalance(month.opening_balance, txs)
    const oracleClosing = computeClosingBalance(month.opening_balance, txs)

    // Pinned current behavior: 870 (running balance at last cleared row).
    expectCurrency(lastCleared, 870.0, 'legacy last-cleared value')
    // Oracle rule: 840 (last amount-bearing row, status-blind).
    expectCurrency(oracleClosing, 840.0, 'oracle closing value')
    // The divergence is real and equals the trailing pending debit.
    expect(currencyEq(lastCleared, oracleClosing)).toBe(false)
    expectCurrency(lastCleared - oracleClosing, 30.0, 'divergence = trailing pending amount')
  })

  it('converges with the oracle when every row is cleared', () => {
    const happy = fixtures.find((f) => f.scenario === 'seed_happy_path')
    expect(happy).toBeDefined()
    const month = happy!.months[0]
    const txs = toDb(month)
    expectCurrency(
      computeLastClearedRunningBalance(month.opening_balance, txs),
      computeClosingBalance(month.opening_balance, txs),
      'convergence at full reconciliation',
    )
  })
})
