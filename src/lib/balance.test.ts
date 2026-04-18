import { describe, it, expect } from 'vitest'
import {
  computeRunningBalance,
  computeCurrentBalance,
  computeAvailableBalance,
  computeClosingBalance,
  isInFlight,
  currencyEq,
} from './balance'
import type { DbTransaction } from '@/types'

// Build a YYYY-MM-DD string from a Date in LOCAL time (not UTC).
// isInFlight parses dates as local midnight, so tests must match that convention.

// toISOString() returns UTC. In timezones west of UTC (like EST),
// computing "yesterday" in the evening via toISOString can land on
// "today UTC", which isInFlight correctly sees as not-past.
// We need local-time date strings to match how the production code
// parses scheduled_date. Never substitute toISOString() here.

function localDateIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Fixture factory ─────────────────────────────────────────────────────────

let seq = 0
function tx(overrides: Partial<DbTransaction> & { status: DbTransaction['status'] }): DbTransaction {
  seq++
  return {
    id: `tx-${seq}`,
    register_id: 'reg-1',
    row_order: seq,
    check_number: null,
    date: '2025-04-01',
    description: `Transaction ${seq}`,
    debit: null,
    credit: null,
    notes: null,
    scheduled_date: null,
    created_at: '2025-04-01T00:00:00Z',
    updated_at: '2025-04-01T00:00:00Z',
    ...overrides,
  }
}

// ── computeRunningBalance ────────────────────────────────────────────────────

describe('computeRunningBalance', () => {
  it('empty array returns empty array', () => {
    expect(computeRunningBalance(1000, [])).toEqual([])
  })

  it('single credit adds to opening balance', () => {
    const result = computeRunningBalance(1000, [tx({ status: 'cleared', credit: 200 })])
    expect(result[0].balance).toBe(1200)
  })

  it('single debit subtracts from opening balance', () => {
    const result = computeRunningBalance(1000, [tx({ status: 'cleared', debit: 300 })])
    expect(result[0].balance).toBe(700)
  })

  it('mixed credits and debits compute running total correctly', () => {
    const rows = [
      tx({ status: 'cleared', credit: 500 }),
      tx({ status: 'cleared', debit: 150 }),
      tx({ status: 'pending', debit: 75 }),
      tx({ status: 'recorded', credit: 200 }),
    ]
    const result = computeRunningBalance(1000, rows)
    expect(result[0].balance).toBe(1500)
    expect(result[1].balance).toBe(1350)
    expect(result[2].balance).toBe(1275)
    expect(result[3].balance).toBe(1475)
  })

  it('void transaction gets balance=null and does not affect subsequent rows', () => {
    const rows = [
      tx({ status: 'cleared', credit: 100 }),
      tx({ status: 'void', debit: 999 }),
      tx({ status: 'cleared', debit: 50 }),
    ]
    const result = computeRunningBalance(1000, rows)
    expect(result[0].balance).toBe(1100)
    expect(result[1].balance).toBeNull()
    expect(result[2].balance).toBe(1050)
  })

  it('transaction with null debit and null credit gets balance=null and does not affect subsequent rows', () => {
    const rows = [
      tx({ status: 'cleared', credit: 200 }),
      tx({ status: 'recorded', debit: null, credit: null }),
      tx({ status: 'cleared', debit: 100 }),
    ]
    const result = computeRunningBalance(1000, rows)
    expect(result[0].balance).toBe(1200)
    expect(result[1].balance).toBeNull()
    expect(result[2].balance).toBe(1100)
  })

  it('first transaction void: that row is null, next real transaction computes from opening balance', () => {
    const rows = [
      tx({ status: 'void', debit: 500 }),
      tx({ status: 'cleared', credit: 100 }),
    ]
    const result = computeRunningBalance(1000, rows)
    expect(result[0].balance).toBeNull()
    expect(result[1].balance).toBe(1100)
  })
})

// ── computeCurrentBalance ────────────────────────────────────────────────────

describe('computeCurrentBalance', () => {
  it('empty array returns opening balance', () => {
    expect(computeCurrentBalance(500, [])).toBe(500)
  })

  it('excludes void; includes scheduled, in_flight, pending, cleared, recorded', () => {
    const rows = [
      tx({ status: 'scheduled', credit: 100 }),
      tx({ status: 'in_flight', debit: 50 }),
      tx({ status: 'pending', debit: 25 }),
      tx({ status: 'cleared', credit: 200 }),
      tx({ status: 'recorded', debit: 75 }),
      tx({ status: 'void', debit: 9999 }),
    ]
    // 1000 + 100 - 50 - 25 + 200 - 75 = 1150
    expect(computeCurrentBalance(1000, rows)).toBe(1150)
  })

  it('mixed statuses: math matches hand-calculated expected', () => {
    const rows = [
      tx({ status: 'cleared', credit: 1500 }),
      tx({ status: 'pending', debit: 200 }),
      tx({ status: 'void', credit: 500 }),   // excluded
      tx({ status: 'recorded', debit: 100 }),
    ]
    // 2000 + 1500 - 200 - 100 = 3200
    expect(computeCurrentBalance(2000, rows)).toBe(3200)
  })
})

// ── computeAvailableBalance ──────────────────────────────────────────────────

describe('computeAvailableBalance', () => {
  it('empty array returns opening balance', () => {
    expect(computeAvailableBalance(800, [])).toBe(800)
  })

  it('no cleared transactions returns opening balance', () => {
    const rows = [
      tx({ status: 'pending', debit: 100 }),
      tx({ status: 'recorded', credit: 200 }),
      tx({ status: 'void', debit: 50 }),
    ]
    expect(computeAvailableBalance(800, rows)).toBe(800)
  })

  it('includes ONLY cleared; excludes all other statuses including void', () => {
    const rows = [
      tx({ status: 'cleared', credit: 300 }),
      tx({ status: 'cleared', debit: 100 }),
      tx({ status: 'pending', debit: 500 }),    // excluded
      tx({ status: 'in_flight', credit: 999 }),  // excluded
      tx({ status: 'void', credit: 999 }),        // excluded
    ]
    // 1000 + 300 - 100 = 1200
    expect(computeAvailableBalance(1000, rows)).toBe(1200)
  })
})

// ── computeClosingBalance ────────────────────────────────────────────────────

describe('computeClosingBalance', () => {
  it('returns balance of last non-void transaction', () => {
    const rows = [
      tx({ status: 'cleared', credit: 200 }),
      tx({ status: 'cleared', debit: 50 }),
    ]
    // 1000 + 200 - 50 = 1150
    expect(computeClosingBalance(1000, rows)).toBe(1150)
  })

  it('empty transactions returns opening balance', () => {
    expect(computeClosingBalance(1500, [])).toBe(1500)
  })

  it('only void transactions returns opening balance', () => {
    const rows = [
      tx({ status: 'void', debit: 100 }),
      tx({ status: 'void', credit: 500 }),
    ]
    expect(computeClosingBalance(1500, rows)).toBe(1500)
  })

  it('last row is void: returns balance of last non-void row', () => {
    const rows = [
      tx({ status: 'cleared', credit: 300 }),
      tx({ status: 'cleared', debit: 100 }),
      tx({ status: 'void', debit: 9999 }),
    ]
    // Non-void rows: +300 - 100 → 1000 + 300 - 100 = 1200
    expect(computeClosingBalance(1000, rows)).toBe(1200)
  })
})

// ── isInFlight ───────────────────────────────────────────────────────────────

describe('isInFlight', () => {
  it('null returns false', () => {
    expect(isInFlight(null)).toBe(false)
  })

  it('undefined returns false', () => {
    expect(isInFlight(undefined)).toBe(false)
  })

  it('date in the future (tomorrow) returns false', () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    const iso = localDateIso(d)
    expect(isInFlight(iso)).toBe(false)
  })

  it('date today returns false (today is not past)', () => {
    const iso = localDateIso(new Date())
    expect(isInFlight(iso)).toBe(false)
  })

  it('date in the past (yesterday) returns true', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const iso = localDateIso(d)
    expect(isInFlight(iso)).toBe(true)
  })

  it('invalid date string returns false', () => {
    expect(isInFlight('not-a-date')).toBe(false)
  })

  it('handles ISO datetime strings with T suffix correctly', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    // Append a fake time suffix — isInFlight must strip it before parsing
    const iso = localDateIso(d) + 'T12:00:00.000Z'
    expect(isInFlight(iso)).toBe(true)
  })
})

// ── currencyEq ───────────────────────────────────────────────────────────────

// IEEE 754 note: 100.005 - 100 underflows to ~0.00499999..., which
// is within the half-cent tolerance. Using 100.006 to test the
// "at threshold" case avoids the float representation artifact.
// This is not a bug — currencyEq is behaving as designed.

describe('currencyEq', () => {
  it('exact match returns true', () => {
    expect(currencyEq(100, 100)).toBe(true)
  })

  it('difference within 0.005 returns true', () => {
    expect(currencyEq(100, 100.004)).toBe(true)
    expect(currencyEq(100.004, 100)).toBe(true)
  })

  it('difference at or above 0.005 returns false', () => {
    expect(currencyEq(100, 100.006)).toBe(false)
    expect(currencyEq(100, 100.01)).toBe(false)
  })

  it('works symmetrically for negative differences', () => {
    expect(currencyEq(100, 99.996)).toBe(true)
    expect(currencyEq(100, 99.993)).toBe(false)
  })
})
