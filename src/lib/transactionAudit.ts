// ============================================================
// Transaction audit entries — pure decision logic for what a
// transaction save must write to the audit log (SPEC §10, §12).
//
//   Status transition (any, incl. ones derived from scheduled_date)
//     → 'voided' when the new status is void, else 'status_changed'
//   Field edit, only while the register is an unlocked closed month
//     → one 'edited' entry per changed column (SPEC §12 rule 6)
//
// Kept free of Supabase so it can be unit-tested; callers pass the
// result to writeAuditEntry().
// ============================================================

import { currencyEq } from './balance'
import type { AuditAction, DbRegister, DbTransaction } from '@/types'

export interface TransactionAuditEntry {
  user_id: string
  account_id: string
  register_id: string
  transaction_id: string
  action: AuditAction
  field_changed: string
  value_before: string | null
  value_after: string | null
}

// Editable columns whose changes are audited in an unlocked closed month.
// status is handled separately; balance is computed, never stored.
export const AUDITED_FIELDS = [
  'check_number',
  'date',
  'description',
  'debit',
  'credit',
  'notes',
  'scheduled_date',
] as const

type AuditedField = (typeof AUDITED_FIELDS)[number]

/**
 * True when edits to this register must be audited: a hard-closed month that
 * the user unlocked for editing. Same condition that shows the
 * "Editing a closed register. All changes are logged." banner in RegisterView.
 */
export function isAuditedEditRegister(
  register: Pick<DbRegister, 'month_status' | 'is_locked' | 'last_closed_type'>,
): boolean {
  return (
    register.month_status === 'open' &&
    register.is_locked === false &&
    register.last_closed_type === 'hard'
  )
}

function fieldChanged(field: AuditedField, before: DbTransaction, after: DbTransaction): boolean {
  const a = before[field]
  const b = after[field]
  if (a == null || b == null) return (a == null) !== (b == null)
  if (field === 'debit' || field === 'credit') return !currencyEq(a as number, b as number)
  return a !== b
}

function serialize(value: string | number | null): string | null {
  return value == null ? null : String(value)
}

export function buildTransactionAuditEntries(
  before: DbTransaction,
  after: DbTransaction,
  ctx: { user_id: string; account_id: string; auditEdits: boolean },
): TransactionAuditEntry[] {
  const base = {
    user_id: ctx.user_id,
    account_id: ctx.account_id,
    register_id: after.register_id,
    transaction_id: after.id,
  }
  const entries: TransactionAuditEntry[] = []

  if (ctx.auditEdits) {
    for (const field of AUDITED_FIELDS) {
      if (!fieldChanged(field, before, after)) continue
      entries.push({
        ...base,
        action: 'edited',
        field_changed: field,
        value_before: serialize(before[field]),
        value_after: serialize(after[field]),
      })
    }
  }

  if (before.status !== after.status) {
    entries.push({
      ...base,
      action: after.status === 'void' ? 'voided' : 'status_changed',
      field_changed: 'status',
      value_before: before.status,
      value_after: after.status,
    })
  }

  return entries
}
