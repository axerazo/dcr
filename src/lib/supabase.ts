import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey

// Not using the Database generic here — our own DbXxx types in types/index.ts provide
// the type safety at the application layer, which is cleaner than fighting the stub.
// Falls back to placeholder values so the module loads even without .env.local set.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
)
