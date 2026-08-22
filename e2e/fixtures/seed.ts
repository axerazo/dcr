// ============================================================
// e2e/fixtures/seed.ts — per-test data isolation (TEST_PLAN §2).
//
// Every test that declares the `seed` fixture gets its own auth user, its own
// account, and its own current-month register. Nothing is shared, so tests
// cannot couple through data and `fullyParallel` stays safe by construction.
//
// The fixture also re-points the browser at the per-test user — see the long
// comment in e2e/setup/auth.setup.ts for why storageState alone is not enough.
// ============================================================

import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import { MemoryStorage, createAnonClient, supabaseAdmin } from './supabase-admin'

/** Password used for every seeded user. Local Supabase requires >= 6 chars. */
export const SEED_PASSWORD = 'dcr-e2e-password'

/** Statuses allowed by the transactions.status CHECK constraint (migration 001). */
export type SeedTransactionStatus =
  | 'recorded'
  | 'scheduled'
  | 'in_flight'
  | 'pending'
  | 'cleared'
  | 'void'

/** One transaction to insert. debit and credit are mutually exclusive (DB-enforced). */
export interface SeedTransactionInput {
  /** ISO date string, e.g. '2026-08-14'. Stored as DATE — no timezone shifting. */
  date: string
  description: string
  debit?: number
  credit?: number
  status?: SeedTransactionStatus
  checkNumber?: number
  notes?: string
  /** ISO date string; drives in-flight detection. */
  scheduledDate?: string
  /** Display order within the register. Defaults to array position (1-based). */
  rowOrder?: number
}

export interface SeededTransaction {
  id: string
  rowOrder: number
}

export interface CreateRegisterInput {
  month: number
  year: number
  openingBalance: number
  /** true = user typed the opening balance; false = carried forward. Default false. */
  isManualOpening?: boolean
  monthStatus?: 'open' | 'ready_to_close' | 'soft_closed' | 'hard_closed'
  isLocked?: boolean
}

/** Everything a journey spec needs to know about its isolated fixture data. */
export interface SeededAccount {
  userId: string
  email: string
  password: string
  accountId: string
  accountNickname: string
  /** The current-month register the user lands on after sign-in. */
  registerId: string
  month: number
  year: number
  openingBalance: number
  /**
   * Insert transactions straight into the seeded register, bypassing the UI.
   * For journeys whose *precondition* is pre-existing rows (CUJ-03 voids a
   * transaction that must already exist), not for journeys whose subject is
   * the write path itself (CUJ-02 creates its rows through the UI).
   * Returns the created ids in input order.
   */
  insertTransactions: (rows: SeedTransactionInput[]) => Promise<SeededTransaction[]>
  /** Create an additional register on the same account (e.g. next month). */
  createRegister: (input: CreateRegisterInput) => Promise<string>
}

/** Local-time current month/year. Never derive these from UTC — see CLAUDE.md rule 6. */
function currentMonthYear(): { month: number; year: number } {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

/**
 * Create an auth user that is immediately usable.
 *
 * email_confirm: true matches supabase/config.toml's enable_confirmations =
 * false; setting it explicitly means the fixture keeps working if that config
 * ever tightens. The on_auth_user_created trigger (migration 001) inserts the
 * matching public.users row, so we never insert it ourselves.
 */
async function createSeedUser(): Promise<{ userId: string; email: string }> {
  const email = `dcr-e2e-${randomUUID()}@example.test`
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`[e2e/seed] Failed to create auth user ${email}: ${error?.message}`)
  }
  return { userId: data.user.id, email }
}

/**
 * Seed one account plus one current-month register for userId.
 *
 * Column values below are dictated by migration 001's NOT NULL and CHECK
 * constraints: nickname 1-50 chars, account_type in (checking, savings),
 * routing_number and account_number NOT NULL (the app AES-encrypts these at
 * the application layer, so any opaque string is schema-valid here).
 */
async function createSeedAccount(userId: string): Promise<{
  accountId: string
  accountNickname: string
  registerId: string
  month: number
  year: number
  openingBalance: number
}> {
  const accountNickname = `E2E Checking ${randomUUID().slice(0, 8)}`

  const { data: account, error: accountError } = await supabaseAdmin
    .from('accounts')
    .insert({
      user_id: userId,
      nickname: accountNickname,
      bank_name: 'E2E Test Bank',
      account_type: 'checking',
      routing_number: 'e2e-encrypted-routing',
      account_number: 'e2e-encrypted-account',
      is_active: true,
    })
    .select('id')
    .single()
  if (accountError || !account) {
    throw new Error(`[e2e/seed] Failed to create account: ${accountError?.message}`)
  }

  const { month, year } = currentMonthYear()
  const openingBalance = 1000

  const { data: register, error: registerError } = await supabaseAdmin
    .from('registers')
    .insert({
      account_id: account.id,
      month,
      year,
      opening_balance: openingBalance,
      // false = carried forward, not user-typed. Keeping this false keeps the
      // Initialize form (CUJ-10) and the mismatch prompt (CUJ-08) out of the
      // way of journeys that are not about them.
      is_manual_opening: false,
      month_status: 'open',
      is_locked: false,
    })
    .select('id')
    .single()
  if (registerError || !register) {
    throw new Error(`[e2e/seed] Failed to create register: ${registerError?.message}`)
  }

  return {
    accountId: account.id as string,
    accountNickname,
    registerId: register.id as string,
    month,
    year,
    openingBalance,
  }
}

/**
 * Sign the seeded user in from Node and hand the browser context the resulting
 * session, so the page boots authenticated as *this test's* user.
 *
 * The payload and its localStorage key are captured from supabase-js itself
 * (MemoryStorage records what the library persists) rather than reconstructed
 * here — the storage key format and the session envelope are library internals.
 *
 * addInitScript runs at document start on every navigation in this context,
 * after Playwright has restored the project-level storageState, so the
 * per-test session deterministically wins. Caveat worth knowing: a test that
 * signs out and then reloads comes back signed in as this user.
 */
async function authenticateContextAs(
  context: BrowserContext,
  email: string,
  password: string,
): Promise<void> {
  const storage = new MemoryStorage()
  const anon = createAnonClient(storage)
  const { error } = await anon.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`[e2e/seed] Seeded user ${email} could not sign in: ${error.message}`)
  }

  const entries = [...storage.entries.entries()]
  if (entries.length === 0) {
    throw new Error(
      `[e2e/seed] supabase-js persisted no session for ${email}. ` +
        'The auth storage contract may have changed in @supabase/supabase-js.',
    )
  }

  await context.addInitScript((persisted: [string, string][]) => {
    for (const [key, value] of persisted) window.localStorage.setItem(key, value)
  }, entries)
}

/**
 * Best-effort teardown.
 *
 * Deleting the auth user cascades: auth.users → public.users → accounts →
 * registers → transactions are all ON DELETE CASCADE (verified against
 * pg_constraint; see migration 001). audit_log is the exception — all four of
 * its FKs are NO ACTION *and* an append-only trigger rejects DELETE outright —
 * so once a journey writes an audit row, that user's data cannot be removed at
 * all. That is a deliberate product invariant (SPEC §12 / CLAUDE.md rule 5),
 * not something to work around here.
 *
 * Never throws: a teardown failure must not mask or invent a test failure.
 */
async function teardown(userId: string, email: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (!error) return

    if (/audit_log/i.test(error.message)) {
      console.warn(
        `[e2e/seed] Left ${email} (${userId}) in the local database: audit_log rows ` +
          'reference it and audit_log is append-only, so the cascade cannot run. ' +
          'Expected for journeys that void/edit/close. Run `supabase db reset` to clear ' +
          'accumulated E2E users locally; CI always starts from a fresh stack.',
      )
      return
    }

    console.warn(`[e2e/seed] Teardown of ${email} (${userId}) failed: ${error.message}`)
  } catch (err) {
    console.warn(`[e2e/seed] Teardown of ${email} (${userId}) threw: ${(err as Error).message}`)
  }
}

export interface SeedFixtures {
  seed: SeededAccount
}

export const test = base.extend<SeedFixtures>({
  seed: async ({ context }, use) => {
    const { userId, email } = await createSeedUser()

    // If setup fails after the user exists, tear it down before rethrowing —
    // fixture teardown only runs once use() has been reached, so without this
    // a mid-setup failure leaks an auth user into the local database.
    let account: Awaited<ReturnType<typeof createSeedAccount>>
    try {
      account = await createSeedAccount(userId)
      await authenticateContextAs(context, email, SEED_PASSWORD)
    } catch (err) {
      await teardown(userId, email)
      throw err
    }

    const insertTransactions = async (
      rows: SeedTransactionInput[],
    ): Promise<SeededTransaction[]> => {
      if (rows.length === 0) return []
      const payload = rows.map((row, index) => ({
        register_id: account.registerId,
        row_order: row.rowOrder ?? index + 1,
        date: row.date,
        description: row.description,
        status: row.status ?? 'recorded',
        debit: row.debit ?? null,
        credit: row.credit ?? null,
        check_number: row.checkNumber ?? null,
        notes: row.notes ?? null,
        scheduled_date: row.scheduledDate ?? null,
      }))
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .insert(payload)
        .select('id, row_order')
      if (error || !data) {
        throw new Error(`[e2e/seed] Failed to insert transactions: ${error?.message}`)
      }
      // PostgREST returns inserted rows in input order.
      return data.map((row) => ({ id: row.id as string, rowOrder: row.row_order as number }))
    }

    const createRegister = async (input: CreateRegisterInput): Promise<string> => {
      const { data, error } = await supabaseAdmin
        .from('registers')
        .insert({
          account_id: account.accountId,
          month: input.month,
          year: input.year,
          opening_balance: input.openingBalance,
          is_manual_opening: input.isManualOpening ?? false,
          month_status: input.monthStatus ?? 'open',
          is_locked: input.isLocked ?? false,
        })
        .select('id')
        .single()
      if (error || !data) {
        throw new Error(
          `[e2e/seed] Failed to create register ${input.month}/${input.year}: ${error?.message}`,
        )
      }
      return data.id as string
    }

    await use({
      userId,
      email,
      password: SEED_PASSWORD,
      ...account,
      insertTransactions,
      createRegister,
    })

    await teardown(userId, email)
  },
})

export { expect }
