// ============================================================
// useRegister — fetch/create register for a given account+month+year
// ============================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DbRegister } from '@/types'

export function useRegister(accountId: string | null, month: number, year: number) {
  return useQuery({
    queryKey: ['register', accountId, month, year],
    enabled: !!accountId,
    queryFn: async (): Promise<DbRegister | null> => {
      if (!accountId) return null
      const { data, error } = await supabase
        .from('registers')
        .select('*')
        .eq('account_id', accountId)
        .eq('month', month)
        .eq('year', year)
        .maybeSingle()
      if (error) throw error
      return data as DbRegister | null
    },
  })
}

/**
 * Most recent existing register strictly before (month, year) for an account.
 * SPEC §11 auto-carry source: "the most recent existing register in the past,
 * not necessarily the immediately prior calendar month. Gaps are allowed."
 */
export function useMostRecentRegisterBefore(
  accountId: string | null,
  month: number,
  year: number,
) {
  return useQuery({
    queryKey: ['register-before', accountId, month, year],
    enabled: !!accountId,
    queryFn: async (): Promise<DbRegister | null> => {
      if (!accountId) return null
      const { data, error } = await supabase
        .from('registers')
        .select('*')
        .eq('account_id', accountId)
        .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as DbRegister | null
    },
  })
}

export function useCreateRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      account_id: string
      month: number
      year: number
      opening_balance: number
      is_locked?: boolean
      is_manual_opening?: boolean
    }): Promise<DbRegister> => {
      const { data, error } = await supabase
        .from('registers')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as DbRegister
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['register', data.account_id, data.month, data.year],
      })
      // A newly created register may now be the "most recent prior" for any
      // later month — invalidate all auto-carry source lookups for the account.
      queryClient.invalidateQueries({
        queryKey: ['register-before', data.account_id],
      })
    },
  })
}

export function useUpdateRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<DbRegister> & { id: string }): Promise<DbRegister> => {
      const { data, error } = await supabase
        .from('registers')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as DbRegister
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['register', data.account_id, data.month, data.year],
      })
    },
  })
}
