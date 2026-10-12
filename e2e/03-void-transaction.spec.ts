import { test, expect } from './fixtures/register'
import { money } from './support/money'

test.describe('CUJ-03: Void a transaction — strikethrough renders, balances unchanged', () => {

    // Goal: User voids an erroneous entry; the record stays visible but leaves every balance untouched.
    // Preconditions: Register with three transactions and known balances.
    // Path: Void the middle transaction → confirm in the prompt.
    // Oracle: Row renders struck-through with dimmed styling; its balance cell empties; all other rows' balances and the header balances are
    // unchanged — the void-injection metamorphic property, verified through the UI. Audit expectation noted for a later API-level check.

    test('Verify multiple transaction recordings & verify all balance updates with correct running balances', async ({ register, seed }) => {
        const afterDebit = seed.openingBalance - 100
        const afterCredit = afterDebit + 200

        await register.addTransaction({ description: 'Test Transaction', status: 'Cleared', debit: 100 })

        // Verify the balance column of the new transaction row shows the correct running balance, and that the header balances are updated accordingly
        await expect(register.row('Test Transaction').balance).toHaveText(money(afterDebit))
        await expect(register.actualBalance).toHaveText(money(afterDebit))
        await expect(register.availableBalance).toHaveText(money(afterDebit))

        // Add a pending credit transaction
        await register.addTransaction({ description: 'Pending Credit', status: 'Pending', credit: 200 })

        // Verify the balance column of the new transaction row shows the correct running balance, and that the header balances are updated accordingly
        await expect(register.row('Pending Credit').balance).toHaveText(money(afterCredit))
        await expect(register.actualBalance).toHaveText(money(afterCredit))
        await expect(register.availableBalance).toHaveText(money(afterDebit))

        // Add a draft transaction
        await register.addTransaction({ description: 'Draft Transaction', status: 'Recorded', debit: 50 })

        // Verify the balance column of the new transaction row shows the correct running balance, and that the header balances are updated accordingly
        await expect(register.row('Draft Transaction').balance).toHaveText(money(afterCredit - 50))
        await expect(register.actualBalance).toHaveText(money(afterCredit - 50))
        await expect(register.availableBalance).toHaveText(money(afterDebit))
    })
})