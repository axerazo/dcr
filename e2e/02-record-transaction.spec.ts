import { test, expect } from './fixtures/register'
import { money } from './support/money'

test.describe('CUJ-02: existing user records a transaction and sees it in the register', () => {

    // Oracle: Each new row shows the correct running balance; header Actual Balance equals opening − debit + credit. Same
    // invariant the golden suite proves at unit level, now verified through the assembled UI — one invariant, two layers
    // of the pyramid.

    test('Add a cleared debit transaction & verify all balance updates with correct running balances', async ({ register, seed }) => {
        const afterDebit = seed.openingBalance - 100

        await register.addTransaction({ description: 'Test Transaction', status: 'Cleared', debit: 100 })

        // Verify the balance column of the new transaction row shows the correct running balance, and that the header balances are updated accordingly
        await expect(register.row('Test Transaction').balance).toHaveText(money(afterDebit))
        await expect(register.actualBalance).toHaveText(money(afterDebit))
        await expect(register.availableBalance).toHaveText(money(afterDebit))
    })

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
        await expect(register.availableBalance).toHaveText(money(afterDebit)) // Available balance should not include pending credit
    })
})