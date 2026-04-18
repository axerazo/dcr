// ============================================================
// TransactionRow — inline-editable register row (SPEC §6, §7, §11)
// Autosave on blur/Enter. Debit/credit mutually exclusive.
// Scheduled date is set via dedicated date picker (Column J).
// scheduled_date column is the single source of truth.
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react'
import { StatusIcon, statusRowClass } from '@/components/ui/StatusIcon'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { formatCurrency, parseCurrencyInput } from '@/lib/balance'
import { useSuggestions, invalidateSuggestionCache } from '@/hooks/useSuggestions'
import type { Transaction, TransactionStatus } from '@/types'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

const BASE_STATUS_OPTIONS: { value: TransactionStatus; label: string }[] = [
  { value: 'recorded', label: 'Recorded' },
  { value: 'pending', label: 'Pending' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'void', label: 'Void' },
]

interface TransactionRowProps {
  transaction: Transaction
  rowIndex: number
  isLocked: boolean
  accountId: string
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
  scheduled_date: string  // '' when null; stored as YYYY-MM-DD
}

function toEditState(tx: Transaction): EditState {
  return {
    check_number: tx.check_number != null ? String(tx.check_number) : '',
    date: tx.date,
    description: tx.description,
    debit: tx.debit != null ? String(tx.debit) : '',
    credit: tx.credit != null ? String(tx.credit) : '',
    notes: tx.notes ?? '',
    scheduled_date: tx.scheduled_date ?? '',
  }
}

export function TransactionRow({ transaction: tx, rowIndex, isLocked, accountId, onSave, onVoid }: TransactionRowProps) {
  const [editing, setEditing] = useState<EditState | null>(null)
  const [debitCreditError, setDebitCreditError] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [schedToast, setSchedToast] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)

  // Autocomplete suggestions — hooks called unconditionally; return [] when editing is null
  const descSuggestions  = useSuggestions(accountId, 'description', editing?.description ?? '')
  const notesSuggestions = useSuggestions(accountId, 'notes',       editing?.notes       ?? '')

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

      // Detect scheduled_date being cleared so we can notify the user
      const clearingScheduledDate = !state.scheduled_date && !!tx.scheduled_date
      const willAutoReset =
        clearingScheduledDate &&
        (tx.status === 'scheduled' || tx.status === 'in_flight')

      onSave(tx.id, {
        check_number: checkNum && checkNum > 0 ? checkNum : null,
        date: state.date,
        description: state.description.trim(),
        debit: debit ?? null,
        credit: credit ?? null,
        notes: state.notes.trim() || null,
        scheduled_date: state.scheduled_date || null,
      })

      if (willAutoReset) {
        if (schedToastTimerRef.current) clearTimeout(schedToastTimerRef.current)
        setSchedToast(true)
        schedToastTimerRef.current = setTimeout(() => setSchedToast(false), 4000)
      }

      invalidateSuggestionCache(accountId)
      setEditing(null)
    },
    [tx.id, tx.scheduled_date, tx.status, onSave, accountId],
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

  // Show scheduled icon preview when scheduled_date is set
  const hasScheduledDate = editing ? editing.scheduled_date !== '' : !!tx.scheduled_date

  // Show 'Scheduled' option in status dropdown only when a scheduled_date is set
  const statusOptions = hasScheduledDate
    ? [
        { value: 'recorded' as TransactionStatus, label: 'Recorded' },
        { value: 'scheduled' as TransactionStatus, label: 'Scheduled' },
        ...BASE_STATUS_OPTIONS.slice(1),
      ]
    : BASE_STATUS_OPTIONS

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
            {tx.date ? formatDate(tx.date) : ''}
          </span>
        )}
      </td>

      {/* Description — Column D */}
      <td className="px-3 py-2 min-w-0 flex-1">
        {editing ? (
          <AutocompleteInput
            type="text"
            value={display.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            onBlur={handleBlur}
            onFocus={handleFocus}
            suggestions={descSuggestions}
            onAccept={(val) => setEditing((s) => s ? { ...s, description: val } : s)}
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
              onFocus={handleFocus}
              onClick={() => setStatusMenuOpen((o) => !o)}
              className={`
                flex items-center justify-center w-8 h-8 rounded transition-colors
                ${statusMenuOpen ? 'bg-slate-200' : 'hover:bg-slate-100'}
                ${tx.status === 'recorded' && !editing ? 'border border-dashed border-slate-300' : ''}
              `}
              title={`Status: ${tx.status} — click to change`}
            >
              {editing && hasScheduledDate ? (
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
              {editing && hasScheduledDate ? (
                <StatusIcon status="scheduled" className="w-5 h-5" />
              ) : (
                <StatusIcon status={tx.status} className="w-5 h-5" />
              )}
            </span>
          )}

          {/* Dropdown menu — click-triggered, stays open until selection or outside click */}
          {statusMenuOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-white shadow-xl rounded-lg border border-slate-200 py-1 min-w-[140px]">
              {statusOptions.map((opt) => (
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
          <AutocompleteInput
            type="text"
            value={display.notes}
            onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            onBlur={handleBlur}
            onFocus={handleFocus}
            suggestions={notesSuggestions}
            onAccept={(val) => setEditing((s) => s ? { ...s, notes: val } : s)}
            className="w-full bg-transparent border-b border-blue-400 outline-none text-xs text-slate-500"
            placeholder="Notes / Confirmation number..."
          />
        ) : (
          <span className="text-xs text-slate-400 truncate block">{tx.notes ?? ''}</span>
        )}
      </td>

      {/* Sched. Date — Column J */}
      <td className="px-3 py-2 w-32">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={display.scheduled_date}
              onChange={(e) => setEditing({ ...editing, scheduled_date: e.target.value })}
              onBlur={handleBlur}
              onFocus={handleFocus}
              className="w-full bg-transparent border-b border-blue-400 outline-none text-xs"
            />
            {display.scheduled_date && (
              <button
                type="button"
                onMouseDown={(e) => {
                  // Prevent the blur on the date input from firing first
                  e.preventDefault()
                  setEditing({ ...editing, scheduled_date: '' })
                }}
                className="text-slate-400 hover:text-red-500 text-base leading-none shrink-0"
                title="Clear scheduled date"
              >
                ×
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs tabular-nums text-slate-500">
            {tx.scheduled_date ? formatDate(tx.scheduled_date) : ''}
          </span>
        )}
      </td>

      {/* Inline error overlay */}
      {debitCreditError && editing && (
        <td colSpan={10} className="px-2 py-1 text-xs text-red-600 bg-red-50">
          A transaction can only be a debit or a credit — not both. Please enter one or the other.
        </td>
      )}

      {/* In-flight tooltip */}
      {tx.status === 'in_flight' && (
        <td className="px-2 py-1 text-xs text-amber-700 italic">
          Payment date passed — awaiting bank confirmation
        </td>
      )}

      {/* Scheduled date cleared toast */}
      {schedToast && (
        <td className="px-2 py-1 text-xs text-blue-700 italic">
          Scheduled date removed — status reset to recorded
        </td>
      )}
    </tr>
  )
}

// ============================================================
// New empty row for appending transactions — keyboard-driven
// ============================================================

interface NewTransactionRowProps {
  registerId: string
  nextRowOrder: number
  isLocked: boolean
  accountId: string
  onCreate: (payload: {
    register_id: string
    row_order: number
    date: string
    description: string
    debit?: number | null
    credit?: number | null
    check_number?: number | null
    notes?: string | null
    scheduled_date?: string | null
    status?: TransactionStatus
  }) => void
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function blankDraft(): EditState {
  return { check_number: '', date: todayIso(), description: '', debit: '', credit: '', notes: '', scheduled_date: '' }
}

export function NewTransactionRow({
  registerId,
  nextRowOrder,
  isLocked,
  accountId,
  onCreate,
}: NewTransactionRowProps) {
  const [active, setActive] = useState(false)
  const [draft, setDraft] = useState<EditState>(blankDraft)
  const [draftStatus, setDraftStatus] = useState<TransactionStatus>('recorded')
  const [debitCreditError, setDebitCreditError] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const rowRef          = useRef<HTMLTableRowElement>(null)
  const dateRef         = useRef<HTMLInputElement>(null)
  const descRef         = useRef<HTMLInputElement>(null)
  const statusRef       = useRef<HTMLSelectElement>(null)
  const debitRef        = useRef<HTMLInputElement>(null)
  const creditRef       = useRef<HTMLInputElement>(null)
  const notesRef        = useRef<HTMLInputElement>(null)
  const schedDateRef    = useRef<HTMLInputElement>(null)

  // Autocomplete — only fires when 2+ chars typed; returns [] otherwise
  const descSuggestions  = useSuggestions(accountId, 'description', draft.description)
  const notesSuggestions = useSuggestions(accountId, 'notes',       draft.notes)

  function isDraftEmpty() {
    return (
      !draft.check_number.trim() &&
      !draft.description.trim() &&
      !draft.debit &&
      !draft.credit &&
      !draft.notes.trim()
    )
  }

  // Save-and-continue: reset draft, keep row open, re-focus Date, then scroll.
  // Focus runs first so the browser's built-in focus-scroll (block: nearest) fires,
  // then requestAnimationFrame scrolls to center — after React's commit and the
  // browser's layout pass — so our scroll always wins over the browser's default.
  function resetAndContinue() {
    setDraft(blankDraft())
    setDraftStatus('recorded')
    setDebitCreditError(false)
    setConfirmDiscard(false)
    setTimeout(() => {
      dateRef.current?.focus()
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }, 0)
  }

  function deactivate() {
    setActive(false)
    setDraft(blankDraft())
    setDraftStatus('recorded')
    setDebitCreditError(false)
    setConfirmDiscard(false)
  }

  function activate() {
    setActive(true)
    setTimeout(() => {
      dateRef.current?.focus()
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }, 0)
  }

  // notesOverride is passed by the notes AutocompleteInput onAccept so
  // we can use the accepted value before React has re-rendered draft.notes.
  function handleSubmit(notesOverride?: string) {
    if (!draft.description.trim() || !draft.date) return
    const debit = parseCurrencyInput(draft.debit)
    const credit = parseCurrencyInput(draft.credit)
    if (debit != null && credit != null) {
      setDebitCreditError(true)
      return
    }
    const notesVal = notesOverride !== undefined ? notesOverride : draft.notes
    onCreate({
      register_id: registerId,
      row_order: nextRowOrder,
      date: draft.date,
      description: draft.description.trim(),
      debit: debit ?? null,
      credit: credit ?? null,
      check_number: draft.check_number ? parseInt(draft.check_number, 10) : null,
      notes: (notesVal ?? '').trim() || null,
      scheduled_date: draft.scheduled_date || null,
      status: draftStatus,
    })
    invalidateSuggestionCache(accountId)
    resetAndContinue()
  }

  function handleEscape() {
    if (isDraftEmpty()) {
      deactivate()
    } else {
      setConfirmDiscard(true)
    }
  }

  function handleDebitChange(raw: string) {
    if (draft.credit !== '' && raw !== '') { setDebitCreditError(true); return }
    setDebitCreditError(false)
    setDraft((d) => ({ ...d, debit: raw }))
  }

  function handleCreditChange(raw: string) {
    if (draft.debit !== '' && raw !== '') { setDebitCreditError(true); return }
    setDebitCreditError(false)
    setDraft((d) => ({ ...d, credit: raw }))
  }

  // Enter saves from any field; Escape triggers discard logic
  function commonKeys(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); handleEscape() }
  }

  if (isLocked) return null

  if (!active) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-2">
          <button
            onClick={activate}
            className="text-sm text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1"
          >
            <span className="text-lg leading-none">+</span> Add transaction
          </button>
        </td>
      </tr>
    )
  }

  // Discard-confirmation overlay — replaces the form row temporarily
  if (confirmDiscard) {
    return (
      <tr className="border-b border-amber-200 bg-amber-50">
        <td colSpan={9} className="px-4 py-3">
          <span className="text-sm text-amber-800 mr-3">Discard this entry?</span>
          <button
            autoFocus
            onClick={deactivate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') deactivate()
              if (e.key === 'Escape') { setConfirmDiscard(false); setTimeout(() => descRef.current?.focus(), 0) }
            }}
            className="px-3 py-1 mr-2 bg-amber-600 text-white text-xs rounded hover:bg-amber-700"
          >
            Yes, discard
          </button>
          <button
            onClick={() => { setConfirmDiscard(false); setTimeout(() => descRef.current?.focus(), 0) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                setConfirmDiscard(false)
                setTimeout(() => descRef.current?.focus(), 0)
              }
            }}
            className="px-3 py-1 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300"
          >
            No, keep editing
          </button>
        </td>
      </tr>
    )
  }

  const base = 'w-full bg-white border rounded px-1 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-colors'
  const err  = debitCreditError ? ' border-red-400' : ' border-slate-200'

  return (
    <tr ref={rowRef} className="border-b border-blue-300 bg-blue-50/70 outline outline-1 outline-blue-200">
      {/* Check # */}
      <td className="px-2 py-1.5 w-16">
        <input
          type="text"
          value={draft.check_number}
          onChange={(e) => setDraft((d) => ({ ...d, check_number: e.target.value }))}
          onKeyDown={commonKeys}
          className={`${base} border-slate-200 text-center`}
          placeholder="#"
        />
      </td>

      {/* Date — browser handles Tab within month/day/year sub-fields natively;
          Tab out flows to Description via tabIndex order. */}
      <td className="px-2 py-1.5 w-28">
        <input
          ref={dateRef}
          type="date"
          value={draft.date}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          onKeyDown={commonKeys}
          className={`${base} border-slate-200`}
        />
      </td>

      {/* Description — smart Tab: skip Debit if Credit is already filled */}
      <td className="px-2 py-1.5">
        <AutocompleteInput
          ref={descRef}
          type="text"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          onKeyDown={(e) => {
            commonKeys(e)
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault()
              statusRef.current?.focus()
            }
          }}
          suggestions={descSuggestions}
          onAccept={(val) => {
            setDraft((d) => ({ ...d, description: val }))
            setTimeout(() => statusRef.current?.focus(), 0)
          }}
          className={`${base} border-slate-200 text-sm px-2`}
          placeholder="Description *"
          maxLength={255}
        />
      </td>

      {/* Status — included in Tab order between Description and Debit */}
      <td className="px-2 py-1.5 w-20">
        <select
          ref={statusRef}
          value={draftStatus}
          onChange={(e) => setDraftStatus(e.target.value as TransactionStatus)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault()
              if (draft.credit !== '') notesRef.current?.focus()
              else debitRef.current?.focus()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              handleEscape()
            } else if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
          className={`${base} border-slate-200 ${draftStatus === 'recorded' ? 'text-slate-400' : 'text-slate-700'}`}
        >
          <option value="recorded">Recorded</option>
          <option value="pending">Pending</option>
          <option value="cleared">Cleared</option>
        </select>
      </td>

      {/* Debit — smart Tab: skip Credit if Debit has a value */}
      <td className="px-2 py-1.5 w-28">
        <input
          ref={debitRef}
          type="text"
          value={draft.debit}
          onChange={(e) => handleDebitChange(e.target.value)}
          onKeyDown={(e) => {
            commonKeys(e)
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault()
              if (draft.debit !== '') notesRef.current?.focus()
              else creditRef.current?.focus()
            }
          }}
          disabled={!!draft.credit}
          className={`${base}${err} text-right tabular-nums disabled:opacity-30 disabled:cursor-not-allowed`}
          placeholder="Debit"
        />
      </td>

      {/* Credit — Tab always flows to Notes */}
      <td className="px-2 py-1.5 w-28">
        <input
          ref={creditRef}
          type="text"
          value={draft.credit}
          onChange={(e) => handleCreditChange(e.target.value)}
          onKeyDown={(e) => {
            commonKeys(e)
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault()
              notesRef.current?.focus()
            }
          }}
          disabled={!!draft.debit}
          className={`${base}${err} text-right tabular-nums disabled:opacity-30 disabled:cursor-not-allowed`}
          placeholder="Credit"
        />
      </td>

      {/* Balance — excluded from tab order */}
      <td className="px-2 py-1.5 w-32 text-center text-slate-300 text-xs" tabIndex={-1}>computed</td>

      {/* Notes — Tab advances to Sched. Date; Enter saves */}
      <td className="px-2 py-1.5 w-40">
        <AutocompleteInput
          ref={notesRef}
          type="text"
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            } else if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault()
              schedDateRef.current?.focus()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              handleEscape()
            }
          }}
          suggestions={notesSuggestions}
          onAccept={(val) => {
            handleSubmit(val)
          }}
          className={`${base} border-slate-200`}
          placeholder="Notes / Confirmation number..."
        />
      </td>

      {/* Sched. Date — Tab/Enter saves */}
      <td className="px-2 py-1.5 w-28">
        <input
          ref={schedDateRef}
          type="date"
          value={draft.scheduled_date}
          onChange={(e) => setDraft((d) => ({ ...d, scheduled_date: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
              e.preventDefault()
              handleSubmit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              handleEscape()
            }
          }}
          className={`${base} border-slate-200`}
        />
      </td>

      {/* Actions */}
      <td className="px-2 py-1.5 flex gap-1 items-center">
        <button
          onClick={() => handleSubmit()}
          title="Save and add another (Enter)"
          className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
        >
          Save
        </button>
        <button
          onClick={handleEscape}
          title="Cancel (Esc)"
          className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300"
        >
          Cancel
        </button>
      </td>
      {debitCreditError && (
        <td className="px-2 py-1 text-xs text-red-600 whitespace-nowrap">
          Debit or credit — not both.
        </td>
      )}
    </tr>
  )
}
