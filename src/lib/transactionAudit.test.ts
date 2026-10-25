import { describe, it, expect } from 'vitest'
import {
  AUDITED_FIELDS,
  buildTransactionAuditEntries,
  isAuditedEditRegister,
} from './transactionAudit'
import type { DbTransaction, TransactionStatus } from '@/types'

// ── Fixture factory ─────────────────────────────────────────────────────────

function tx(overrides: Partial<DbTransaction> = {}): DbTransaction {
  return {
    id: 'tx-1',
    register_id: 'reg-1',
    row_order: 1,
    check_number: null,
    date: '2025-04-01',
    description: 'Groceries',
    status: 'recorded',
    debit: 50,
    credit: null,
    notes: null,
    scheduled_date: null,
    created_at: '2025-04-01T00:00:00Z',
    updated_at: '2025-04-01T00:00:00Z',
    ...overrides,
  }
}

const ctx = { user_id: 'user-1', account_id: 'acct-1', auditEdits: false }
const base = { user_id: 'user-1', account_id: 'acct-1', register_id: 'reg-1', transaction_id: 'tx-1' }

// ── Status transitions (SPEC §10: every status transition is audited) ─────────

describe('buildTransactionAuditEntries — status transitions', () => {
  const statuses: TransactionStatus[] = ['recorded', 'scheduled', 'in_flight', 'pending', 'cleared']

  it.each(statuses)('voiding from %s writes one voided entry (#12)', (from) => {
    const entries = buildTransactionAuditEntries(tx({ status: from }), tx({ status: 'void' }), ctx)
    expect(entries).toEqual([
      { ...base, action: 'voided', field_changed: 'status', value_before: from, value_after: 'void' },
    ])
  })

  it('pending → cleared writes one status_changed entry (#13)', () => {
    const entries = buildTransactionAuditEntries(tx({ status: 'pending' }), tx({ status: 'cleared' }), ctx)
    expect(entries).toEqual([
      { ...base, action: 'status_changed', field_changed: 'status', value_before: 'pending', value_after: 'cleared' },
    ])
  })

  it('a status derived from a scheduled_date edit is audited as a transition', () => {
    const before = tx({ status: 'scheduled', scheduled_date: '2099-01-01' })
    const after = tx({ status: 'recorded', scheduled_date: null })
    const entries = buildTransactionAuditEntries(before, after, ctx)
    expect(entries).toEqual([
      { ...base, action: 'status_changed', field_changed: 'status', value_before: 'scheduled', value_after: 'recorded' },
    ])
  })

  it('status transitions are audited even when edits are not (current month)', () => {
    const entries = buildTransactionAuditEntries(
      tx({ status: 'recorded', description: 'Old' }),
      tx({ status: 'cleared', description: 'New' }),
      ctx,
    )
    expect(entries.map((e) => e.action)).toEqual(['status_changed'])
  })

  it('no change writes nothing', () => {
    expect(buildTransactionAuditEntries(tx(), tx(), ctx)).toEqual([])
  })
})

// ── Field edits (SPEC §12 rule 6: every save in an unlocked closed month) ─────

describe('buildTransactionAuditEntries — field edits', () => {
  const editCtx = { ...ctx, auditEdits: true }

  it('field edits are not audited outside an unlocked closed month', () => {
    const entries = buildTransactionAuditEntries(tx({ debit: 50 }), tx({ debit: 75 }), ctx)
    expect(entries).toEqual([])
  })

  it('writes one edited entry per changed field, values serialized', () => {
    const entries = buildTransactionAuditEntries(
      tx({ debit: 50, description: 'Groceries' }),
      tx({ debit: 75.25, description: 'Groceries (store)' }),
      editCtx,
    )
    expect(entries).toEqual([
      { ...base, action: 'edited', field_changed: 'description', value_before: 'Groceries', value_after: 'Groceries (store)' },
      { ...base, action: 'edited', field_changed: 'debit', value_before: '50', value_after: '75.25' },
    ])
  })

  it('null ↔ value changes are audited with null serialized as null', () => {
    const entries = buildTransactionAuditEntries(
      tx({ notes: null, check_number: 1001 }),
      tx({ notes: 'conf #123', check_number: null }),
      editCtx,
    )
    expect(entries).toEqual([
      { ...base, action: 'edited', field_changed: 'check_number', value_before: '1001', value_after: null },
      { ...base, action: 'edited', field_changed: 'notes', value_before: null, value_after: 'conf #123' },
    ])
  })

  it('currency within half a cent is not an edit (currencyEq, Hard rule 2)', () => {
    const entries = buildTransactionAuditEntries(tx({ debit: 0.1 + 0.2 }), tx({ debit: 0.3 }), editCtx)
    expect(entries).toEqual([])
  })

  it('an edit plus a status change writes edited entries before the transition', () => {
    const entries = buildTransactionAuditEntries(
      tx({ status: 'pending', debit: 50 }),
      tx({ status: 'cleared', debit: 60 }),
      editCtx,
    )
    expect(entries.map((e) => [e.action, e.field_changed])).toEqual([
      ['edited', 'debit'],
      ['status_changed', 'status'],
    ])
  })

  it('covers every editable column and never status or computed fields', () => {
    expect([...AUDITED_FIELDS]).toEqual([
      'check_number', 'date', 'description', 'debit', 'credit', 'notes', 'scheduled_date',
    ])
  })
})

// ── Which registers audit edits ─────────────────────────────────────────────

describe('isAuditedEditRegister', () => {
  it('true only for a hard-closed month unlocked for editing', () => {
    expect(isAuditedEditRegister({ month_status: 'open', is_locked: false, last_closed_type: 'hard' })).toBe(true)
  })

  it.each([
    ['current open month, never closed', { month_status: 'open', is_locked: false, last_closed_type: null }],
    ['soft-closed month reopened (UI shows no "changes are logged" banner)', { month_status: 'open', is_locked: false, last_closed_type: 'soft' }],
    ['hard-closed month still locked', { month_status: 'hard_closed', is_locked: true, last_closed_type: 'hard' }],
    ['soft-closed month', { month_status: 'soft_closed', is_locked: true, last_closed_type: 'soft' }],
  ] as const)('false for %s', (_label, register) => {
    expect(isAuditedEditRegister(register)).toBe(false)
  })
})
