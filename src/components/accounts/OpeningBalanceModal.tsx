// ============================================================
// OpeningBalanceModal — first-time onboarding after account creation
// Collects "as of" month and opening balance, creates the first register
// SPEC §4: opening_balance is the permanent starting point for the register
// ============================================================

import { useState } from 'react'
import { useCreateRegister } from '@/hooks/useRegister'

interface OpeningBalanceModalProps {
  accountId: string
  onComplete: () => void
  onCancel: () => void
}

function firstDayOfCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function OpeningBalanceModal({ accountId, onComplete, onCancel }: OpeningBalanceModalProps) {
  const [asOfDate, setAsOfDate] = useState(firstDayOfCurrentMonth)
  const [balance, setBalance] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createRegister = useCreateRegister()

  function handleBalanceInput(raw: string) {
    // Allow digits, one decimal point, up to 2 decimal places, optional leading minus
    const cleaned = raw.replace(/[^0-9.-]/g, '')
    setBalance(cleaned)
  }

  function validate(): string | null {
    const parsed = parseFloat(balance)
    if (balance.trim() === '' || isNaN(parsed)) return 'Opening balance is required.'
    if (!/^-?\d+(\.\d{0,2})?$/.test(balance.trim())) return 'Enter a valid amount (up to 2 decimal places).'
    return null
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    setShowConfirm(true)
  }

  async function handleConfirm() {
    const [yearStr, monthStr] = asOfDate.split('-')
    const month = parseInt(monthStr, 10)
    const year = parseInt(yearStr, 10)
    const openingBalance = parseFloat(parseFloat(balance).toFixed(2))

    try {
      await createRegister.mutateAsync({
        account_id: accountId,
        month,
        year,
        opening_balance: openingBalance,
        is_locked: false,
        is_manual_opening: true,
      })
      onComplete()
    } catch (err) {
      setShowConfirm(false)
      setError((err as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Set Opening Balance</h2>
        </div>

        <form onSubmit={handleContinue} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              As of date *
            </label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Opening balance *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={balance}
              onChange={(e) => handleBalanceInput(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-hidden focus:border-blue-500 font-mono"
              autoFocus
            />
            <p className="text-xs text-slate-400 mt-1">
              Enter your closing balance from last month's statement or your previous register.
              This becomes your permanent starting point.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-2">Lock opening balance?</h3>
            <p className="text-sm text-slate-600 mb-5">
              Once saved, this opening balance is locked. Continue?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={createRegister.isPending}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={createRegister.isPending}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {createRegister.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
