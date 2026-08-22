// ============================================================
// e2e/fixtures/supabase-admin.ts — service_role client used for seeding.
//
// RLS is enabled on all five tables (users, accounts, registers,
// transactions, audit_log), so seeding cannot go through the anon key.
// Everything this suite writes goes through THIS client and no other —
// which is also what preserves the third data-safety guard: seeded users
// exist only in the local database, so if the browser were ever somehow
// pointed at the cloud project, UI sign-in would fail because the user
// does not exist there.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

/**
 * Service-role client. Session persistence and auto-refresh are disabled:
 * this is a short-lived Node client, and a persisted session would bleed
 * between tests running in the same worker process.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
)

/**
 * An in-memory stand-in for the browser's localStorage, used to capture the
 * exact key/value pair supabase-js persists for a session.
 */
export class MemoryStorage {
  readonly entries = new Map<string, string>()
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value)
  }
  removeItem(key: string): void {
    this.entries.delete(key)
  }
}

/**
 * A fresh anon-key client, used only to exchange seeded credentials for a real
 * session (see seed.ts). Each call returns a NEW client so two tests in the
 * same worker can never share auth state.
 *
 * Passing a MemoryStorage turns on session persistence against that store,
 * which lets us capture byte-for-byte what the library would have written to
 * the browser's localStorage — instead of hand-rolling the payload and the
 * storage key, both of which are supabase-js implementation details.
 */
export function createAnonClient(storage?: MemoryStorage): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: Boolean(storage),
      autoRefreshToken: false,
      detectSessionInUrl: false,
      ...(storage ? { storage } : {}),
    },
  })
}
