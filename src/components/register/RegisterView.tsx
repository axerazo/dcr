// ============================================================
// RegisterView — top-level register page for one account
// Implements the month_status lifecycle: open → ready_to_close
// → soft_closed → hard_closed. Silent carry-forward on every
// transaction clear. SPEC §9 Formula E (revised), §11, §12.
// ============================================================

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRegister, useCreateRegister, useUpdateRegister } from '@/hooks/useRegister'
import { useTransactions, useAddTransaction, useUpdateTransaction, useUpdateTransactionStatus, useDeleteTransaction } from '@/hooks/useTransactions'
import { computeBalanceSummary, computeClosingBalance, formatCurrency, currencyEq } from '@/lib/balance'
import { computeLastClearedRunningBalance, pendingTransactionCount, allTransactionsCleared } from '@/lib/monthStatus'
import { writeAuditEntry } from '@/lib/audit'
import { buildReconciliationContext } from '@/lib/reconciliation/buildContext'
import { runReconciliationSession } from '@/lib/reconciliation/reconciliationService'
import { useAuthStore } from '@/store/authStore'
import { useSessionStore } from '@/store/sessionStore'
import { RegisterHeader } from './RegisterHeader'
import { TransactionTable } from './TransactionTable'
import { MonthNav } from './MonthNav'
import { YearlySummary } from './YearlySummary'
import { ReconciliationPanel } from '@/components/reconciliation/ReconciliationPanel'
import { MONTH_NAMES } from '@/types'
import type { DbAccount, DbTransaction } from '@/types'
import type { ReconciliationResult, ReconciliationSuggestion } from '@/types/reconciliation'
import { ReconciliationParseError } from '@/types/reconciliation'

interface RegisterViewProps {
  account: DbAccount
}

function nextMonthOf(month: number, year: number) {
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
}
function prevMonthOf(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
}

export function RegisterView({ account }: RegisterViewProps) {
  const now = new Date()
  const { user } = useAuthStore()

  const [activeMonth, setActiveMonth] = useState(now.getMonth() + 1)
  const [activeYear, setActiveYear] = useState(now.getFullYear())
  const [showUnlockDialog, setShowUnlockDialog] = useState(false)
  const [closePromptDismissed, setClosePromptDismissed] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [closeKeepAcknowledged, setCloseKeepAcknowledged] = useState(false)
  // Tracks the lastClearedBalance value at which the user dismissed the mismatch prompt.
  // When balance changes to a new value the ref resets and the prompt re-arms.
  const dismissedForBalanceRef = useRef<number | null>(null)
  // Re-lock validation error — shown inline, cleared on navigation
  const [relockError, setRelockError] = useState<string | null>(null)
  // Set to true when a corrupt archived+uncleared state was detected and auto-corrected
  const [wasCorrupted, setWasCorrupted] = useState(false)
  // AI Reconciliation session — SPEC §13 §14
  const [isReconciling, setIsReconciling] = useState(false)
  const [reconcileError, setReconcileError] = useState<string | null>(null)
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null)
  const [showReconciliationPanel, setShowReconciliationPanel] = useState(false)
  // Inline message shown inside the mismatch prompt when the update is blocked
  const [mismatchArchivedBlocked, setMismatchArchivedBlocked] = useState(false)

  // Unlock state lives in a global store so it survives tab navigation within the session.
  // Keyed by register UUID so unlocking March never affects April.
  const { unlockedRegisters, removeUnlockedRegister } = useSessionStore()

  // --- Queries ---
  const { data: register, isLoading: regLoading } = useRegister(account.id, activeMonth, activeYear)
  const { data: transactions = [], isLoading: txLoading } = useTransactions(register?.id)

  const nm = nextMonthOf(activeMonth, activeYear)
  const { data: nextMonthReg } = useRegister(account.id, nm.month, nm.year)

  const pm = prevMonthOf(activeMonth, activeYear)
  const { data: priorMonthReg } = useRegister(account.id, pm.month, pm.year)

  const createRegister = useCreateRegister()
  const updateRegister = useUpdateRegister()
  const addTransaction = useAddTransaction()
  const updateTransaction = useUpdateTransaction()
  const updateTransactionStatus = useUpdateTransactionStatus()
  const deleteTransaction = useDeleteTransaction()

  // --- Computed values ---
  const balances = register
    ? computeBalanceSummary(register.opening_balance, transactions)
    : null

  const closingBalance: number | null = register
    ? computeClosingBalance(register.opening_balance, transactions)
    : null

  const lastClearedBalance: number = register
    ? computeLastClearedRunningBalance(register.opening_balance, transactions)
    : 0

  const pendingCount = pendingTransactionCount(transactions)

  // Unlock state: true when this specific register has been unlocked this session.
  const isSessionUnlocked = register ? unlockedRegisters.has(register.id) : false

  // Number of non-void, non-cleared transactions — used for corrupt-state detection
  // and re-lock validation. Stable number prevents referential array dependencies.
  const unclearedCount = transactions.filter(
    (tx) => tx.status !== 'void' && tx.status !== 'cleared',
  ).length

  // Derived from DB data — no local state needed. Survives navigation because it
  // recomputes from fresh nextMonthReg on every mount.
  const nextMonthIsArchived =
    nextMonthReg?.month_status === 'soft_closed' ||
    nextMonthReg?.month_status === 'hard_closed'

  // Is the close prompt in "happy path" (balances already match, no next month, next
  // month is archived so its opening cannot be changed, or user explicitly acknowledged
  // the discrepancy by choosing "Keep opening balance")?
  const isHappyClose =
    nextMonthReg == null ||
    nextMonthIsArchived ||
    currencyEq(closingBalance ?? 0, nextMonthReg.opening_balance) ||
    closeKeepAcknowledged

  // Mismatch prompt — fully computed, no state. Must be declared here (before any
  // early returns) to satisfy Rules of Hooks. Guards register null for the same reason.
  // nextMonthIsArchived = true → always false; no setter can race the guard.
  // Dismissed by writing dismissedForBalanceRef; re-arms when lastClearedBalance changes.
  const showMismatchPrompt = useMemo(() => {
    if (!register || register.month_status !== 'open') return false
    if (nextMonthIsArchived) return false
    if (!nextMonthReg) return false
    if (currencyEq(lastClearedBalance, nextMonthReg.opening_balance)) return false

    // Require user decision when next month was previously committed (soft or hard
    // closed and now reopened) OR manually entered — never silently overwrite a
    // balance that was part of a committed record. SPEC §2.
    const requiresDecision =
      nextMonthReg.last_closed_type !== null || nextMonthReg.is_manual_opening === true

    if (!requiresDecision) return false
    if (
      dismissedForBalanceRef.current !== null &&
      currencyEq(dismissedForBalanceRef.current, lastClearedBalance)
    ) return false
    return true
  }, [register, nextMonthIsArchived, nextMonthReg, lastClearedBalance])

  // Reset dismissal ref when lastClearedBalance moves to a new value so the
  // mismatch prompt re-arms for the new balance.
  useEffect(() => {
    if (
      dismissedForBalanceRef.current !== null &&
      !currencyEq(dismissedForBalanceRef.current, lastClearedBalance)
    ) {
      dismissedForBalanceRef.current = null
    }
  }, [lastClearedBalance])

  // --- Auto-update next month opening silently on every transaction change ---
  // Guards (skip silently updating when):
  //   • next month is archived (soft/hard closed) — show warning banner instead
  //   • next month is locked (soft/hard closed)
  //   • this month is itself soft/hard closed
  //   • balances already match
  //   • next month's opening was manually entered (is_manual_opening = true) —
  //     in that case we show the mismatch prompt and wait for user decision,
  //     never silently overwriting. SPEC §2: nothing changes without user knowledge.
  useEffect(() => {
    if (!register || !nextMonthReg) return
    if (
      register.month_status === 'soft_closed' ||
      register.month_status === 'hard_closed'
    ) return
    if (currencyEq(lastClearedBalance, nextMonthReg.opening_balance)) return

    // Block carry-forward if next month is archived — prompt is suppressed via
    // the computed showMismatchPrompt, no state needed here.
    if (
      nextMonthReg.month_status === 'soft_closed' ||
      nextMonthReg.month_status === 'hard_closed'
    ) return

    if (nextMonthReg.is_locked) return

    // Do not silently update previously committed months (soft or hard closed,
    // now reopened) or manually-entered openings — showMismatchPrompt handles both.
    if (nextMonthReg.last_closed_type !== null || nextMonthReg.is_manual_opening) return

    // Normal carry-forward: only for genuinely fresh open months (last_closed_type = null,
    // is_manual_opening = false). SPEC §2: nothing changes without user knowledge.
    updateRegister.mutate({
      id: nextMonthReg.id,
      opening_balance: lastClearedBalance,
      is_manual_opening: false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lastClearedBalance,
    nextMonthReg?.id,
    nextMonthReg?.opening_balance,
    nextMonthReg?.is_locked,
    nextMonthReg?.is_manual_opening,
    nextMonthReg?.last_closed_type,
    nextMonthReg?.month_status,
    register?.month_status,
  ])

  // --- Ready-to-close detection ---
  // Only applies to 'open' and 'ready_to_close' states, and only for months that
  // have never been formally closed before. Previously-closed months use Re-lock
  // instead of Close & Archive, so they must never enter ready_to_close.
  useEffect(() => {
    if (!register) return
    if (register.last_closed_type === 'hard') return
    const status = register.month_status
    if (status === 'soft_closed' || status === 'hard_closed') return

    const cleared = allTransactionsCleared(transactions)

    if (cleared && status === 'open') {
      updateRegister.mutate({ id: register.id, month_status: 'ready_to_close' })
    } else if (!cleared && status === 'ready_to_close') {
      updateRegister.mutate({ id: register.id, month_status: 'open' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, register?.month_status, register?.id, register?.last_closed_type])

  // Reset close-prompt state when month status changes (e.g. ready_to_close → open)
  useEffect(() => {
    setClosePromptDismissed(false)
    setCloseKeepAcknowledged(false)
  }, [register?.month_status])

  // Reset navigation-scoped state when the user moves to a different month
  useEffect(() => {
    setRelockError(null)
    setWasCorrupted(false)
    setMismatchArchivedBlocked(false)
  }, [activeMonth, activeYear])

  // Auto-dismiss corrupt-state banner once all transactions are cleared and
  // the status machine has transitioned to ready_to_close.
  useEffect(() => {
    if (wasCorrupted && unclearedCount === 0 && register?.month_status === 'ready_to_close') {
      setWasCorrupted(false)
    }
  }, [unclearedCount, wasCorrupted, register?.month_status])

  // --- Corrupt state detection ---
  // An archived month (soft/hard closed) must not have uncleared transactions.
  // If found, auto-correct: revert to 'open' and unlock so the user can resolve.
  // Shows a warning banner after correction.
  useEffect(() => {
    if (!register) return
    const isArchived =
      register.month_status === 'soft_closed' || register.month_status === 'hard_closed'
    if (!isArchived) return
    if (unclearedCount === 0) return
    // Corrupt state detected — auto-correct
    setWasCorrupted(true)
    updateRegister.mutate({ id: register.id, month_status: 'open', is_locked: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register?.id, register?.month_status, unclearedCount])

  // --- Stale soft_closed auto-correction ---
  // A soft_closed month whose next month is already soft/hard closed should be
  // hard_closed. This can happen if a month was re-closed after being unlocked
  // while its forward month had already been archived. Corrects on mount/data change.
  useEffect(() => {
    if (!register || !user) return
    if (register.month_status !== 'soft_closed') return
    if (
      nextMonthReg?.month_status !== 'soft_closed' &&
      nextMonthReg?.month_status !== 'hard_closed'
    ) return

    updateRegister.mutate({ id: register.id, month_status: 'hard_closed', last_closed_type: 'hard' })
    writeAuditEntry({
      user_id: user.id,
      account_id: account.id,
      register_id: register.id,
      action: 'month_hard_closed',
      field_changed: 'month_status',
      value_before: 'soft_closed',
      value_after: 'hard_closed',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register?.id, register?.month_status, nextMonthReg?.month_status])

  // --- Lock state ---
  // DB is the source of truth — handleUnlockConfirm writes is_locked=false directly.
  const isLocked = !!register?.is_locked
  const isSoftClosed = register?.month_status === 'soft_closed'
  const isHardClosed = register?.month_status === 'hard_closed'

  // --- Close & Archive ---
  async function doSoftClose(updateNextMonthOpening: boolean) {
    if (!register || !user || closingBalance == null) return
    setIsClosing(true)
    try {
      if (updateNextMonthOpening && nextMonthReg && !nextMonthReg.is_locked) {
        await updateRegister.mutateAsync({
          id: nextMonthReg.id,
          opening_balance: closingBalance,
          is_manual_opening: false,
        })
      }

      await updateRegister.mutateAsync({
        id: register.id,
        month_status: 'soft_closed',
        is_locked: true,
        last_closed_type: 'soft',
      })
      removeUnlockedRegister(register.id)

      await writeAuditEntry({
        user_id: user.id,
        account_id: account.id,
        register_id: register.id,
        action: 'month_soft_closed',
        field_changed: 'month_status',
        value_before: register.month_status,
        value_after: closingBalance.toFixed(2),
      })

      // Direction A: hard-close the prior month if it's also soft_closed
      // (prior month's "next" is now this newly soft_closed month)
      if (priorMonthReg?.month_status === 'soft_closed') {
        await updateRegister.mutateAsync({
          id: priorMonthReg.id,
          month_status: 'hard_closed',
          last_closed_type: 'hard',
        })
        await writeAuditEntry({
          user_id: user.id,
          account_id: account.id,
          register_id: priorMonthReg.id,
          action: 'month_hard_closed',
          field_changed: 'month_status',
          value_before: 'soft_closed',
          value_after: 'hard_closed',
        })
      }

      // Direction B: hard-close THIS month immediately if its next month is already
      // soft/hard closed (covers re-close-after-unlock scenarios where the forward
      // month was archived while this month was open for editing).
      if (
        nextMonthReg?.month_status === 'soft_closed' ||
        nextMonthReg?.month_status === 'hard_closed'
      ) {
        await updateRegister.mutateAsync({
          id: register.id,
          month_status: 'hard_closed',
          last_closed_type: 'hard',
        })
        await writeAuditEntry({
          user_id: user.id,
          account_id: account.id,
          register_id: register.id,
          action: 'month_hard_closed',
          field_changed: 'month_status',
          value_before: 'soft_closed',
          value_after: 'hard_closed',
        })
      }
    } finally {
      setIsClosing(false)
    }
  }

  // --- Mismatch prompt: Use this month's cleared balance ---
  async function handleMismatchUseClosing() {
    if (!nextMonthReg || !user) return

    // Block update if next month is archived — show inline message, keep prompt open.
    if (
      nextMonthReg.month_status === 'soft_closed' ||
      nextMonthReg.month_status === 'hard_closed'
    ) {
      setMismatchArchivedBlocked(true)
      return
    }

    setMismatchArchivedBlocked(false)
    const oldOpening = nextMonthReg.opening_balance
    await updateRegister.mutateAsync({
      id: nextMonthReg.id,
      opening_balance: lastClearedBalance,
      is_manual_opening: false,
    })
    await writeAuditEntry({
      user_id: user.id,
      account_id: account.id,
      register_id: nextMonthReg.id,
      action: 'opening_balance_updated',
      field_changed: 'opening_balance',
      value_before: String(oldOpening),
      value_after: String(lastClearedBalance),
    })
    // Prompt is computed — dismiss by recording the balance at which user acted.
    // After the mutate resolves, opening_balance will equal lastClearedBalance so
    // the prompt naturally returns false anyway; this is a belt-and-suspenders guard.
    dismissedForBalanceRef.current = lastClearedBalance
  }

  // --- Mismatch prompt: Keep next month's manually-entered opening ---
  // Persists acknowledgment to DB so prompt stays suppressed across navigation.
  // Re-arms automatically if April's opening or March's closing balance changes later.
  async function handleMismatchKeepOpening(reason: string) {
    if (!nextMonthReg || !user) return
    await writeAuditEntry({
      user_id: user.id,
      account_id: account.id,
      register_id: nextMonthReg.id,
      action: 'opening_balance_mismatch_kept',
      field_changed: 'opening_balance',
      value_before: String(lastClearedBalance),
      value_after: String(nextMonthReg.opening_balance),
      reason,
    })
    // Dismiss for this balance value; re-arms if lastClearedBalance changes.
    dismissedForBalanceRef.current = lastClearedBalance
  }

  // --- Close unhappy path: Use this month's closing balance for next month's opening ---
  // Resolves the discrepancy only — does NOT archive. User still clicks "Close & Archive".
  async function handleCloseUnhappyUseClosing() {
    if (!nextMonthReg || !user || closingBalance == null) return
    const oldOpening = nextMonthReg.opening_balance
    await updateRegister.mutateAsync({
      id: nextMonthReg.id,
      opening_balance: closingBalance,
      is_manual_opening: false,
    })
    await writeAuditEntry({
      user_id: user.id,
      account_id: account.id,
      register_id: nextMonthReg.id,
      action: 'opening_balance_updated',
      field_changed: 'opening_balance',
      value_before: String(oldOpening),
      value_after: String(closingBalance),
    })
    // isHappyClose will become true naturally once nextMonthReg.opening_balance updates
  }

  // --- Close unhappy path: Keep next month's opening balance (with required reason) ---
  // Records acknowledgement only — does NOT archive. User still clicks "Close & Archive".
  // Also persists acknowledgment to DB so the mismatch prompt stays suppressed if
  // user navigates away before clicking "Close & Archive".
  async function handleCloseUnhappyKeepOpening(reason: string) {
    if (!nextMonthReg || !user || closingBalance == null) return
    await writeAuditEntry({
      user_id: user.id,
      account_id: account.id,
      register_id: nextMonthReg.id,
      action: 'opening_balance_mismatch_kept',
      field_changed: 'opening_balance',
      value_before: String(closingBalance),
      value_after: String(nextMonthReg.opening_balance),
      reason,
    })
    setCloseKeepAcknowledged(true)
    // isHappyClose becomes true via closeKeepAcknowledged; doSoftClose(false) skips
    // updating next month's opening (user explicitly chose to keep it as-is).
  }

  // --- Unlock confirmation (hard_closed or generic locked) ---
  // Writes is_locked=false (and month_status='open' for archived months) directly to
  // the DB so the editing banner is driven by data, not session state.
  async function handleUnlockConfirm() {
    if (!register || !user) return
    setShowUnlockDialog(false)
    const isArchived =
      register.month_status === 'hard_closed' || register.month_status === 'soft_closed'
    await updateRegister.mutateAsync({
      id: register.id,
      is_locked: false,
      ...(isArchived ? { month_status: 'open' } : {}),
    })
    await writeAuditEntry({
      user_id: user.id,
      account_id: account.id,
      register_id: register.id,
      action: 'unlocked',
      field_changed: 'is_locked',
      value_before: 'true',
      value_after: 'false',
    })
  }

  // --- Re-lock (session-unlocked months only) ---
  // Validates that all non-void transactions are cleared before allowing re-lock.
  async function handleRelock() {
    if (!register || !user) return
    if (unclearedCount > 0) {
      setRelockError(
        'Cannot re-lock while uncleared transactions exist. Please clear or void all transactions before re-locking.',
      )
      return
    }
    setRelockError(null)
    removeUnlockedRegister(register.id)
    // Previously-closed months return to soft_closed; the stale soft_closed correction
    // effect will immediately promote to hard_closed if the next month is already archived.
    await updateRegister.mutateAsync({
      id: register.id,
      is_locked: true,
      ...(register.last_closed_type !== null ? { month_status: 'soft_closed' } : {}),
    })
    await writeAuditEntry({
      user_id: user.id,
      account_id: account.id,
      register_id: register.id,
      action: 're-locked',
      field_changed: 'is_locked',
      value_before: 'false',
      value_after: 'true',
    })
  }

  // --- Reopen (soft_closed only — no confirmation, no audit) ---
  async function handleReopen() {
    if (!register) return
    await updateRegister.mutateAsync({
      id: register.id,
      month_status: 'open',
      is_locked: false,
    })
    removeUnlockedRegister(register.id)
  }

  // --- Month navigation ---
  // Do NOT clear unlock state here — it is keyed by register ID in the session store,
  // so unlocking March does not affect April and survives navigation back to March.
  function handleNavigate(month: number) {
    setActiveMonth(month)
  }
  function handleYearChange(delta: number) {
    setActiveYear((y) => y + delta)
  }

  // --- Register initialization ---
  async function handleInitRegister(openingBalance: number) {
    if (!account.id) return
    await createRegister.mutateAsync({
      account_id: account.id,
      month: activeMonth,
      year: activeYear,
      opening_balance: openingBalance,
      is_manual_opening: true,
    })
  }

  // Bank balance update removed — current_bank_bal / available_bank_bal are
  // reserved for Phase 3 bank sync and not written from the UI in Phase 1.

  // --- AI Reconciliation session — SPEC §13 §14 ---

  async function handleReconcileClick() {
    if (!register || !user) return
    setIsReconciling(true)
    setReconcileError(null)

    await writeAuditEntry({
      user_id: user.id,
      account_id: account.id,
      register_id: register.id,
      action: 'reconciliation_session_started',
    })

    try {
      const context = buildReconciliationContext(
        register,
        account.nickname,
        transactions,
        new Date(),
      )
      const result = await runReconciliationSession(context)
      setReconciliationResult(result)
      setShowReconciliationPanel(true)
    } catch (err) {
      const msg =
        err instanceof ReconciliationParseError
          ? 'Unable to parse AI response. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Unknown error. Please try again.'
      setReconcileError(msg)
    } finally {
      setIsReconciling(false)
    }
  }

  const handleAcceptSuggestion = useCallback(
    async (suggestion: ReconciliationSuggestion) => {
      if (!register || !user) return
      if (suggestion.suggested_status && suggestion.transaction_id) {
        const tx = transactions.find((t) => t.id === suggestion.transaction_id)
        if (tx) {
          await updateTransactionStatus.mutateAsync({
            id: tx.id,
            register_id: register.id,
            status: suggestion.suggested_status,
          })
          await writeAuditEntry({
            user_id: user.id,
            account_id: account.id,
            register_id: register.id,
            transaction_id: tx.id,
            action: 'ai_suggestion_accepted',
            field_changed: 'status',
            value_before: tx.status,
            value_after: suggestion.suggested_status,
            reason: suggestion.reasoning,
          })
        }
      }
      // No-op accept for informational / no-status suggestions
    },
    [register, user, account.id, transactions, updateTransactionStatus],
  )

  const handleIgnoreSuggestion = useCallback(
    async (suggestion: ReconciliationSuggestion) => {
      if (!register || !user) return
      await writeAuditEntry({
        user_id: user.id,
        account_id: account.id,
        register_id: register.id,
        transaction_id: suggestion.transaction_id ?? undefined,
        action: 'ai_suggestion_ignored',
        reason: `${suggestion.id}: ${suggestion.type}`,
      })
    },
    [register, user, account.id],
  )

  const handleCloseReconciliationPanel = useCallback(
    async (stats: { accepted: number; ignored: number }) => {
      if (register && user) {
        await writeAuditEntry({
          user_id: user.id,
          account_id: account.id,
          register_id: register.id,
          action: 'reconciliation_session_completed',
          value_after: JSON.stringify({
            accepted: stats.accepted,
            ignored: stats.ignored,
            status: reconciliationResult?.summary.status ?? 'unknown',
          }),
        })
      }
      setShowReconciliationPanel(false)
      setReconciliationResult(null)
    },
    [register, user, account.id, reconciliationResult],
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
      if (
        !window.confirm(
          'Mark this transaction as void? It will be excluded from all calculations.',
        )
      )
        return
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
      // Mark as manually entered so the auto-update carry-forward effect
      // does not silently overwrite this value. SPEC §2: nothing changes silently.
      updateRegister.mutate({ id: register.id, opening_balance: newBalance, is_manual_opening: true })
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

  const nextMonthLabel =
    nm.month === 1 ? `${MONTH_NAMES[0]} ${nm.year}` : MONTH_NAMES[nm.month - 1]

  const showClosePrompt =
    register.month_status === 'ready_to_close' &&
    !closePromptDismissed &&
    register.last_closed_type !== 'hard'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <RegisterHeader
        balances={balances!}
        accountNickname={account.nickname}
        monthLabel={monthLabel}
        isLocked={isLocked}
        monthStatus={register.month_status}
        isReconciling={isReconciling}
        reconcileError={reconcileError}
        onReconcileClick={handleReconcileClick}
      />

      {/* Informational carry-forward line — visible while open/ready with pending txns */}
      {(register.month_status === 'open' || register.month_status === 'ready_to_close') &&
        pendingCount > 0 &&
        nextMonthReg && (
          <div className="px-4 py-1.5 bg-slate-800 border-b border-slate-700 text-xs text-slate-400">
            Opening balance reflects {MONTH_NAMES[activeMonth - 1]}'s last cleared transaction.{' '}
            <span className="text-slate-300 font-medium">{pendingCount}</span>{' '}
            {pendingCount === 1 ? 'transaction' : 'transactions'} still pending in{' '}
            {MONTH_NAMES[activeMonth - 1]}.
          </div>
        )}

      {/* Archived next month warning — carry-forward is blocked because next month
          is soft/hard closed. Derived from data so it survives navigation. */}
      {nextMonthIsArchived && nextMonthReg && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-300 text-sm text-amber-800">
          ⚠️ {nextMonthLabel} is archived. Changes to{' '}
          {MONTH_NAMES[activeMonth - 1]}'s closing balance will not automatically update{' '}
          {nextMonthLabel}'s opening balance until it is reopened. Reopen {nextMonthLabel} to
          apply the updated balance.
        </div>
      )}

      {/* Mismatch prompt — fires when next month has a manually-entered opening that
          differs from this month's last cleared balance. Shown only in 'open' state
          so it doesn't compete with the ready-to-close prompt. */}
      {showMismatchPrompt && nextMonthReg && (
        <MismatchPrompt
          monthLabel={MONTH_NAMES[activeMonth - 1]}
          nextMonthLabel={nextMonthLabel}
          lastClearedBalance={lastClearedBalance}
          nextOpeningBalance={nextMonthReg.opening_balance}
          onUseCleared={handleMismatchUseClosing}
          onKeepOpening={handleMismatchKeepOpening}
          archivedBlocked={mismatchArchivedBlocked}
        />
      )}

      {/* Ready-to-close prompt */}
      {showClosePrompt &&
        (isHappyClose ? (
          <ClosePromptHappy
            monthLabel={MONTH_NAMES[activeMonth - 1]}
            nextMonthLabel={nextMonthLabel}
            closingBalance={closingBalance!}
            hasNextMonth={nextMonthReg != null}
            isClosing={isClosing}
            onClose={() => doSoftClose(!closeKeepAcknowledged)}
            onDismiss={() => setClosePromptDismissed(true)}
          />
        ) : (
          <ClosePromptUnhappy
            monthLabel={MONTH_NAMES[activeMonth - 1]}
            nextMonthLabel={nextMonthLabel}
            closingBalance={closingBalance!}
            nextOpeningBalance={nextMonthReg!.opening_balance}
            onUseClosing={handleCloseUnhappyUseClosing}
            onKeepOpening={handleCloseUnhappyKeepOpening}
          />
        ))}

      {/* Editing-closed-register indicator — shown whenever a previously-closed month
          is open for editing. Driven purely by DB state so it survives navigation and
          manual DB corrections. Always rendered before other status bars so Re-lock
          is never hidden behind mismatch or close prompts. */}
      {register.month_status === 'open' &&
        register.is_locked === false &&
        register.last_closed_type === 'hard' && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-sm text-amber-700">
              ⚠️ Editing a closed register. All changes are logged.
            </span>
            <button
              onClick={handleRelock}
              className="px-3 py-1 text-xs bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 text-amber-800"
            >
              {'Relock Register'}
            </button>
          </div>
          {relockError && (
            <p className="text-xs text-red-600">{relockError}</p>
          )}
        </div>
      )}

      {/* Corrupt state warning — shown after auto-correction of archived+uncleared state */}
      {wasCorrupted && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-300 flex items-center gap-3">
          <span className="text-sm text-red-700">
            ⚠️ This register was re-opened because it contained uncleared transactions.
            Please resolve all transactions before closing again.
          </span>
        </div>
      )}

      {/* Soft-closed: Reopen button */}
      {isSoftClosed && !isSessionUnlocked && (
        <div className="px-4 py-2 bg-blue-950 border-b border-blue-800 flex items-center gap-3">
          <span className="text-sm text-blue-300">
            📦 {MONTH_NAMES[activeMonth - 1]} is archived — read-only.
          </span>
          <button
            onClick={handleReopen}
            className="px-3 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-600"
          >
            Reopen {MONTH_NAMES[activeMonth - 1]}
          </button>
        </div>
      )}

      {/* Hard-closed: Archived indicator */}
      {isHardClosed && !isSessionUnlocked && (
        <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 flex items-center gap-3">
          <span className="text-sm text-slate-400">
            🔒 Archived — permanently closed.
          </span>
          <button
            onClick={() => setShowUnlockDialog(true)}
            className="px-3 py-1 text-xs bg-white border border-slate-400 rounded hover:bg-slate-50 text-slate-700"
          >
            Unlock to Edit
          </button>
        </div>
      )}

      {/* Generic locked indicator (manually locked past months, not via status machine) */}
      {isLocked && !isSoftClosed && !isHardClosed && (
        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-3">
          <span className="text-sm text-slate-600">
            🔒 This register is closed — all entries are read-only.
          </span>
          <button
            onClick={() => setShowUnlockDialog(true)}
            className="px-3 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
          >
            Unlock to Edit
          </button>
        </div>
      )}

      {/* Unlock confirmation dialog (for hard_closed or generic locked) */}
      {showUnlockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h2 className="text-base font-semibold text-slate-800 mb-2">
              Unlock Closed Register?
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              You are about to edit a closed register. All changes will be logged with a
              timestamp. Continue?
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

      {/* Month navigation */}
      <MonthNav
        activeMonth={activeMonth}
        activeYear={activeYear}
        currentMonth={now.getMonth() + 1}
        currentYear={now.getFullYear()}
        onNavigate={handleNavigate}
        onYearChange={handleYearChange}
      />

      {/* AI Reconciliation panel — slide-in from right */}
      {showReconciliationPanel && reconciliationResult && balances && (
        <ReconciliationPanel
          monthLabel={monthLabel}
          accountNickname={account.nickname}
          result={reconciliationResult}
          transactions={transactions}
          gap={balances.gap}
          onAccept={handleAcceptSuggestion}
          onIgnore={handleIgnoreSuggestion}
          onClose={handleCloseReconciliationPanel}
        />
      )}
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

// ============================================================
// MismatchPrompt — fires during 'open' state when next month's
// opening balance was manually entered and differs from this
// month's last cleared running balance.
// SPEC §2: nothing changes without user knowledge.
// ============================================================

interface MismatchPromptProps {
  monthLabel: string
  nextMonthLabel: string
  lastClearedBalance: number
  nextOpeningBalance: number
  onUseCleared: () => void
  onKeepOpening: (reason: string) => void
  archivedBlocked?: boolean
}

function MismatchPrompt({
  monthLabel,
  nextMonthLabel,
  lastClearedBalance,
  nextOpeningBalance,
  onUseCleared,
  onKeepOpening,
  archivedBlocked,
}: MismatchPromptProps) {
  const [explainVisible, setExplainVisible] = useState(false)
  const [keepReason, setKeepReason] = useState('')
  const diff = Math.abs(lastClearedBalance - nextOpeningBalance)

  return (
    <div className="mx-4 my-2 bg-amber-50 border border-amber-300 rounded-lg p-4 shadow-sm">
      <p className="text-sm text-amber-800 mb-1">
        <span className="font-semibold">⚠️ Opening balance mismatch</span>
      </p>
      <p className="text-sm text-amber-700 mb-3">
        {monthLabel}'s last cleared balance is{' '}
        <span className="font-semibold tabular-nums">{formatCurrency(lastClearedBalance)}</span>,
        but {nextMonthLabel}'s opening balance (manually entered) is{' '}
        <span className="font-semibold tabular-nums">{formatCurrency(nextOpeningBalance)}</span> —
        a <span className="font-semibold tabular-nums">{formatCurrency(diff)}</span> difference.
      </p>
      {archivedBlocked && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-2">
          {nextMonthLabel} is archived and cannot be updated. Reopen {nextMonthLabel} first,
          then apply this change.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <button
          onClick={onUseCleared}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-left"
        >
          Use {monthLabel}'s closing balance — {formatCurrency(lastClearedBalance)}
        </button>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onKeepOpening(keepReason.trim())}
            disabled={!keepReason.trim()}
            className="px-4 py-2 text-sm bg-white border border-amber-400 text-amber-800 rounded hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Keep {nextMonthLabel}'s opening balance — {formatCurrency(nextOpeningBalance)}
          </button>
          <label className="text-xs font-medium text-amber-800 mt-1">
            Reason for keeping {nextMonthLabel}'s opening balance (required)
          </label>
          <textarea
            value={keepReason}
            onChange={(e) => setKeepReason(e.target.value)}
            placeholder="Explain why the opening balance differs…"
            rows={2}
            className="w-full text-sm border border-amber-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:border-amber-500 resize-none"
          />
        </div>
        <button
          onClick={() => setExplainVisible((v) => !v)}
          className="px-4 py-2 text-sm bg-white border border-slate-200 text-slate-500 rounded hover:bg-slate-50 text-left"
        >
          Explain the difference
        </button>
        {explainVisible && (
          <p className="text-xs text-slate-500 px-1">
            AI gap explanation is coming in Phase 2. For now: the difference of{' '}
            {formatCurrency(diff)} is the gap between {monthLabel}'s running balance at the last
            cleared transaction and the opening balance you manually set for {nextMonthLabel}.
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================
// ClosePromptHappy — fired once when all transactions cleared
// and closing balance already matches next month opening.
// ============================================================

interface ClosePromptHappyProps {
  monthLabel: string
  nextMonthLabel: string
  closingBalance: number
  hasNextMonth: boolean
  isClosing: boolean
  onClose: () => void
  onDismiss: () => void
}

function ClosePromptHappy({
  monthLabel,
  nextMonthLabel,
  closingBalance,
  hasNextMonth,
  isClosing,
  onClose,
  onDismiss,
}: ClosePromptHappyProps) {
  return (
    <div className="mx-4 my-2 bg-green-50 border border-green-200 rounded-lg p-4 shadow-sm">
      <p className="text-sm text-green-800 mb-1">
        <span className="font-semibold">✅ All {monthLabel} transactions are cleared.</span>
      </p>
      <p className="text-sm text-green-700 mb-0.5">
        {monthLabel}'s final balance is{' '}
        <span className="font-semibold tabular-nums">{formatCurrency(closingBalance)}</span>.
      </p>
      {hasNextMonth && (
        <p className="text-sm text-green-700 mb-3">
          {nextMonthLabel}'s opening balance is already up to date.
        </p>
      )}
      <p className="text-sm font-medium text-green-800 mb-3">
        Ready to close {monthLabel}?
      </p>
      <div className="flex gap-2">
        <button
          onClick={onDismiss}
          disabled={isClosing}
          className="px-4 py-1.5 text-sm bg-white border border-green-300 text-green-700 rounded hover:bg-green-50 disabled:opacity-50"
        >
          Not Yet
        </button>
        <button
          onClick={onClose}
          disabled={isClosing}
          className="px-4 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50 font-medium"
        >
          {isClosing ? 'Archiving…' : `Close & Archive ${monthLabel}`}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// ClosePromptUnhappy — balance discrepancy between closing
// and next month's opening.
// ============================================================

interface ClosePromptUnhappyProps {
  monthLabel: string
  nextMonthLabel: string
  closingBalance: number
  nextOpeningBalance: number
  onUseClosing: () => void
  onKeepOpening: (reason: string) => void
}

function ClosePromptUnhappy({
  monthLabel,
  nextMonthLabel,
  closingBalance,
  nextOpeningBalance,
  onUseClosing,
  onKeepOpening,
}: ClosePromptUnhappyProps) {
  const [keepReason, setKeepReason] = useState('')
  const diff = Math.abs(closingBalance - nextOpeningBalance)

  return (
    <div className="mx-4 my-2 bg-amber-50 border border-amber-300 rounded-lg p-4 shadow-sm">
      <p className="text-sm text-amber-800 mb-2">
        All {monthLabel} transactions are cleared, but there's a{' '}
        <span className="font-semibold tabular-nums">{formatCurrency(diff)}</span> difference
        between {monthLabel}'s closing balance (
        <span className="font-semibold tabular-nums">{formatCurrency(closingBalance)}</span>) and{' '}
        {nextMonthLabel}'s current opening balance (
        <span className="font-semibold tabular-nums">{formatCurrency(nextOpeningBalance)}</span>).
        Resolve the discrepancy before archiving.
      </p>
      <div className="flex flex-col gap-2 mt-3">
        <button
          onClick={onUseClosing}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-left"
        >
          Use {monthLabel}'s closing balance — {formatCurrency(closingBalance)}
        </button>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-amber-800">
            Reason for keeping {nextMonthLabel}'s opening balance (required)
          </label>
          <textarea
            value={keepReason}
            onChange={(e) => setKeepReason(e.target.value)}
            placeholder="Explain why the opening balance differs…"
            rows={2}
            className="w-full text-sm border border-amber-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:border-amber-500 resize-none"
          />
          <button
            onClick={() => onKeepOpening(keepReason.trim())}
            disabled={!keepReason.trim()}
            className="px-4 py-2 text-sm bg-white border border-amber-400 text-amber-800 rounded hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Keep {nextMonthLabel}'s opening balance — {formatCurrency(nextOpeningBalance)}
          </button>
        </div>
        <button
          disabled
          className="px-4 py-2 text-sm bg-white border border-slate-200 text-slate-400 rounded cursor-not-allowed text-left"
          title="AI gap explanation — coming in Phase 2"
        >
          Explain the difference
        </button>
      </div>
    </div>
  )
}
