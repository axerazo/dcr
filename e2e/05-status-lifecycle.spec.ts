import { test, expect } from './fixtures/register'
import { money } from './support/money'

test.describe('CUJ-05: Transaction status lifecycle — pending → cleared; available vs current balances diverge and reconverge', () => {

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Goal: User marks a transaction pending, then cleared; the available/current split behaves.
    //
    // Preconditions: Register with mixed-status transactions.
    //
    // Path: Set a transaction to pending → observe header balances → set to cleared.
    //
    // Oracle: While pending, Available and Current diverge by exactly the pending amount; on clearing, they reconverge; when the last uncleared row
    // clears, the ready-to-close prompt appears (bridging into CUJ-06).
    //
    // Traceability: SPEC §9 Formula B, §10, §11 ready-to-close.
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Expected to fail until app bug #17 is fixed (status menu covered by later rows). Remove `.fail` once it passes.
    test.fail('Changing Statuses - Balances Updated Accordingly', async ({ page, register, seed }) => {
        const startingBalance = seed.openingBalance
        const { month, year } = seed                        // 1-based month, from the pinned `now`

        await expect(page.getByRole('cell', { name: '$' })).toHaveText(money(startingBalance))
        await expect(register.actualBalance).toHaveText(money(startingBalance))
        await expect(register.availableBalance).toHaveText(money(startingBalance))

        const debit = [100, 75]
        const credit = 50

        await register.addTransaction({ transactionDate: new Date(year, month - 1, 21), description: 'Pending Debit 1', status: 'Pending', debit: debit[0] })
        await register.addTransaction({ transactionDate: new Date(year, month - 1, 22), description: 'Cleared Debit', status: 'Cleared', debit: debit[1] })
        await register.addTransaction({ transactionDate: new Date(year, month - 1, 24), description: 'Lifecycle Credit', status: 'Recorded', credit: credit })

        const currentActualBalance = startingBalance - debit[0] - debit[1] + credit
        const currentAvailableBalance = startingBalance - debit[1]

        await expect(register.actualBalance).toHaveText(money(currentActualBalance))
        await expect(register.availableBalance).toHaveText(money(currentAvailableBalance))

        await register.updateTransactionStatus('Pending Debit 1', 'Cleared')

        const nextCurrentActualBalance = startingBalance - debit[0] - debit[1] + credit
        const nextCurrentAvailableBalance = nextCurrentActualBalance - credit

        await expect(register.actualBalance).toHaveText(money(nextCurrentActualBalance))
        await expect(register.availableBalance).toHaveText(money(nextCurrentAvailableBalance))
        await expect(register.closeArchiveButton).toBeHidden()

        await register.updateTransactionStatus('Lifecycle Credit', 'Pending')

        const lastCurrentActualBalance = startingBalance - debit[0] - debit[1] + credit
        const lastCurrentAvailableBalance = lastCurrentActualBalance - credit
        const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' })

        await expect(register.actualBalance).toHaveText(money(lastCurrentActualBalance))
        await expect(register.availableBalance).toHaveText(money(lastCurrentAvailableBalance))

        await register.updateTransactionStatus('Lifecycle Credit', 'Cleared')

        const reconvergedAvailableBalance = lastCurrentActualBalance  // cleared: Available reconverges with Actual

        await expect(register.actualBalance).toHaveText(money(lastCurrentActualBalance))
        await expect(register.availableBalance).toHaveText(money(reconvergedAvailableBalance))

        await expect(register.fullyReconciledBanner).toBeVisible()

        await expect(register.closeArchiveButton).toBeVisible()
        await expect(register.closeArchiveButton).toHaveText(`Close & Archive ${monthName}`)

        await expect(register.notYetButton).toBeVisible()
    })
})
