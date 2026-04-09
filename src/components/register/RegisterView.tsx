// ============================================================
// RegisterView — top-level register page for one account
// Manages month navigation, locked state, unlock flow, carry-forward
// ============================================================

import { useState, useCallback } from 'react'
import { useRegister, useCreateRegister, useUpdateRegister } from '@/hooks/useRegister'
import { useTransactions, useAddTransaction, useUpdateTransaction, useDeleteTransaction } from '@/hooks/useTransactions'
import { computeBalanceSummary } from '@/lib/balance'
import { RegisterHeader } from './RegisterHeader'
import { TransactionTable } from './TransactionTable'
import { MonthNav } from './MonthNav'
import { YearlySummary } from './YearlySummary'
import { MONTH_NAMES } from '@/types'
import type { DbAccount, DbTransaction } from '@/types'

interface RegisterViewProps {
  account: DbAccount
}

export function RegisterView({ account }: RegisterViewProps) {
  const now = new Date()
  const [activeMonth, setActiveMonth] = useState(now.getMonth() + 1)  // 1–12; 0 = yearly
  const [activeYear, setActiveYear] = useState(now.getFullYear())
  const [sessionUnlocked, setSessionUnlocked] = useState(false)
  const [showUnlockDialog, setShowUnlockDialog] = useState(false)

  // --- Data fetching ---
  const { data: register, isLoading: regLoading } = useRegister(account.id, activeMonth, activeYear)
  const { data: transactions = [], isLoading: txLoading } = useTransactions(register?.id)

  const createRegister = useCreateRegister()
  const updateRegister = useUpdateRegister()
  const addTransaction = useAddTransaction()
  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()

  // --- Computed balances ---
  const balances = register
    ? computeBalanceSummary(
        register.opening_balance,
        transactions,
        register.current_bank_bal,
        register.available_bank_bal,
      )
    : null

  // --- Lock / unlock logic ---
  const isCurrentMonth =
    activeMonth === now.getMonth() + 1 && activeYear === now.getFullYear()
  const isFutureMonth =
    activeYear > now.getFullYear() ||
    (activeYear === now.getFullYear() && activeMonth > now.getMonth() + 1)
  const isLocked = !isCurrentMonth && !isFutureMonth && !sessionUnlocked && !!register?.is_locked

  function handleUnlockRequest() {
    setShowUnlockDialog(true)
  }

  function handleUnlockConfirm() {
    setSessionUnlocked(true)
    setShowUnlockDialog(false)
  }

  function handleRelockSession() {
    setSessionUnlocked(false)
  }

  // --- Month navigation ---
  function handleNavigate(month: number) {
    setActiveMonth(month)
    setSessionUnlocked(false)
  }

  function handleYearChange(delta: number) {
    setActiveYear((y) => y + delta)
    setSessionUnlocked(false)
  }

  // --- Register initialization ---
  async function handleInitRegister(openingBalance: number) {
    if (!account.id) return
    // For Feb–Dec: try to carry forward prior month's closing balance
    // If no prior month exists, user-provided value is used
    await createRegister.mutateAsync({
      account_id: account.id,
      month: activeMonth,
      year: activeYear,
      opening_balance: openingBalance,
    })
  }

  // --- Bank balance update ---
  const handleBankBalanceUpdate = useCallback(
    (currentBankBal: number | null, availableBankBal: number | null) => {
      if (!register) return
      updateRegister.mutate({
        id: register.id,
        current_bank_bal: currentBankBal,
        available_bank_bal: availableBankBal,
      })
    },
    [register, updateRegister],
  )

  // --- Transaction handlers ---
  const handleSave = useCallback(
    (id: string, changes: Partial<DbTransaction>) => {
      if (!register) return
      const tx = transactions.find((t) => t.id === id)
      if (!tx) return
      updateTransaction.mutate({
        id,
        register_id: register.id,
        currentStatus: tx.status,
        ...changes,
      })
    },
    [register, transactions, updateTransaction],
  )

  const handleVoid = useCallback(
    (id: string) => {
      if (!register) return
      if (!window.confirm('Mark this transaction as void? It will be excluded from all calculations.')) return
      deleteTransaction.mutate({ id, register_id: register.id })
    },
    [register, deleteTransaction],
  )

  const handleCreate = useCallback(
    (payload: Parameters<typeof addTransaction.mutate>[0]) => {
      addTransaction.mutate(payload)
    },
    [addTransaction],
  )

  const handleOpeningBalanceChange = useCallback(
    (newBalance: number) => {
      if (!register) return
      updateRegister.mutate({ id: register.id, opening_balance: newBalance })
    },
    [register, updateRegister],
  )

  // --- Render ---
  const monthLabel =
    activeMonth === 0
      ? `${activeYear} — Yearly Summary`
      : `${MONTH_NAMES[activeMonth - 1]} ${activeYear}`

  if (activeMonth === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-700">
          <h1 className="text-base font-semibold">{account.nickname}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{monthLabel}</p>
        </div>
        <YearlySummary accountId={account.id} year={activeYear} />
        <MonthNav
          activeMonth={activeMonth}
          activeYear={activeYear}
          currentMonth={now.getMonth() + 1}
          currentYear={now.getFullYear()}
          onNavigate={handleNavigate}
          onYearChange={handleYearChange}
        />
      </div>
    )
  }

  if (regLoading || txLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        Loading register…
      </div>
    )
  }

  // Register doesn't exist yet for this month — show initialization
  if (!register) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-700">
          <h1 className="text-base font-semibold">{account.nickname}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <InitRegisterForm
            month={activeMonth}
            year={activeYear}
            accountId={account.id}
            onInit={handleInitRegister}
            isLoading={createRegister.isPending}
          />
        </div>
        <MonthNav
          activeMonth={activeMonth}
          activeYear={activeYear}
          currentMonth={now.getMonth() + 1}
          currentYear={now.getFullYear()}
          onNavigate={handleNavigate}
          onYearChange={handleYearChange}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <RegisterHeader
        register={register}
        balances={balances!}
        accountNickname={account.nickname}
        monthLabel={monthLabel}
        onBankBalanceUpdate={handleBankBalanceUpdate}
        isLocked={isLocked}
      />

      {/* Locked month actions */}
      {isLocked && (
        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-3">
          <span className="text-sm text-slate-600">
            🔒 This register is closed — all entries are read-only.
          </span>
          <button
            onClick={handleUnlockRequest}
            className="px-3 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
          >
            Unlock to Edit
          </button>
        </div>
      )}

      {/* Session-unlocked indicator */}
      {sessionUnlocked && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
          <span className="text-sm text-amber-700">
            ⚠️ Editing a closed register. All changes are logged.
          </span>
          <button
            onClick={handleRelockSession}
            className="px-3 py-1 text-xs bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 text-amber-800"
          >
            Re-lock
          </button>
        </div>
      )}

      {/* Unlock confirmation dialog */}
      {showUnlockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h2 className="text-base font-semibold text-slate-800 mb-2">Unlock Closed Register?</h2>
            <p className="text-sm text-slate-600 mb-4">
              You are about to edit a closed register. All changes will be logged with a timestamp.
              Continue?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowUnlockDialog(false)}
                className="px-4 py-2 text-sm bg-slate-100 rounded hover:bg-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlockConfirm}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Unlock & Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction table */}
      <TransactionTable
        register={register}
        transactions={transactions}
        isLocked={isLocked}
        onSave={handleSave}
        onVoid={handleVoid}
        onCreate={handleCreate}
        onOpeningBalanceChange={handleOpeningBalanceChange}
      />

      {/* Month navigation tab bar */}
      <MonthNav
        activeMonth={activeMonth}
        activeYear={activeYear}
        currentMonth={now.getMonth() + 1}
        currentYear={now.getFullYear()}
        onNavigate={handleNavigate}
        onYearChange={handleYearChange}
      />
    </div>
  )
}

// ============================================================
// InitRegisterForm — shown when no register exists for month/year
// ============================================================

interface InitRegisterFormProps {
  month: number
  year: number
  accountId: string
  onInit: (openingBalance: number) => void
  isLoading: boolean
}

function InitRegisterForm({ month, year, onInit, isLoading }: InitRegisterFormProps) {
  const [value, setValue] = useState('')
  const monthName = MONTH_NAMES[month - 1]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(value.replace(/[$,]/g, ''))
    if (!isNaN(n)) onInit(n)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-sm mx-auto shadow-sm">
      <h2 className="text-base font-semibold text-slate-800 mb-1">
        Initialize {monthName} {year}
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Enter the opening balance for this register. For January this is your starting balance;
        for other months it auto-carries from the prior month once that month exists.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Opening Balance
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="$0.00"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="w-full py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Creating…' : 'Create Register'}
        </button>
      </form>
    </div>
  )
}
