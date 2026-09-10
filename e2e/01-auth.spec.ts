import { test, expect } from './fixtures/seed'

test.use({ storageState: { cookies: [], origins: [] } }) // start off signed out

test('CUJ-01: existing user signs in and lands on current-month register', async ({ page, seedUnauthenticated }) => {
    const { email, password, accountNickname, month, year } = seedUnauthenticated

    await page.goto('/')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()

    // Oracle (TEST_PLAN §4): Register header shows account nickname and current month/year label; transaction table renders.

    // Convert month number to month name for assertion
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })
    await expect(page.getByText(`${accountNickname}`)).toBeVisible()
    await expect(page.getByText(`${monthName} ${year}`)).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()

    // Supplementary — not part of CUJ-01's formal oracle, folded in here because the login
    // flow already lands on this state. Verifies month navigation has the current month
    // selected and the highlighted year is not itself clickable. If MonthNav's year-click
    // behavior changes for reasons unrelated to sign-in, this is where that surfaces.

    // Convert month name to 3-letter abbreviation for assertion
    const monthAbbreviation = monthName.slice(0, 3)
    await expect(page.getByRole('button', { name: `${monthAbbreviation}` })).toBeVisible()

    const currentMonthButton = page.getByRole('button', { name: `${monthAbbreviation}` })
    await expect(currentMonthButton).toHaveAttribute('aria-current', 'page') // Ensures the current month button/tab is selected    

    // Verify the month navigation contains the current year
    await expect(page.getByRole('navigation', { name: 'Month navigation' })).toContainText(`${year}`)

    // Verify current year is not a button (i.e., not clickable) in the month navigation
    const currentYearButton = page.getByRole('button', { name: `${year}` })
    await expect(currentYearButton).toHaveCount(0) // Ensures the current year is not a button
})