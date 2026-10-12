import { test as base, expect } from './seed'
import { RegisterPage } from '../pages/RegisterPage'

export const test = base.extend<{ register: RegisterPage }>({
  // `seed: _seed` makes this fixture depend on seed (user + data + sign-in)
  // without tripping noUnusedLocals.
  register: async ({ page, seed: _seed }, use) => {
    await page.goto('/')
    await use(new RegisterPage(page))
  },
})

export { expect }