import { test, expect } from './fixtures/register'
import { money } from './support/money'

test.describe('CUJ-02: Record a transaction and see running balances update', () => {

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Goal: The core write path: user adds a debit and a credit; on-screen balances reflect Formula D exactly.
    //
    // Preconditions: Authenticated; register with known opening balance and no transactions.
    //
    // Path: Add debit (date, description, amount) → observe row balance → add credit → observe.
    //
    // Oracle: Each new row shows the correct running balance; header Actual Balance equals opening − debit + credit. Same invariant the golden suite
    // proves at unit level, now verified through the assembled UI — one invariant, two layers of the pyramid.
    //
    // Traceability: SPEC §9 Formulas A/C/D.
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    test('Record a debit then a credit; running and header balances follow Formula D', async ({ register, seed }) => {
        const DEBIT = 100
        const CREDIT = 200
        const afterDebit = seed.openingBalance - DEBIT
        const afterCredit = afterDebit + CREDIT

        // Precondition: known opening balance and no transactions — header balances equal the opening
        await expect(register.openingBalance).toHaveText(money(seed.openingBalance))
        await expect(register.actualBalance).toHaveText(money(seed.openingBalance))
        await expect(register.availableBalance).toHaveText(money(seed.openingBalance))

        await register.addTransaction({ description: 'Test Transaction', status: 'Cleared', debit: DEBIT })

        // Verify the balance column of the new transaction row shows the correct running balance, and that the header balances are updated accordingly
        await expect(register.row('Test Transaction').balance).toHaveText(money(afterDebit))
        await expect(register.actualBalance).toHaveText(money(afterDebit))
        await expect(register.availableBalance).toHaveText(money(afterDebit))

        // Add a pending credit transaction
        await register.addTransaction({ description: 'Pending Credit', status: 'Pending', credit: CREDIT })

        // Verify the balance column of the new transaction row shows the correct running balance, and that the header balances are updated accordingly
        await expect(register.row('Pending Credit').balance).toHaveText(money(afterCredit))
        await expect(register.actualBalance).toHaveText(money(afterCredit))
        await expect(register.availableBalance).toHaveText(money(afterDebit)) // Available balance should not include pending credit
    })
})
