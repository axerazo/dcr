// ============================================================
// Month roll-over decisions — SPEC §2, §11
//
// Pure predicates for the monthly roll-over: what a newly auto-created
// register opens with, when next month's opening is silently carried
// forward, and when the opening-balance mismatch prompt is shown.
// RegisterView owns the effects, refs and mutations; it only asks these
// functions what to do. CORE (CLAUDE.md Hard rule 1).
// ============================================================

import { computeClosingBalance, currencyEq } from './balance'
import type { DbRegister, DbTransaction } from '@/types'

type RegisterStatus = Pick<DbRegister, 'month_status'>

type NextMonthRegister = Pick<
  DbRegister,
  'opening_balance' | 'month_status' | 'is_locked' | 'is_manual_opening' | 'last_closed_type'
>

export interface RolloverInput {
  /** The register being viewed (this month). */
  register: RegisterStatus | null | undefined
  /** The register for the month after this one, if it exists. */
  nextMonthReg: NextMonthRegister | null | undefined
  /** This month's closing balance (computeClosingBalance), null while loading. */
  closingBalance: number | null
}

/**
 * Archived = soft or hard closed. An archived month's opening balance is
 * part of a committed record and is never changed by the roll-over.
 */
export function isArchived(reg: RegisterStatus | null | undefined): boolean {
  return reg?.month_status === 'soft_closed' || reg?.month_status === 'hard_closed'
}

/**
 * Opening balance for a register auto-created from the most recent prior
 * register (SPEC §11 auto-carry): the carry source's closing balance —
 * last amount-bearing, non-void row, status-blind.
 */
export function autoCreateOpeningBalance(
  carrySource: Pick<DbRegister, 'opening_balance'>,
  carrySourceTxs: DbTransaction[],
): number {
  return computeClosingBalance(carrySource.opening_balance, carrySourceTxs)
}

/**
 * Should next month's opening balance be silently set to this month's
 * closing balance? Only for a genuinely fresh open next month: not
 * archived, not locked, never closed before, not manually entered.
 * SPEC §2: nothing changes without user knowledge — the other cases go
 * through the mismatch prompt instead.
 */
export function shouldAutoUpdateNextOpening({
  register,
  nextMonthReg,
  closingBalance,
}: RolloverInput): boolean {
  if (!register || !nextMonthReg) return false
  if (isArchived(register)) return false
  if (closingBalance == null) return false
  if (currencyEq(closingBalance, nextMonthReg.opening_balance)) return false
  if (isArchived(nextMonthReg)) return false
  if (nextMonthReg.is_locked) return false
  if (nextMonthReg.last_closed_type !== null || nextMonthReg.is_manual_opening) return false
  return true
}

/**
 * Should the opening-balance mismatch prompt be shown? Only when this month
 * is open, next month exists and is not archived, the balances differ, and
 * next month's opening needs a user decision (previously closed and now
 * reopened, or manually entered). Hidden while the user has dismissed it
 * at the current closing balance; re-arms when the balance moves.
 */
export function shouldShowMismatchPrompt({
  register,
  nextMonthReg,
  closingBalance,
  dismissedForBalance,
}: RolloverInput & { dismissedForBalance: number | null }): boolean {
  if (!register || register.month_status !== 'open') return false
  if (closingBalance == null) return false
  if (isArchived(nextMonthReg)) return false
  if (!nextMonthReg) return false
  if (currencyEq(closingBalance, nextMonthReg.opening_balance)) return false

  const requiresDecision =
    nextMonthReg.last_closed_type !== null || nextMonthReg.is_manual_opening === true

  if (!requiresDecision) return false
  if (dismissedForBalance !== null && currencyEq(dismissedForBalance, closingBalance)) return false
  return true
}
// throwaway #28 proof A — never merge
