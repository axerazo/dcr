// ============================================================
// TransactionRow — inline-editable register row (SPEC §6, §7, §11)
// Autosave on blur/Enter. Debit/credit mutually exclusive.
// Scheduled auto-trigger fires in real time from notes field.
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react'
import { StatusIcon, statusRowClass } from '@/components/ui/StatusIcon'
import { formatCurrency, parseCurrencyInput, detectScheduledPhrase } from '@/lib/balance'
import type { Transaction, TransactionStatus } from '@/types'

const STATUS_OPTIONS: { value: TransactionStatus; label: string }[] = [
  { value: 'recorded', label: 'Recorded' },
  { value: 'pending', label: 'Pending' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'void', label: 'Void' },
]

interface TransactionRowProps {
  transaction: Transaction
  rowIndex: number
  isLocked: boolean
  onSave: (id: string, changes: Partial<Transaction>) => void
  onVoid: (id: string) => void
}

interface EditState {
  check_number: string
  date: string
  description: string
  debit: string
  credit: string
  notes: string
}

function toEditState(tx: Transaction): EditState {
  return {
    check_number: tx.check_number != null ? String(tx.check_number) : '',
    date: tx.date,
    description: tx.description,
    debit: tx.debit != null ? String(tx.debit) : '',
    credit: tx.credit != null ? String(tx.credit) : '',
    notes: tx.notes ?? '',
  }
}

export function TransactionRow({ transaction: tx, rowIndex, isLocked, onSave, onVoid }: TransactionRowProps) {
  const [editing, setEditing] = useState<EditState | null>(null)
  const [debitCreditError, setDebitCreditError] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)

  // Close status menu when clicking outside
  useEffect(() => {
    if (!statusMenuOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [statusMenuOpen])
  const isVoid = tx.status === 'void'
  const rowClass = statusRowClass(tx.status)

  function startEdit() {
    if (isLocked || isVoid) return
    setEditing(toEditState(tx))
  }

  function cancelEdit() {
    setEditing(null)
    setDebitCreditError(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }

  const commitSave = useCallback(
    (state: EditState) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

      const debit = parseCurrencyInput(state.debit)
      const credit = parseCurrencyInput(state.credit)

      if (debit != null && credit != null) {
        setDebitCreditError(true)
        return
      }
      setDebitCreditError(false)

      const checkNum = state.check_number.trim()
        ? parseInt(state.check_number, 10)
        : null

      onSave(tx.id, {
        check_number: checkNum && checkNum > 0 ? checkNum : null,
        date: state.date,
        description: state.description.trim(),
        debit: debit ?? null,
        credit: credit ?? null,
        notes: state.notes.trim() || null,
      })
      setEditing(null)
    },
    [tx.id, onSave],
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitSave(editing!)
    if (e.key === 'Escape') cancelEdit()
  }

  function handleBlur() {
    // Debounce so Tab between fields doesn't fire prematurely
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (editing) commitSave(editing)
    }, 150)
  }

  function handleFocus() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }

  function handleDebitChange(raw: string) {
    if (!editing) return
    // If credit has a value, prevent debit entry
    if (editing.credit !== '' && raw !== '') {
      setDebitCreditError(true)
      return
    }
    setDebitCreditError(false)
    setEditing({ ...editing, debit: raw })
  }

  function handleCreditChange(raw: string) {
    if (!editing) return
    if (editing.debit !== '' && raw !== '') {
      setDebitCreditError(true)
      return
    }
    setDebitCreditError(false)
    setEditing({ ...editing, credit: raw })
  }

  function handleStatusChange(newStatus: TransactionStatus) {
    setStatusMenuOpen(false)
    if (newStatus === 'void') {
      onVoid(tx.id)
    } else {
      onSave(tx.id, { status: newStatus })
    }
  }

  // Detect scheduled auto-trigger in real time from notes field
  const notesTriggersScheduled = editing
    ? detectScheduledPhrase(editing.notes)
    : false

  const display = editing ?? toEditState(tx)

  // Zebra stripe only when no status color overrides it
  const hasStatusColor = ['in_flight','pending','cleared','void'].includes(tx.status)
  const zebraClass = !hasStatusColor
    ? rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'
    : ''

  return (
    <tr
      className={`group border-b border-slate-200 text-sm transition-colors ${zebraClass} ${rowClass} ${
        isVoid ? 'line-through text-slate-400' : ''
      } ${isLocked ? 'cursor-default' : 'cursor-text'} ${
        !isLocked && !isVoid && !editing ? 'hover:brightness-95' : ''
      }`}
      onClick={!editing && !isLocked && !isVoid ? startEdit : undefined}
      onKeyDown={editing ? handleKeyDown : undefined}
    >
      {/* Check # — Column B */}
      <td className="px-3 py-2 w-24 text-slate-500">
        {editing ? (
          <input
            type="text"
            value={display.check_number}
            onChange={(e) => setEditing({ ...editing, check_number: e.target.value })}
            onBlur={handleBlur}
            onFocus={handleFocus}
            className="w-full bg-transparent border-b border-blue-400 outline-none text-center"
            placeholder="#"
            maxLength={10}
          />
        ) : (
          <span className="text-center block">{tx.check_number ?? ''}</span>
        )}
      </td>

      {/* Date — Column C */}
      <td className="px-3 py-2 w-32">
        {editing ? (
          <input
            type="date"
            value={display.date}
            onChange={(e) => setEditing({ ...editing, date: e.target.value })}
            onBlur={handleBlur}
            onFocus={handleFocus}
            className="w-full bg-transparent border-b border-blue-400 outline-none text-xs"
          />
        ) : (
          <span className="text-xs tabular-nums">
            {tx.date ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US') : ''}
          </span>
        )}
      </td>

      {/* Description — Column D */}
      <td className="px-3 py-2 min-w-0 flex-1">
        {editing ? (
          <input
            type="text"
            value={display.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            onBlur={handleBlur}
            onFocus={handleFocus}
            className="w-full bg-transparent border-b border-blue-400 outline-none"
            maxLength={255}
            autoFocus
          />
        ) : (
          <span className="block truncate">{tx.description}</span>
        )}
      </td>

      {/* Status icon — Column E */}
      <td className="px-3 py-2 w-20 text-center" onClick={(e) => e.stopPropagation()}>
        <div ref={statusMenuRef} className="relative inline-block">
          {/* Clickable trigger — always present, even for 'recorded' (no icon) */}
          {!isLocked && !isVoid ? (
            <button
              type="button"
              onClick={() => setStatusMenuOpen((o) => !o)}
              className={`
                flex items-center justify-center w-8 h-8 rounded transition-colors
                ${statusMenuOpen ? 'bg-slate-200' : 'hover:bg-slate-100'}
                ${tx.status === 'recorded' && !editing ? 'border border-dashed border-slate-300' : ''}
              `}
              title={`Status: ${tx.status} — click to change`}
            >
              {editing && notesTriggersScheduled ? (
                <StatusIcon status="scheduled" className="w-5 h-5" />
              ) : tx.status === 'recorded' ? (
                <span className="text-slate-300 text-xs leading-none">○</span>
              ) : (
                <StatusIcon status={tx.status} className="w-5 h-5" />
              )}
            </button>
          ) : (
            /* Locked or void — just show the icon, no button */
            <span className="flex items-center justify-center w-8 h-8">
              {editing && notesTriggersScheduled ? (
                <StatusIcon status="scheduled" className="w-5 h-5" />
              ) : (
                <StatusIcon status={tx.status} className="w-5 h-5" />
              )}
            </span>
          )}

          {/* Dropdown menu — click-triggered, stays open until selection or outside click */}
          {statusMenuOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-white shadow-xl rounded-lg border border-slate-200 py-1 min-w-[140px]">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`
                    flex items-center gap-2 px-3 py-2 w-full text-left text-xs transition-colors
                    hover:bg-slate-50 active:bg-slate-100
                    ${tx.status === opt.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}
                  `}
                  onClick={() => handleStatusChange(opt.value)}
                >
                  <StatusIcon status={opt.value} className="w-4 h-4 shrink-0" />
                  {opt.label}
                  {tx.status === opt.value && (
                    <span className="ml-auto text-blue-500">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Debit — Column F */}
      <td className="px-3 py-2 w-32 text-right">
        {editing ? (
          <input
            type="text"
            value={display.debit}
            onChange={(e) => handleDebitChange(e.target.value)}
            onBlur={handleBlur}
            onFocus={handleFocus}
            disabled={!!editing.credit}
            className="w-full bg-transparent border-b border-blue-400 outline-none text-right tabular-nums disabled:opacity-30 disabled:cursor-not-allowed"
            placeholder="0.00"
          />
        ) : (
          <span className="tabular-nums text-red-700">
            {tx.debit != null ? formatCurrency(tx.debit) : ''}
          </span>
        )}
      </td>

      {/* Credit — Column G */}
      <td className="px-3 py-2 w-32 text-right">
        {editing ? (
          <input
            type="text"
            value={display.credit}
            onChange={(e) => handleCreditChange(e.target.value)}
            onBlur={handleBlur}
            onFocus={handleFocus}
            disabled={!!editing.debit}
            className="w-full bg-transparent border-b border-blue-400 outline-none text-right tabular-nums disabled:opacity-30 disabled:cursor-not-allowed"
            placeholder="0.00"
          />
        ) : (
          <span className="tabular-nums text-green-700">
            {tx.credit != null ? formatCurrency(tx.credit) : ''}
          </span>
        )}
      </td>

      {/* Balance — Column H (computed, never editable) */}
      <td className="px-3 py-2 w-36 text-right tabular-nums font-medium">
        {tx.balance != null ? (
          <span style={{ color: tx.balance >= 0 ? '#15803d' : '#b91c1c' }}>
            {formatCurrency(tx.balance)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>

      {/* Notes — Column I */}
      <td className="px-3 py-2 w-44">
        {editing ? (
          <input
            type="text"
            value={display.notes}
            onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            onBlur={handleBlur}
            onFocus={handleFocus}
            className="w-full bg-transparent border-b border-blue-400 outline-none text-xs text-slate-500"
            placeholder='e.g. "Scheduled to be paid on 04/15/2026"'
          />
        ) : (
          <span className="text-xs text-slate-400 truncate block">{tx.notes ?? ''}</span>
        )}
      </td>

      {/* Inline error overlay */}
      {debitCreditError && editing && (
        <td colSpan={9} className="px-2 py-1 text-xs text-red-600 bg-red-50">
          A transaction can only be a debit or a credit — not both. Please enter one or the other.
        </td>
      )}

      {/* In-flight tooltip */}
      {tx.status === 'in_flight' && (
        <td className="px-2 py-1 text-xs text-amber-700 italic">
          Payment date passed — awaiting bank confirmation
        </td>
      )}
    </tr>
  )
}

// ============================================================
// New empty row for appending transactions
// ============================================================

interface NewTransactionRowProps {
  registerId: string
  nextRowOrder: number
  isLocked: boolean
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
}

export function NewTransactionRow({
  registerId,
  nextRowOrder,
  isLocked,
  onCreate,
}: NewTransactionRowProps) {
  const today = new Date().toISOString().split('T')[0]!
  const [draft, setDraft] = useState<EditState>({
    check_number: '',
    date: today,
    description: '',
    debit: '',
    credit: '',
    notes: '',
  })
  const [active, setActive] = useState(false)
  const [debitCreditError, setDebitCreditError] = useState(false)

  function handleDebitChange(raw: string) {
    if (draft.credit !== '' && raw !== '') { setDebitCreditError(true); return }
    setDebitCreditError(false)
    setDraft({ ...draft, debit: raw })
  }

  function handleCreditChange(raw: string) {
    if (draft.debit !== '' && raw !== '') { setDebitCreditError(true); return }
    setDebitCreditError(false)
    setDraft({ ...draft, credit: raw })
  }

  function handleSubmit() {
    if (!draft.description.trim() || !draft.date) return
    const debit = parseCurrencyInput(draft.debit)
    const credit = parseCurrencyInput(draft.credit)
    if (debit != null && credit != null) { setDebitCreditError(true); return }

    onCreate({
      register_id: registerId,
      row_order: nextRowOrder,
      date: draft.date,
      description: draft.description.trim(),
      debit: debit ?? null,
      credit: credit ?? null,
      check_number: draft.check_number ? parseInt(draft.check_number, 10) : null,
      notes: draft.notes.trim() || null,
    })
    setDraft({ check_number: '', date: today, description: '', debit: '', credit: '', notes: '' })
    setActive(false)
    setDebitCreditError(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') { setActive(false); setDebitCreditError(false) }
  }

  if (isLocked) return null

  if (!active) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-2">
          <button
            onClick={() => setActive(true)}
            className="text-sm text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1"
          >
            <span className="text-lg leading-none">+</span> Add transaction
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-blue-100 bg-blue-50/30" onKeyDown={handleKeyDown}>
      <td className="px-2 py-1 w-16">
        <input
          type="text"
          value={draft.check_number}
          onChange={(e) => setDraft({ ...draft, check_number: e.target.value })}
          className="w-full bg-white border border-slate-200 rounded px-1 text-center text-xs outline-none focus:border-blue-400"
          placeholder="#"
        />
      </td>
      <td className="px-2 py-1 w-28">
        <input
          type="date"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          className="w-full bg-white border border-slate-200 rounded px-1 text-xs outline-none focus:border-blue-400"
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="text"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="w-full bg-white border border-slate-200 rounded px-2 text-sm outline-none focus:border-blue-400"
          placeholder="Description *"
          autoFocus
          maxLength={255}
        />
      </td>
      <td className="px-2 py-1 w-10 text-center text-slate-300 text-xs">—</td>
      <td className="px-2 py-1 w-28">
        <input
          type="text"
          value={draft.debit}
          onChange={(e) => handleDebitChange(e.target.value)}
          disabled={!!draft.credit}
          className="w-full bg-white border border-slate-200 rounded px-1 text-right tabular-nums text-xs outline-none focus:border-blue-400 disabled:opacity-30"
          placeholder="Debit"
        />
      </td>
      <td className="px-2 py-1 w-28">
        <input
          type="text"
          value={draft.credit}
          onChange={(e) => handleCreditChange(e.target.value)}
          disabled={!!draft.debit}
          className="w-full bg-white border border-slate-200 rounded px-1 text-right tabular-nums text-xs outline-none focus:border-blue-400 disabled:opacity-30"
          placeholder="Credit"
        />
      </td>
      <td className="px-2 py-1 w-32 text-center text-slate-300 text-xs">computed</td>
      <td className="px-2 py-1 w-40">
        <input
          type="text"
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="w-full bg-white border border-slate-200 rounded px-1 text-xs outline-none focus:border-blue-400"
          placeholder='Notes / "Scheduled to be paid on..."'
        />
      </td>
      <td className="px-2 py-1 flex gap-1">
        <button
          onClick={handleSubmit}
          className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
        >
          Save
        </button>
        <button
          onClick={() => { setActive(false); setDebitCreditError(false) }}
          className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300"
        >
          Cancel
        </button>
      </td>
      {debitCreditError && (
        <tr>
          <td colSpan={9} className="px-4 py-1 text-xs text-red-600 bg-red-50">
            A transaction can only be a debit or a credit — not both.
          </td>
        </tr>
      )}
    </tr>
  )
}
