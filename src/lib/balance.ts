// ============================================================
// Balance computation library — SPEC §9, §15
// CRITICAL: balance is NEVER stored in the database.
// All functions here are the single source of truth.
// ============================================================

import type { DbTransaction, Transaction, BalanceSummary } from '@/types'

/**
 * Formula D — Running balance per row (Column H).
 * Void rows and rows with no debit/credit get balance = null.
 * Every non-void row with a debit or credit shows a true account balance
 * that includes all prior rows.
 */
export function computeRunningBalance(
  openingBalance: number,
  transactions: DbTransaction[],
): Transaction[] {
  let running = openingBalance
  return transactions.map((tx) => {
    if (tx.status === 'void' || (tx.debit == null && tx.credit == null)) {
      return { ...tx, balance: null }
    }
    running += (tx.credit ?? 0) - (tx.debit ?? 0)
    return { ...tx, balance: running }
  })
}

/**
 * Formula A — Current Balance (G1) = Formula C — Actual Balance (H2).
 * Includes all statuses except void.
 * Reconciliation target: must match bank's "Current Balance".
 */
export function computeCurrentBalance(
  openingBalance: number,
  transactions: DbTransaction[],
): number {
  return transactions
    .filter((tx) => tx.status !== 'void')
    .reduce((acc, tx) => acc + (tx.credit ?? 0) - (tx.debit ?? 0), openingBalance)
}

/**
 * Formula B — Available Balance (G2).
 * Includes ONLY cleared transactions.
 * Reconciliation target: must match bank's "Available Balance".
 */
export function computeAvailableBalance(
  openingBalance: number,
  transactions: DbTransaction[],
): number {
  return transactions
    .filter((tx) => tx.status === 'cleared')
    .reduce((acc, tx) => acc + (tx.credit ?? 0) - (tx.debit ?? 0), openingBalance)
}

/**
 * Compute the full balance summary for a register.
 * is_reconciled = true when every non-void transaction is cleared (ledger-only).
 * Bank balance columns are reserved for Phase 3 bank sync and not used here.
 */
export function computeBalanceSummary(
  openingBalance: number,
  transactions: DbTransaction[],
): BalanceSummary {
  const current_balance = computeCurrentBalance(openingBalance, transactions)
  const available_balance = computeAvailableBalance(openingBalance, transactions)
  const actual_balance = current_balance  // same formula, different UI label

  // Ledger-only convergence: all non-void transactions are cleared.
  // When that holds, actual_balance === available_balance by definition.
  const nonVoid = transactions.filter((tx) => tx.status !== 'void')
  const is_reconciled = nonVoid.length > 0 && nonVoid.every((tx) => tx.status === 'cleared')

  const unresolved_count = {
    scheduled: nonVoid.filter((tx) => tx.status === 'scheduled').length,
    in_flight: nonVoid.filter((tx) => tx.status === 'in_flight').length,
    pending: nonVoid.filter((tx) => tx.status === 'pending').length,
    recorded: nonVoid.filter((tx) => tx.status === 'recorded').length,
  }

  return {
    current_balance,
    available_balance,
    actual_balance,
    is_reconciled,
    unresolved_count,
    gap: current_balance - available_balance,
  }
}

/**
 * Formula E — Carry-forward.
 * The closing balance of a month = balance of its last non-void transaction.
 * This becomes the next month's opening_balance.
 */
export function computeClosingBalance(
  openingBalance: number,
  transactions: DbTransaction[],
): number {
  const nonVoid = transactions.filter(
    (tx) => tx.status !== 'void' && (tx.debit != null || tx.credit != null),
  )
  if (nonVoid.length === 0) return openingBalance
  return computeCurrentBalance(openingBalance, nonVoid)
}

/**
 * Determine if a scheduled transaction has become in-flight.
 * In-flight = scheduled_date < today (the day after the scheduled date has passed).
 */
export function isInFlight(scheduledDate: string | null | undefined): boolean {
  if (!scheduledDate) return false
  // Strip any time/timezone suffix, then parse components directly so the date
  // is always interpreted as local midnight — never shifted by UTC offset.
  const [y, m, d] = scheduledDate.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return false
  const scheduled = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return scheduled < today
}

// Floating-point equality for currency (cents-level precision)

/** Exported currency equality — half-cent tolerance for carry-forward comparisons. */
export function currencyEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

/**
 * Format a number as USD currency string.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

/**
 * Parse a currency input string to a number.
 * Strips $, commas, leading/trailing whitespace.
 * Returns null if the result is not a valid positive number.
 */
export function parseCurrencyInput(raw: string): number | null {
  const stripped = raw.replace(/[$,\s]/g, '')
  if (stripped === '' || stripped === '-') return null
  const n = parseFloat(stripped)
  if (isNaN(n) || n <= 0) return null
  // Round to 2 decimal places
  return Math.round(n * 100) / 100
}
