// Characterization tests for the month roll-over decisions (SPEC §2, §11).
// Written against the RegisterView.tsx behavior before the extraction
// (#40) and kept unchanged through it. Two cases pin current behavior
// that is logged in docs/BACKLOG.md as needs-decision — don't "fix" them
// here without that decision.

import { describe, it, expect } from 'vitest'
import {
  isArchived,
  autoCreateOpeningBalance,
  shouldAutoUpdateNextOpening,
  shouldShowMismatchPrompt,
} from './rollover'
import type { DbRegister, DbTransaction, MonthStatus } from '@/types'

// ── Fixture factories ───────────────────────────────────────────────────────

function reg(overrides: Partial<DbRegister> = {}): DbRegister {
  return {
    id: 'reg-next',
    account_id: 'acct-1',
    month: 5,
    year: 2025,
    opening_balance: 1000,
    current_bank_bal: null,
    available_bank_bal: null,
    is_locked: false,
    is_manual_opening: false,
    month_status: 'open',
    last_closed_type: null,
    created_at: '2025-05-01T00:00:00Z',
    updated_at: '2025-05-01T00:00:00Z',
    ...overrides,
  }
}

let seq = 0
function tx(overrides: Partial<DbTransaction> & { status: DbTransaction['status'] }): DbTransaction {
  seq++
  return {
    id: `tx-${seq}`,
    register_id: 'reg-src',
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

// This month open, closing 1200; next month fresh open with opening 1000.
const thisMonth = (month_status: MonthStatus = 'open') => ({ month_status })
const base = { register: thisMonth(), nextMonthReg: reg(), closingBalance: 1200 }

// ── isArchived ──────────────────────────────────────────────────────────────

describe('isArchived', () => {
  it.each<[MonthStatus, boolean]>([
    ['open', false],
    ['ready_to_close', false],
    ['soft_closed', true],
    ['hard_closed', true],
  ])('%s → %s', (month_status, expected) => {
    expect(isArchived({ month_status })).toBe(expected)
  })

  it('missing register is not archived', () => {
    expect(isArchived(null)).toBe(false)
    expect(isArchived(undefined)).toBe(false)
  })
})

// ── autoCreateOpeningBalance ────────────────────────────────────────────────

describe('autoCreateOpeningBalance', () => {
  it('carry source with no transactions → its opening balance', () => {
    expect(autoCreateOpeningBalance({ opening_balance: 500 }, [])).toBe(500)
  })

  it('carries the closing balance, status-blind', () => {
    const txs = [
      tx({ status: 'cleared', credit: 300 }),
      tx({ status: 'pending', debit: 50 }),
      tx({ status: 'scheduled', debit: 25.5 }),
    ]
    expect(autoCreateOpeningBalance({ opening_balance: 500 }, txs)).toBeCloseTo(724.5, 2)
  })

  it('ignores void rows and rows with no amount', () => {
    const txs = [
      tx({ status: 'cleared', credit: 100 }),
      tx({ status: 'void', debit: 999 }),
      tx({ status: 'recorded' }),
    ]
    expect(autoCreateOpeningBalance({ opening_balance: 500 }, txs)).toBe(600)
  })

  it('only void rows → opening balance unchanged', () => {
    expect(autoCreateOpeningBalance({ opening_balance: 500 }, [tx({ status: 'void', credit: 10 })])).toBe(500)
  })
})

// ── shouldAutoUpdateNextOpening ─────────────────────────────────────────────

describe('shouldAutoUpdateNextOpening', () => {
  it('fresh open next month with a different opening → updates', () => {
    expect(shouldAutoUpdateNextOpening(base)).toBe(true)
  })

  it('no register or no next month → no update', () => {
    expect(shouldAutoUpdateNextOpening({ ...base, register: null })).toBe(false)
    expect(shouldAutoUpdateNextOpening({ ...base, nextMonthReg: undefined })).toBe(false)
  })

  it('closing balance still loading (null) → no update', () => {
    expect(shouldAutoUpdateNextOpening({ ...base, closingBalance: null })).toBe(false)
  })

  it.each<MonthStatus>(['soft_closed', 'hard_closed'])('this month %s → no update', (s) => {
    expect(shouldAutoUpdateNextOpening({ ...base, register: thisMonth(s) })).toBe(false)
  })

  // Pins current behavior — BACKLOG needs-decision: the mismatch prompt
  // requires 'open', but auto-update also runs while ready_to_close.
  it('this month ready_to_close → still updates (current behavior)', () => {
    expect(shouldAutoUpdateNextOpening({ ...base, register: thisMonth('ready_to_close') })).toBe(true)
  })

  it('balances within currencyEq tolerance → no update', () => {
    expect(shouldAutoUpdateNextOpening({ ...base, closingBalance: 1000.004 })).toBe(false)
  })

  it('balances one cent apart → updates', () => {
    expect(shouldAutoUpdateNextOpening({ ...base, closingBalance: 1000.01 })).toBe(true)
  })

  it.each<MonthStatus>(['soft_closed', 'hard_closed'])('next month archived (%s) → no update', (s) => {
    expect(shouldAutoUpdateNextOpening({ ...base, nextMonthReg: reg({ month_status: s }) })).toBe(false)
  })

  // Pins current behavior — BACKLOG needs-decision: is_locked is checked
  // here but not by the mismatch prompt.
  it('next month locked → no update', () => {
    expect(shouldAutoUpdateNextOpening({ ...base, nextMonthReg: reg({ is_locked: true }) })).toBe(false)
  })

  it('next month manually entered → no update', () => {
    expect(shouldAutoUpdateNextOpening({ ...base, nextMonthReg: reg({ is_manual_opening: true }) })).toBe(false)
  })

  it.each(['soft', 'hard'] as const)('next month previously closed (%s), now open → no update', (t) => {
    expect(shouldAutoUpdateNextOpening({ ...base, nextMonthReg: reg({ last_closed_type: t }) })).toBe(false)
  })

  it('next month ready_to_close (fresh) → updates', () => {
    expect(shouldAutoUpdateNextOpening({ ...base, nextMonthReg: reg({ month_status: 'ready_to_close' }) })).toBe(true)
  })
})

// ── shouldShowMismatchPrompt ────────────────────────────────────────────────

describe('shouldShowMismatchPrompt', () => {
  const manual = { ...base, nextMonthReg: reg({ is_manual_opening: true }), dismissedForBalance: null }

  it('manually-entered next month opening that differs → shows', () => {
    expect(shouldShowMismatchPrompt(manual)).toBe(true)
  })

  it.each(['soft', 'hard'] as const)('next month previously closed (%s), now open → shows', (t) => {
    expect(
      shouldShowMismatchPrompt({ ...manual, nextMonthReg: reg({ last_closed_type: t }) }),
    ).toBe(true)
  })

  it('fresh next month (auto-update handles it) → hidden', () => {
    expect(shouldShowMismatchPrompt({ ...manual, nextMonthReg: reg() })).toBe(false)
  })

  it('no register or no next month → hidden', () => {
    expect(shouldShowMismatchPrompt({ ...manual, register: undefined })).toBe(false)
    expect(shouldShowMismatchPrompt({ ...manual, nextMonthReg: null })).toBe(false)
  })

  it('closing balance still loading (null) → hidden', () => {
    expect(shouldShowMismatchPrompt({ ...manual, closingBalance: null })).toBe(false)
  })

  it.each<MonthStatus>(['ready_to_close', 'soft_closed', 'hard_closed'])('this month %s → hidden', (s) => {
    expect(shouldShowMismatchPrompt({ ...manual, register: thisMonth(s) })).toBe(false)
  })

  it.each<MonthStatus>(['soft_closed', 'hard_closed'])('next month archived (%s) → hidden', (s) => {
    expect(
      shouldShowMismatchPrompt({
        ...manual,
        nextMonthReg: reg({ month_status: s, is_manual_opening: true, last_closed_type: 'soft' }),
      }),
    ).toBe(false)
  })

  // Pins current behavior — BACKLOG needs-decision: is_locked does not
  // suppress the prompt.
  it('next month locked but not archived → still shows (current behavior)', () => {
    expect(
      shouldShowMismatchPrompt({ ...manual, nextMonthReg: reg({ is_manual_opening: true, is_locked: true }) }),
    ).toBe(true)
  })

  it('balances within currencyEq tolerance → hidden', () => {
    expect(shouldShowMismatchPrompt({ ...manual, closingBalance: 999.996 })).toBe(false)
  })

  it('dismissed at the current closing balance → hidden', () => {
    expect(shouldShowMismatchPrompt({ ...manual, dismissedForBalance: 1200 })).toBe(false)
  })

  it('dismissed within currencyEq tolerance of the current balance → hidden', () => {
    expect(shouldShowMismatchPrompt({ ...manual, dismissedForBalance: 1200.004 })).toBe(false)
  })

  it('dismissed at a different balance → shows again (re-arms)', () => {
    expect(shouldShowMismatchPrompt({ ...manual, dismissedForBalance: 1150 })).toBe(true)
  })
})

// ── Mutual exclusion ────────────────────────────────────────────────────────

describe('auto-update and mismatch prompt', () => {
  it('never both fire for any status/flag combination', () => {
    const statuses: MonthStatus[] = ['open', 'ready_to_close', 'soft_closed', 'hard_closed']
    const both: string[] = []
    const check = (label: string, input: Parameters<typeof shouldAutoUpdateNextOpening>[0]) => {
      if (
        shouldAutoUpdateNextOpening(input) &&
        shouldShowMismatchPrompt({ ...input, dismissedForBalance: null })
      ) both.push(label)
    }
    for (const thisStatus of statuses) {
      for (const closingBalance of [1200, 1000, null]) {
        check(`this=${thisStatus} closing=${closingBalance} next=none`, {
          register: thisMonth(thisStatus),
          nextMonthReg: null,
          closingBalance,
        })
        for (const nextStatus of statuses)
          for (const last_closed_type of [null, 'soft', 'hard'] as const)
            for (const is_manual_opening of [false, true])
              for (const is_locked of [false, true])
                check(
                  `this=${thisStatus} closing=${closingBalance} next=${nextStatus} closed=${last_closed_type} manual=${is_manual_opening} locked=${is_locked}`,
                  {
                    register: thisMonth(thisStatus),
                    nextMonthReg: reg({ month_status: nextStatus, last_closed_type, is_manual_opening, is_locked }),
                    closingBalance,
                  },
                )
      }
    }
    expect(both).toEqual([])
  })
})
