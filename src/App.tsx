import { useAuthStore } from '@/store/authStore'
import { supabaseMisconfigured } from '@/lib/supabase'
import { LoginPage } from '@/pages/LoginPage'
import { AppPage } from '@/pages/AppPage'

export default function App() {
  const { session, loading } = useAuthStore()

  if (supabaseMisconfigured) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full">
          <h1 className="text-xl font-bold text-slate-800 mb-1">Setup Required</h1>
          <p className="text-sm text-slate-500 mb-5">
            Supabase environment variables are missing. The app needs a database to run.
          </p>
          <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
            <li>
              Create a free project at{' '}
              <span className="font-mono bg-slate-100 px-1 rounded">supabase.com</span>
            </li>
            <li>
              Go to <strong>Settings → API</strong> and copy your Project URL and anon key
            </li>
            <li>
              Copy <span className="font-mono bg-slate-100 px-1 rounded">.env.example</span> to{' '}
              <span className="font-mono bg-slate-100 px-1 rounded">.env.local</span> and fill in the values
            </li>
            <li>
              Paste the contents of{' '}
              <span className="font-mono bg-slate-100 px-1 rounded">supabase/migrations/001_initial_schema.sql</span>{' '}
              into the Supabase SQL Editor and run it
            </li>
            <li>Restart the dev server</li>
          </ol>
          <div className="mt-5 p-3 bg-slate-50 rounded-lg font-mono text-xs text-slate-600 space-y-1">
            <p className="text-slate-400"># .env.local</p>
            <p>VITE_SUPABASE_URL=https://your-ref.supabase.co</p>
            <p>VITE_SUPABASE_ANON_KEY=your-anon-key</p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    )
  }

  return session ? <AppPage /> : <LoginPage />
}
