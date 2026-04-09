// ============================================================
// RegisterHeader — SPEC §16 balance display + reconciliation bar
// Bank column (left): Current Balance + Available Balance
// Ledger column (right): Actual Balance (heaviest visual weight)
// ============================================================

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/balance'
import type { BalanceSummary, DbRegister } from '@/types'

interface RegisterHeaderProps {
  register: DbRegister
  balances: BalanceSummary
  accountNickname: string
  monthLabel: string
  onBankBalanceUpdate: (currentBankBal: number | null, availableBankBal: number | null) => void
  isLocked: boolean
}

/** Parse a raw string to a number, stripping $ and commas. Returns null if empty or invalid. */
function parseBankInput(raw: string): number | null {
  const stripped = raw.replace(/[$,\s]/g, '')
  if (stripped === '') return null
  const n = parseFloat(stripped)
  return isNaN(n) ? null : Math.round(n * 100) / 100
}

/** Format a saved number for display. Empty string when null. */
function displayValue(n: number | null): string {
  return n != null ? formatCurrency(n) : ''
}

interface BankFieldProps {
  label: string
  savedValue: number | null
  disabled: boolean
  onCommit: (value: number | null) => void
}

function BankField({ label, savedValue, disabled, onCommit }: BankFieldProps) {
  const [focused, setFocused] = useState(false)
  // While focused: show raw numeric string for easy editing
  // While blurred: show formatted currency string
  const [raw, setRaw] = useState(savedValue != null ? String(savedValue) : '')

  // Sync when the saved value changes externally (e.g. another session or undo)
  useEffect(() => {
    if (!focused) {
      setRaw(savedValue != null ? String(savedValue) : '')
    }
  }, [savedValue, focused])

  function handleFocus() {
    // Strip formatting so the user edits a plain number
    setRaw(savedValue != null ? String(savedValue) : '')
    setFocused(true)
  }

  function handleBlur() {
    setFocused(false)
    const parsed = parseBankInput(raw)
    onCommit(parsed)
    // Show formatted value immediately after blur
    setRaw(parsed != null ? String(parsed) : '')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  const displayedValue = focused ? raw : displayValue(savedValue)

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={displayedValue}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="—"
        className="w-32 text-right text-sm bg-transparent border-b border-slate-600 focus:border-blue-400 outline-none text-white placeholder:text-slate-600 disabled:opacity-40 tabular-nums"
        aria-label={`Bank ${label.toLowerCase()} balance`}
      />
    </div>
  )
}

export function RegisterHeader({
  register,
  balances,
  accountNickname,
  monthLabel,
  onBankBalanceUpdate,
  isLocked,
}: RegisterHeaderProps) {
  const { current_balance, available_balance, actual_balance, is_reconciled, unresolved_count, gap } =
    balances

  const unresolvedTotal =
    unresolved_count.scheduled + unresolved_count.in_flight + unresolved_count.pending

  return (
    <div className="bg-slate-900 text-white">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
        <h1 className="text-base font-semibold tracking-wide">
          Check Register — {monthLabel}
        </h1>
        <span className="text-sm text-slate-400">{accountNickname}</span>
      </div>

      {/* Balance columns */}
      <div className="grid grid-cols-2 divide-x divide-slate-700">
        {/* Left: Bank-reported (reconciliation targets) */}
        <div className="px-4 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Bank
          </p>
          <BankField
            label="Current"
            savedValue={register.current_bank_bal}
            disabled={isLocked}
            onCommit={(val) => onBankBalanceUpdate(val, register.available_bank_bal)}
          />
          <BankField
            label="Available"
            savedValue={register.available_bank_bal}
            disabled={isLocked}
            onCommit={(val) => onBankBalanceUpdate(register.current_bank_bal, val)}
          />
        </div>

        {/* Right: Your ledger (source of truth) */}
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Your Ledger
          </p>
          <div className="flex items-baseline gap-3">
            <span
              className="text-2xl font-bold tabular-nums"
              style={{ color: actual_balance >= 0 ? '#4ade80' : '#f87171' }}
            >
              {formatCurrency(actual_balance)}
            </span>
            <span className="text-xs text-slate-400">actual balance</span>
          </div>
          <div className="mt-1 flex gap-4 text-xs text-slate-500">
            <span>Current: {formatCurrency(current_balance)}</span>
            <span>Available: {formatCurrency(available_balance)}</span>
          </div>
        </div>
      </div>

      {/* Reconciliation status bar */}
      <div
        className={`px-4 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1 items-center border-t ${
          is_reconciled
            ? 'border-green-800 bg-green-950/50 text-green-400'
            : 'border-amber-800 bg-amber-950/30 text-amber-300'
        }`}
      >
        {is_reconciled ? (
          <span>✅ Fully reconciled — all balances match</span>
        ) : (
          <>
            <span>⚠️ Reconciliation needed</span>
            {gap !== 0 && (
              <span>
                Gap: <strong>{formatCurrency(Math.abs(gap))}</strong>
              </span>
            )}
            {unresolved_count.scheduled > 0 && (
              <span>{unresolved_count.scheduled} scheduled</span>
            )}
            {unresolved_count.in_flight > 0 && (
              <span className="text-red-400">{unresolved_count.in_flight} in-flight</span>
            )}
            {unresolved_count.pending > 0 && (
              <span>{unresolved_count.pending} pending</span>
            )}
            {unresolved_count.recorded > 0 && (
              <span>{unresolved_count.recorded} unsynced</span>
            )}
            {unresolvedTotal === 0 && gap === 0 && (
              <span className="text-slate-400">Enter bank balances above to reconcile</span>
            )}
          </>
        )}
      </div>

      {/* Locked month banner */}
      {isLocked && (
        <div className="px-4 py-2 bg-slate-800 border-t border-slate-700 text-xs text-slate-400 flex items-center gap-2">
          <span>🔒 This register is closed — all entries are read-only</span>
        </div>
      )}
    </div>
  )
}
