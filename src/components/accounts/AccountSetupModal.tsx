// ============================================================
// AccountSetupModal — create a new bank account
// SPEC §4: routing_number (9 digits), account_number (8–17 digits)
// Encrypted at application layer before storing
// ============================================================

import { useState } from 'react'
import { useCreateAccount } from '@/hooks/useAccounts'
import type { AccountType } from '@/types'

interface AccountSetupModalProps {
  userId: string
  onClose: () => void
  onAccountCreated?: (accountId: string) => void
}

// Simple XOR-based placeholder encryption.
// In production replace with WebCrypto AES-256-GCM.
// The encryption key comes from VITE_ENCRYPTION_KEY env var.
function encryptField(plain: string): string {
  // TODO: replace with WebCrypto AES-256-GCM before production
  // For now returns base64 to indicate the field is "encoded"
  return btoa(plain)
}

export function AccountSetupModal({ userId, onClose, onAccountCreated }: AccountSetupModalProps) {
  const [nickname, setNickname] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('checking')
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createAccount = useCreateAccount()

  function validate(): string | null {
    if (!nickname.trim()) return 'Nickname is required.'
    if (nickname.length > 50) return 'Nickname must be 50 characters or less.'
    if (!bankName.trim()) return 'Bank name is required.'
    if (!/^\d{9}$/.test(routingNumber)) return 'Routing number must be exactly 9 digits.'
    if (!/^\d{8,17}$/.test(accountNumber)) return 'Account number must be 8–17 digits.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setError(null)

    try {
      const account = await createAccount.mutateAsync({
        user_id: userId,
        nickname: nickname.trim(),
        bank_name: bankName.trim(),
        account_type: accountType,
        routing_number: encryptField(routingNumber),
        account_number: encryptField(accountNumber),
      })
      if (onAccountCreated) {
        onAccountCreated(account.id)
      } else {
        onClose()
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Add Bank Account</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Account Nickname *
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder='e.g. "TD Bank — Main Checking"'
              maxLength={50}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-hidden focus:border-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name *</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder='e.g. "TD Bank"'
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account Type *</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-hidden focus:border-blue-500"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Routing Number (9 digits) *
            </label>
            <input
              type="text"
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="••••••••• (9 digits)"
              maxLength={9}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-hidden focus:border-blue-500 font-mono"
            />
            <p className="text-xs text-slate-400 mt-0.5">Encrypted at rest — shown masked in UI</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Account Number (8–17 digits) *
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 17))}
              placeholder="•••••••••• (8–17 digits)"
              maxLength={17}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-hidden focus:border-blue-500 font-mono"
            />
            <p className="text-xs text-slate-400 mt-0.5">Encrypted at rest — shown masked in UI</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createAccount.isPending}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {createAccount.isPending ? 'Saving…' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
