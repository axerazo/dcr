// ============================================================
// AppPage — main authenticated shell
// Shows account selector + RegisterView
// ============================================================

import { useState } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { useAuthStore } from '@/store/authStore'
import { RegisterView } from '@/components/register/RegisterView'
import { AccountSetupModal } from '@/components/accounts/AccountSetupModal'
import { OpeningBalanceModal } from '@/components/accounts/OpeningBalanceModal'
import type { DbAccount } from '@/types'

export function AppPage() {
  const { user, signOut } = useAuthStore()
  const { data: accounts = [], isLoading } = useAccounts()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [pendingOpeningBalanceAccountId, setPendingOpeningBalanceAccountId] = useState<string | null>(null)

  const selectedAccount: DbAccount | undefined =
    accounts.find((a) => a.id === selectedAccountId) ?? accounts[0]

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Top app bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Check Register</span>
          {accounts.length > 1 && (
            <select
              value={selectedAccount?.id ?? ''}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="text-xs bg-slate-800 text-slate-200 border border-slate-600 rounded-sm px-2 py-1 outline-hidden"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.nickname}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSetup(true)}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            + Account
          </button>
          <span className="text-xs text-slate-500">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {accounts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <h2 className="text-lg font-semibold text-slate-700 mb-2">No accounts yet</h2>
              <p className="text-sm text-slate-500 mb-4">
                Add your first bank account to get started.
              </p>
              <button
                onClick={() => setShowSetup(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Add Account
              </button>
            </div>
          </div>
        ) : selectedAccount ? (
          <RegisterView account={selectedAccount} />
        ) : null}
      </main>

      {showSetup && (
        <AccountSetupModal
          userId={user!.id}
          onClose={() => setShowSetup(false)}
          onAccountCreated={(accountId) => {
            setShowSetup(false)
            setPendingOpeningBalanceAccountId(accountId)
          }}
        />
      )}

      {pendingOpeningBalanceAccountId && (
        <OpeningBalanceModal
          accountId={pendingOpeningBalanceAccountId}
          onComplete={() => {
            setSelectedAccountId(pendingOpeningBalanceAccountId)
            setPendingOpeningBalanceAccountId(null)
          }}
          onCancel={() => {
            setSelectedAccountId(pendingOpeningBalanceAccountId)
            setPendingOpeningBalanceAccountId(null)
          }}
        />
      )}
    </div>
  )
}
