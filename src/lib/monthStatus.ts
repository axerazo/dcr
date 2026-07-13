// ============================================================
// Month lifecycle helpers — SPEC §11
//
// NOTE (Phase 1.5, 2026-07): the former computeLastClearedRunningBalance
// ("last-cleared" carry-forward rule) was retired. Empirical validation
// against the Excel oracle (LOOKUP(9.99E+307, PRIOR!$H:$H) over a
// status-blind balance column) confirmed the true carry-forward rule is
// the balance of the last amount-bearing, non-void row — which is
// computeClosingBalance in balance.ts (SPEC §9 Formulas C/E).
// ============================================================

import type { DbTransaction } from '@/types'

/**
 * Count of non-void, non-cleared transactions (still "in flight" for carry-forward).
 */
export function pendingTransactionCount(transactions: DbTransaction[]): number {
  return transactions.filter(
    (tx) => tx.status !== 'void' && tx.status !== 'cleared',
  ).length
}

/**
 * True when ALL non-void transactions are cleared and at least one exists.
 * This is the condition that triggers ready_to_close.
 */
export function allTransactionsCleared(transactions: DbTransaction[]): boolean {
  const nonVoid = transactions.filter((tx) => tx.status !== 'void')
  return nonVoid.length > 0 && nonVoid.every((tx) => tx.status === 'cleared')
}
