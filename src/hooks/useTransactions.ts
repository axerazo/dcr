/* eslint-disable @typescript-eslint/no-unused-vars */
// ============================================================
// useTransactions — CRUD for transactions within a register
// ============================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isInFlight } from '@/lib/balance'
import type { DbTransaction, TransactionStatus } from '@/types'

export function useTransactions(registerId: string | null | undefined) {
  return useQuery({
    queryKey: ['transactions', registerId],
    enabled: !!registerId,
    queryFn: async (): Promise<DbTransaction[]> => {
      if (!registerId) return []
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('register_id', registerId)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as DbTransaction[]
      // Normalize scheduled ↔ in_flight at read time.
      // deriveStatus only runs on writes, so DB rows can become stale after their
      // scheduled_date passes (or if a row was saved as in_flight for a date that
      // is today or in the future due to a prior bug). Correct both directions here.
      const normalized = rows.map((tx) => {
        // Void and cleared never participate in the scheduled/in-flight lifecycle.
        if (tx.status === 'void' || tx.status === 'cleared') return tx
        // scheduled_date is the single source of truth — no notes fallback.
        const effectiveDate = tx.scheduled_date
        if (!effectiveDate) return tx
        const inFlight = isInFlight(effectiveDate)
        // Promote to in_flight when scheduled date has passed.
        // Do NOT promote 'pending' — that means the user (or AI Accept) has already
        // acknowledged the payment is with the bank.
        if ((tx.status === 'scheduled' || tx.status === 'recorded') && inFlight) {
          return { ...tx, status: 'in_flight' as DbTransaction['status'] }
        }
        // Auto-restore: promote recorded → scheduled when scheduled_date is future.
        if (tx.status === 'recorded' && !inFlight) {
          return { ...tx, status: 'scheduled' as DbTransaction['status'] }
        }
        // Demote in_flight → scheduled if the scheduled date is today or in the future.
        if (tx.status === 'in_flight' && !inFlight) {
          return { ...tx, status: 'scheduled' as DbTransaction['status'] }
        }
        return tx
      })
      // Sort chronologically: date ascending, then created_at ascending for same-day ties.
      // Running balance is computed on this sorted order in computeRunningBalance().
      return normalized.sort((a, b) => {
        if (a.date < b.date) return -1
        if (a.date > b.date) return 1
        return a.created_at < b.created_at ? -1 : 1
      })
    },
  })
}

export function useAddTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
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
    }): Promise<DbTransaction> => {
      const scheduledDate = payload.scheduled_date ?? null
      let status: TransactionStatus = payload.status ?? 'recorded'
      if (scheduledDate) {
        status = isInFlight(scheduledDate) ? 'in_flight' : 'scheduled'
      }
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...payload, status, scheduled_date: scheduledDate })
        .select()
        .single()
      if (error) throw error
      return data as DbTransaction
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', data.register_id] })
    },
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      register_id,
      currentStatus,
      ...updates
    }: Partial<DbTransaction> & {
      id: string
      register_id: string
      currentStatus: TransactionStatus
    }): Promise<DbTransaction> => {
      let finalUpdates: Partial<DbTransaction> = { ...updates }
      // Derive status from scheduled_date changes — scheduled_date is the sole source of truth.
      if ('scheduled_date' in updates) {
        const scheduledDate = updates.scheduled_date ?? null
        if (
          currentStatus === 'recorded' ||
          currentStatus === 'scheduled' ||
          currentStatus === 'in_flight'
        ) {
          if (!scheduledDate) {
            // Date cleared — reset to recorded
            finalUpdates = { ...finalUpdates, status: 'recorded' }
          } else {
            finalUpdates = {
              ...finalUpdates,
              status: isInFlight(scheduledDate) ? 'in_flight' : 'scheduled',
            }
          }
        }
      }
      const { data, error } = await supabase
        .from('transactions')
        .update(finalUpdates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as DbTransaction
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', data.register_id] })
    },
  })
}

export function useUpdateTransactionStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      register_id: _register_id,
      status,
    }: {
      id: string
      register_id: string
      status: TransactionStatus
    }): Promise<DbTransaction> => {
      const { data, error } = await supabase
        .from('transactions')
        .update({ status })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as DbTransaction
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', data.register_id] })
    },
  })
}

export function useDeleteTransaction() {
  // Per SPEC: hard delete is never permitted.
  // "Delete" means void — exposed as a distinct mutation for clarity.
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      register_id: _register_id,
    }: {
      id: string
      register_id: string
    }): Promise<DbTransaction> => {
      const { data, error } = await supabase
        .from('transactions')
        .update({ status: 'void' })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as DbTransaction
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', data.register_id] })
    },
  })
}
