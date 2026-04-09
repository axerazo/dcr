// ============================================================
// TransactionTable — full register table with running balance
// SPEC §6: columns B–I; §11: row limit 220; §9: Formula D
// ============================================================

import { useState } from 'react'
import { computeRunningBalance, formatCurrency } from '@/lib/balance'
import { TransactionRow, NewTransactionRow } from './TransactionRow'
import type { DbTransaction, DbRegister } from '@/types'

interface TransactionTableProps {
  register: DbRegister
  transactions: DbTransaction[]
  isLocked: boolean
  onSave: (id: string, changes: Partial<DbTransaction>) => void
  onVoid: (id: string) => void
  onCreate: (payload: {
    register_id: string
    row_order: number
    date: string
    description: string
    debit?: number | null
    credit?: number | null
    check_number?: number | null
    notes?: string | null
  }) => void
  onOpeningBalanceChange: (newBalance: number) => void
}

const MAX_ROWS = 220

export function TransactionTable({
  register,
  transactions,
  isLocked,
  onSave,
  onVoid,
  onCreate,
  onOpeningBalanceChange,
}: TransactionTableProps) {
  const [editingOpeningBalance, setEditingOpeningBalance] = useState(false)
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState('')

  const withBalances = computeRunningBalance(register.opening_balance, transactions)
  const nextRowOrder = transactions.length > 0
    ? Math.max(...transactions.map((t) => t.row_order)) + 1
    : 1
  const atLimit = transactions.length >= MAX_ROWS

  function handleOpeningBalanceSave() {
    const n = parseFloat(openingBalanceDraft.replace(/[$,]/g, ''))
    if (!isNaN(n)) onOpeningBalanceChange(n)
    setEditingOpeningBalance(false)
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-sm border-collapse min-w-[800px]">
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-700 text-xs font-semibold text-slate-200 uppercase tracking-wider">
            <th className="px-3 py-3 text-center w-24 whitespace-nowrap">Check #</th>
            <th className="px-3 py-3 text-left w-32 whitespace-nowrap">Date</th>
            <th className="px-3 py-3 text-left whitespace-nowrap">Description</th>
            <th className="px-3 py-3 text-center w-20 whitespace-nowrap">Status</th>
            <th className="px-3 py-3 text-right w-32 whitespace-nowrap">Debit (–)</th>
            <th className="px-3 py-3 text-right w-32 whitespace-nowrap">Credit (+)</th>
            <th className="px-3 py-3 text-right w-36 whitespace-nowrap">Balance</th>
            <th className="px-3 py-3 text-left w-44 whitespace-nowrap">Notes</th>
          </tr>
          {/* Opening balance row — sticky directly below column headers */}
          <tr className="group/ob bg-slate-200 border-b border-slate-300 text-xs text-slate-600 font-medium">
            <td colSpan={6} className="px-3 py-1.5">
              <span className="italic">Opening Balance</span>
              {/* Pencil icon — only visible on row hover, only when unlocked and not already editing */}
              {!isLocked && !editingOpeningBalance && (
                <button
                  onClick={() => {
                    setOpeningBalanceDraft(String(register.opening_balance))
                    setEditingOpeningBalance(true)
                  }}
                  className="ml-2 opacity-0 group-hover/ob:opacity-40 hover:!opacity-100 transition-opacity text-slate-500 hover:text-slate-800"
                  title="Edit opening balance"
                  aria-label="Edit opening balance"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="inline w-3 h-3">
                    <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81 3.189 11.37a.25.25 0 0 0-.064.108l-.618 2.158 2.158-.618a.25.25 0 0 0 .108-.064L11.19 6.25Z"/>
                  </svg>
                </button>
              )}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-700">
              {editingOpeningBalance ? (
                <span className="flex items-center justify-end gap-1">
                  <input
                    type="text"
                    value={openingBalanceDraft}
                    onChange={(e) => setOpeningBalanceDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleOpeningBalanceSave()
                      if (e.key === 'Escape') setEditingOpeningBalance(false)
                    }}
                    className="w-28 border border-blue-400 rounded px-1 text-right bg-white outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleOpeningBalanceSave}
                    className="text-green-600 hover:text-green-800 font-bold"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setEditingOpeningBalance(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                formatCurrency(register.opening_balance)
              )}
            </td>
            <td />
          </tr>
        </thead>
        <tbody>
          {withBalances.map((tx, i) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              rowIndex={i}
              isLocked={isLocked}
              onSave={onSave}
              onVoid={onVoid}
            />
          ))}
          {!atLimit && (
            <NewTransactionRow
              registerId={register.id}
              nextRowOrder={nextRowOrder}
              isLocked={isLocked}
              onCreate={onCreate}
            />
          )}
          {atLimit && !isLocked && (
            <tr>
              <td colSpan={9} className="px-4 py-2 text-xs text-amber-600 text-center">
                Maximum of {MAX_ROWS} transactions per month reached.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
