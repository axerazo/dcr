// ============================================================
// LoginPage — email + password login with MFA notice
// SPEC §3: Supabase Auth; MFA required (configured in Supabase dashboard)
// ============================================================

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mfaChallenge, setMfaChallenge] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (signUpError) throw signUpError
        setError('Check your email to confirm your account.')
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError

        // Check for MFA requirement
        if (data.session?.user) {
          const { data: mfaData } = await supabase.auth.mfa.listFactors()
          const totpFactor = mfaData?.totp?.find((f) => f.status === 'verified')
          if (totpFactor) {
            const { error: challengeError } =
              await supabase.auth.mfa.challenge({ factorId: totpFactor.id })
            if (challengeError) throw challengeError
            setFactorId(totpFactor.id)
            setMfaChallenge(true)
            return
          }
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: factorId,
        code: mfaCode,
      })
      if (error) throw error
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (mfaChallenge) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-slate-800 mb-1">Two-Factor Authentication</h1>
          <p className="text-sm text-slate-500 mb-6">Enter the code from your authenticator app.</p>
          <form onSubmit={handleMfaVerify} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-center text-2xl tracking-widest outline-none focus:border-blue-500"
              autoFocus
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || mfaCode.length < 6}
              className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Check Register</h1>
          <p className="text-sm text-slate-500 mt-1">Your ledger is the source of truth.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-slate-600 mb-1">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-slate-600 mb-1">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={isSignUp ? 12 : undefined}
            />
            {isSignUp && (
              <p className="text-xs text-slate-400 mt-1">
                Min. 12 characters, mixed case, numbers, and symbols required.
              </p>
            )}
          </div>

          {error && (
            <p className={`text-sm ${error.includes('Check your email') ? 'text-green-600' : 'text-red-600'}`}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null) }}
            className="text-sm text-blue-600 hover:underline"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  )
}
