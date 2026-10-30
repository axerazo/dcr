-- ============================================================
-- Local seed: fixed manual QA user (issue #47)
--
-- Runs after migrations on every `supabase db reset` (including
-- `npm run test:e2e:clean`) and on a fresh `supabase start`
-- (config.toml [db.seed]). LOCAL ONLY: the password below is a
-- documented throwaway, never a real credential.
--
--   email:    qa-manual@example.test
--   password: dcr-qa-manual-local
--
-- One account, one register for month M = the month of the reset
-- (relative to the DB clock, UTC). M+1 is deliberately NOT seeded:
-- navigating to it in the app runs the real auto-carry (SPEC §11),
-- so its opening = M's closing balance (Formula C/E), $2,854.67.
--
-- All data is fabricated (CLAUDE.md Hard rule 3). No E2E spec may
-- depend on this user; E2E seeds its own users per test.
-- Layout and how to use it: docs/cheat-sheets/e2e-local-dev-cheatsheet.md §3.
-- ============================================================

DO $$
DECLARE
  qa_user_id  uuid := '00000000-0000-4000-8000-00000000a001';
  qa_email    text := 'qa-manual@example.test';
  account_id  uuid;
  register_id uuid;
  m_start     date := date_trunc('month', current_date)::date;
BEGIN
  -- Auth user, email already confirmed. The empty-string token columns
  -- matter: GoTrue fails to sign in a user whose token columns are NULL.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', qa_user_id, 'authenticated', 'authenticated',
    qa_email, extensions.crypt('dcr-qa-manual-local', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), qa_user_id, qa_user_id::text, 'email',
    jsonb_build_object('sub', qa_user_id::text, 'email', qa_email, 'email_verified', true),
    now(), now(), now()
  );
  -- public.users is filled by the on_auth_user_created trigger (migration 001).

  INSERT INTO public.accounts (
    user_id, nickname, bank_name, account_type, routing_number, account_number, is_active
  ) VALUES (
    -- routing/account numbers are AES-encrypted by the app; any opaque string is schema-valid.
    qa_user_id, 'QA Checking', 'QA Test Bank', 'checking',
    'qa-encrypted-routing', 'qa-encrypted-account', true
  ) RETURNING id INTO account_id;

  -- Month M: open, opening carried (not manually entered), so the
  -- carry-forward and mismatch-prompt checks start from a fresh state.
  INSERT INTO public.registers (
    account_id, month, year, opening_balance, is_manual_opening, month_status, is_locked
  ) VALUES (
    account_id, extract(month FROM m_start)::int, extract(year FROM m_start)::int,
    2500.00, false, 'open', false
  ) RETURNING id INTO register_id;

  -- One row per lifecycle state that can be stored. Scheduled dates sit
  -- two days either side of today: the app derives scheduled vs in-flight
  -- from the browser's local date, and the DB clock is UTC.
  INSERT INTO public.transactions
    (register_id, row_order, check_number, date, description, status, debit, credit, scheduled_date)
  VALUES
    (register_id, 1, NULL, m_start + 0, 'Paycheck',         'cleared',   NULL,    1800.00, NULL),
    (register_id, 2, 1041, m_start + 1, 'Rent',             'cleared',   1200.00, NULL,    NULL),
    (register_id, 3, NULL, m_start + 2, 'Grocery store',    'pending',   86.42,   NULL,    NULL),
    (register_id, 4, NULL, m_start + 3, 'Electric bill',    'in_flight', 94.17,   NULL,    current_date - 2),
    (register_id, 5, NULL, m_start + 4, 'Internet service', 'scheduled', 59.99,   NULL,    current_date + 2),
    (register_id, 6, NULL, m_start + 5, 'Duplicate charge', 'void',      42.00,   NULL,    NULL),
    (register_id, 7, NULL, m_start + 6, 'Coffee shop',      'recorded',  4.75,    NULL,    NULL);
END
$$;
