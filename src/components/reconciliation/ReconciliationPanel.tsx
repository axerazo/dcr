// ============================================================
// ReconciliationPanel — SPEC §13 §14
// Slide-in panel showing AI reconciliation analysis results.
// No changes happen automatically — user accepts or ignores.
// ============================================================

import { useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/balance'
import type { DbTransaction } from '@/types'
import type {
  ReconciliationResult,
  ReconciliationSuggestion,
  ReconciliationFlag,
} from '@/types/reconciliation'

// ============================================================
// Helpers
// ============================================================

function statusBadge(status: ReconciliationResult['summary']['status']) {
  switch (status) {
    case 'reconciled':
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          Reconciled
        </span>
      )
    case 'in_progress':
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
          In Progress
        </span>
      )
    case 'needs_attention':
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
          Needs Attention
        </span>
      )
  }
}

const FLAG_ICON: Record<string, string> = {
  warning: '⚠️',
  info: 'ℹ️',
}

const SUGGESTION_TYPE_LABEL: Record<string, string> = {
  mark_pending: 'Mark as Pending',
  verify_amount: 'Verify Amount',
  investigate: 'Investigate',
  informational: 'Info',
}

// ============================================================
// FlagCard
// ============================================================

function FlagCard({
  flag,
  tx,
}: {
  flag: ReconciliationFlag
  tx: DbTransaction | undefined
}) {
  const bgClass = flag.severity === 'warning'
    ? 'bg-amber-50 border-amber-200'
    : 'bg-blue-50 border-blue-200'
  const textClass = flag.severity === 'warning' ? 'text-amber-800' : 'text-blue-800'
  const mutedClass = flag.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'

  return (
    <div className={`rounded-lg border p-3 space-y-1 ${bgClass}`}>
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">
          {FLAG_ICON[flag.severity] ?? 'ℹ️'}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${textClass}`}>
            {flag.description}
          </p>
          {tx && (
            <p className={`text-xs mt-0.5 font-mono ${mutedClass}`}>
              {tx.date} · {tx.description || '(no description)'}
              {tx.debit != null ? ` · ${formatCurrency(tx.debit)} debit` : ''}
              {tx.credit != null ? ` · ${formatCurrency(tx.credit)} credit` : ''}
            </p>
          )}
          <p className={`text-xs mt-1 leading-snug ${mutedClass}`}>
            {flag.reasoning}
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SuggestionCard
// ============================================================

type CardState = 'default' | 'accepted' | 'ignored'

function SuggestionCard({
  suggestion,
  tx,
  state,
  onAccept,
  onIgnore,
}: {
  suggestion: ReconciliationSuggestion
  tx: DbTransaction | undefined
  state: CardState
  onAccept: () => void
  onIgnore: () => void
}) {
  const isInformational = suggestion.type === 'informational'

  const bgClass =
    state === 'accepted' ? 'bg-green-50 border-green-200' :
    state === 'ignored'  ? 'bg-slate-50 border-slate-200 opacity-60' :
    'bg-white border-slate-200'

  return (
    <div className={`rounded-lg border p-3 transition-colors ${bgClass}`}>
      <div className="flex items-start gap-3">
        {/* Priority badge */}
        {!isInformational && (
          <div className="shrink-0 mt-0.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold">
              {suggestion.priority}
            </span>
          </div>
        )}
        {isInformational && (
          <span className="shrink-0 text-blue-500 mt-0.5">ℹ️</span>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {SUGGESTION_TYPE_LABEL[suggestion.type] ?? suggestion.type}
              </span>
              <p className="text-sm font-medium text-slate-800 leading-snug mt-0.5">
                {suggestion.description}
              </p>
            </div>

            {/* State indicator */}
            {state === 'accepted' && (
              <span className="shrink-0 text-green-600 font-semibold text-sm">✅</span>
            )}
          </div>

          {/* Transaction ref */}
          {tx && (
            <p className="text-xs text-slate-400 font-mono mt-1">
              {tx.date} · {tx.description || '(no description)'}
              {tx.debit != null ? ` · ${formatCurrency(tx.debit)} debit` : ''}
              {tx.credit != null ? ` · ${formatCurrency(tx.credit)} credit` : ''}
            </p>
          )}

          {/* Reasoning */}
          <p className="text-xs text-slate-500 leading-snug mt-1">
            {suggestion.reasoning}
          </p>

          {/* Action buttons */}
          {!isInformational && state === 'default' && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={onAccept}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded-sm hover:bg-green-700 font-medium transition-colors"
              >
                Accept
              </button>
              <button
                onClick={onIgnore}
                className="px-3 py-1 text-xs bg-slate-100 text-slate-600 rounded-sm hover:bg-slate-200 font-medium transition-colors"
              >
                Ignore
              </button>
            </div>
          )}

          {state === 'accepted' && (
            <p className="text-xs text-green-600 font-medium mt-1.5">Applied</p>
          )}
          {state === 'ignored' && (
            <p className="text-xs text-slate-400 font-medium mt-1.5">Ignored</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Props
// ============================================================

interface ReconciliationPanelProps {
  monthLabel: string
  accountNickname: string
  result: ReconciliationResult
  transactions: DbTransaction[]
  gap: number
  onAccept: (suggestion: ReconciliationSuggestion) => Promise<void>
  onIgnore: (suggestion: ReconciliationSuggestion) => Promise<void>
  onClose: (stats: { accepted: number; ignored: number }) => void
}

// ============================================================
// Panel
// ============================================================

export function ReconciliationPanel({
  monthLabel,
  accountNickname,
  result,
  transactions,
  gap,
  onAccept,
  onIgnore,
  onClose,
}: ReconciliationPanelProps) {
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  // Lookup map: suggestion.id → CardState
  function stateOf(id: string): CardState {
    return cardStates[id] ?? 'default'
  }

  // Actionable suggestions (non-informational) — these have Accept/Ignore
  const actionable = useMemo(
    () => result.suggestions.filter((s) => s.type !== 'informational'),
    [result.suggestions],
  )

  const acceptedCount = Object.values(cardStates).filter((s) => s === 'accepted').length
  const ignoredCount = Object.values(cardStates).filter((s) => s === 'ignored').length
  const reviewedCount = acceptedCount + ignoredCount
  const allReviewed = actionable.length > 0 && reviewedCount >= actionable.length

  async function handleAccept(suggestion: ReconciliationSuggestion) {
    if (busy[suggestion.id]) return
    setBusy((b) => ({ ...b, [suggestion.id]: true }))
    try {
      await onAccept(suggestion)
      setCardStates((s) => ({ ...s, [suggestion.id]: 'accepted' }))
    } finally {
      setBusy((b) => ({ ...b, [suggestion.id]: false }))
    }
  }

  async function handleIgnore(suggestion: ReconciliationSuggestion) {
    if (busy[suggestion.id]) return
    setBusy((b) => ({ ...b, [suggestion.id]: true }))
    try {
      await onIgnore(suggestion)
      setCardStates((s) => ({ ...s, [suggestion.id]: 'ignored' }))
    } finally {
      setBusy((b) => ({ ...b, [suggestion.id]: false }))
    }
  }

  async function handleAcceptAll() {
    for (const s of actionable) {
      if (stateOf(s.id) === 'default') {
        await handleAccept(s)
      }
    }
  }

  async function handleIgnoreAll() {
    for (const s of actionable) {
      if (stateOf(s.id) === 'default') {
        await handleIgnore(s)
      }
    }
  }

  function handleClose() {
    onClose({ accepted: acceptedCount, ignored: ignoredCount })
  }

  const txById = useMemo(() => {
    const m: Record<string, DbTransaction> = {}
    for (const tx of transactions) m[tx.id] = tx
    return m
  }, [transactions])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
      {/* Backdrop — only pointer-events active so register remains readable */}
      <div
        className="absolute inset-0 bg-black/30 pointer-events-auto"
        onClick={handleClose}
      />

      {/* Panel — 420px desktop, full width mobile */}
      <div className="relative z-10 h-full w-full sm:max-w-[420px] bg-white shadow-2xl flex flex-col pointer-events-auto">

        {/* 1. Header */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              Reconciliation — {monthLabel}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {statusBadge(result.summary.status)}
              <span className="text-xs text-slate-400">{accountNickname}</span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white text-xl leading-none px-1 ml-3 shrink-0"
            aria-label="Close reconciliation panel"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* 2. Summary */}
          <div className="px-4 py-4 border-b border-slate-100 space-y-3">
            <p className="text-sm font-semibold text-slate-800 leading-snug">
              {result.summary.headline}
            </p>
            {result.summary.gap_explanation && (
              <p className="text-sm text-slate-600 leading-snug">
                {result.summary.gap_explanation}
              </p>
            )}
            {/* Stat pills */}
            <div className="flex flex-wrap gap-2">
              <StatPill
                label="Suggestions"
                value={result.suggestions.length}
                color="slate"
              />
              <StatPill
                label="Flags"
                value={result.flags.length}
                color={result.flags.length > 0 ? 'amber' : 'slate'}
              />
              {gap !== 0 && (
                <StatPill
                  label="Gap"
                  value={formatCurrency(Math.abs(gap))}
                  color="amber"
                />
              )}
            </div>
          </div>

          {/* 3. Flags */}
          {result.flags.length > 0 && (
            <section className="px-4 pt-4 pb-2 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                ⚠️ Items to Review
              </h3>
              {result.flags.map((flag) => (
                <FlagCard
                  key={flag.id}
                  flag={flag}
                  tx={flag.transaction_id ? txById[flag.transaction_id] : undefined}
                />
              ))}
            </section>
          )}

          {/* 4. Suggestions */}
          {result.suggestions.length > 0 && (
            <section className="px-4 pt-4 pb-4 space-y-3">
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Suggested Actions
                </h3>
                <p className="text-xs text-slate-400">
                  Review each suggestion and accept or ignore
                </p>
              </div>

              {/* Bulk actions — only when actionable.length > 1 */}
              {actionable.length > 1 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleAcceptAll}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded-sm hover:bg-green-700 font-medium transition-colors"
                  >
                    Accept All
                  </button>
                  <button
                    onClick={handleIgnoreAll}
                    className="px-3 py-1 text-xs bg-slate-200 text-slate-600 rounded-sm hover:bg-slate-300 font-medium transition-colors"
                  >
                    Ignore All
                  </button>
                </div>
              )}

              {/* Suggestion cards ordered by priority */}
              {result.suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  tx={s.transaction_id ? txById[s.transaction_id] : undefined}
                  state={stateOf(s.id)}
                  onAccept={() => handleAccept(s)}
                  onIgnore={() => handleIgnore(s)}
                />
              ))}
            </section>
          )}

          {/* Empty state */}
          {result.suggestions.length === 0 && result.flags.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm font-medium text-slate-700">
                No suggestions or flags
              </p>
              <p className="text-xs text-slate-400 mt-1">
                This register looks clean.
              </p>
            </div>
          )}
        </div>

        {/* 5. Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 shrink-0 space-y-2">
          {actionable.length > 0 && (
            <p className={`text-xs ${allReviewed ? 'text-green-600 font-medium' : 'text-slate-500'}`}>
              {allReviewed
                ? 'All suggestions reviewed'
                : `${reviewedCount} of ${actionable.length} suggestion${actionable.length === 1 ? '' : 's'} reviewed`}
            </p>
          )}
          <button
            onClick={handleClose}
            className={`w-full py-2 text-sm font-medium rounded transition-colors ${
              allReviewed || actionable.length === 0
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// StatPill
// ============================================================

function StatPill({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color: 'slate' | 'amber' | 'green'
}) {
  const styles: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-green-100 text-green-700',
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[color]}`}>
      {label}: <strong>{value}</strong>
    </span>
  )
}
