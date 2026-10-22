import { expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'

// 0-based; order: check#, date, description, status, debit, credit, balance, notes, sched. date
const COL = { date: 1, balance: 6 } as const

// Local YYYY-MM-DD (never toISOString: it shifts to UTC)
function toLocalISODate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

type NewTransaction = {
    checkNumber?: number
    transactionDate?: Date
    description: string
    status?: 'Recorded' | 'Cleared' | 'Pending' | 'Void'
    debit?: number
    credit?: number
    notes?: string
    scheduledDate?: Date
}

export class RegisterPage {
    readonly signOutButton: Locator
    readonly actualBalance: Locator
    readonly availableBalance: Locator
    readonly addTransactionButton: Locator
    readonly editBalanceButton: Locator
    readonly saveButton: Locator
    readonly cancelButton: Locator
    readonly openingBalance: Locator
    readonly initializeContainer: Locator
    readonly fullyReconciledBanner: Locator
    readonly closeArchiveButton: Locator
    readonly notYetButton: Locator

    constructor(private readonly page: Page) {
        this.signOutButton = this.page.getByRole('button', { name: 'Sign out' })
        this.actualBalance = this.page.getByText('Actual Balance', { exact: true }).locator('xpath=preceding-sibling::span')
        this.availableBalance = this.page.getByText('Available Balance', { exact: true }).locator('xpath=preceding-sibling::span')
        this.addTransactionButton = this.page.getByRole('button', { name: '+ Add transaction' })
        this.editBalanceButton = this.page.getByRole('button', { name: 'Edit opening balance' })
        this.saveButton = this.page.getByRole('button', { name: 'Save' })
        this.cancelButton = this.page.getByRole('button', { name: 'Cancel' })
        this.openingBalance = this.page.getByRole('cell', { name: '$' })
        this.initializeContainer = this.page.getByRole('heading', { name: /^Initialize / })
        this.fullyReconciledBanner = this.page.getByText('✅ Fully reconciled — all')
        this.closeArchiveButton = this.page.getByRole('button', { name: /^Close & Archive / })
        this.notYetButton = this.page.getByRole('button', { name: 'Not Yet' })
    }

    row(description: string): { locator: Locator; balance: Locator } {
        const row = this.page.getByRole('row', { name: description })
        return {
            locator: row,
            balance: row.getByRole('cell').nth(COL.balance),
        }
    }

    private readonly monthNav = () => this.page.getByRole('navigation', { name: 'Month navigation' })
    private readonly shownYear = () => this.monthNav().locator(':scope > div > span')

    async goToMonth(target: Date): Promise<void> {
        const label = target.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
        const delta = target.getFullYear() - Number(await this.shownYear().textContent())
        const monthButton = this.monthNav().getByRole('button', { name: label, exact: true })

        // Order matters: changing year keeps the month, and an empty month with a prior
        // register auto-creates. Detour through the earlier year so nothing extra is written.
        if (delta > 0) await monthButton.click()
        for (let i = 0; i < Math.abs(delta); i++) {
            await this.monthNav().getByRole('button', { name: delta > 0 ? 'Next year' : 'Previous year' }).click()
        }
        await expect(this.shownYear()).toHaveText(String(target.getFullYear()))
        if (delta <= 0) await monthButton.click()
    }

    async addTransaction(tx: NewTransaction): Promise<void> {
        const addRow = this.page.getByRole('row').filter({
            has: this.page.getByRole('textbox', { name: 'Description *' }),
        })

        await this.addTransactionButton.click()

        // Fill in the add transaction row
        if (tx.transactionDate !== undefined) {
            await addRow
                .getByRole('cell')
                .nth(COL.date)
                .getByRole('textbox')
                .fill(toLocalISODate(tx.transactionDate))
        }

        await this.page.getByRole('textbox', { name: 'Description *' }).fill(tx.description)

        if (tx.status !== undefined) {
            await addRow.getByRole('combobox').selectOption(tx.status)
        }

        if (tx.debit !== undefined) {
            await this.page.getByRole('textbox', { name: 'Debit' }).fill(String(tx.debit))
        }

        if (tx.credit !== undefined) {
            await this.page.getByRole('textbox', { name: 'Credit' }).fill(String(tx.credit))
        }

        if (tx.notes !== undefined) {
            await this.page.getByRole('textbox', { name: 'Notes / Confirmation number...' }).fill(tx.notes)
        }

        await this.saveButton.click()
        await this.page.getByRole('row', { name: tx.description }).waitFor() // saved row has appeared
        await this.cancelButton.click() // Close the add transaction row
    }

    async voidTransaction(description: string): Promise<string> {
        const row = this.page.getByRole('row', { name: description })
        let dialogInfo = ''
        this.page.once('dialog', async (dialog) => {
            dialogInfo = `${dialog.type()}: ${dialog.message()}`
            await dialog.accept()
        })
        await row.getByRole('button', { name: '○' }).click()
        await row.getByRole('button', { name: 'void Void' }).click()
        return dialogInfo
    }

    async updateTransactionStatus(description: string, newStatus: 'Recorded' | 'Cleared' | 'Pending' | 'Void'): Promise<void> {
        const row = this.page.getByRole('row', { name: description })
        await row.getByRole('button', { name: 'Pending' }).click()
        await row.getByRole('button', { name: `${newStatus} ${newStatus}` }).click({ timeout: 5000 })
        await row.getByRole('button', { name: `${newStatus}` }).waitFor()
    }
}
