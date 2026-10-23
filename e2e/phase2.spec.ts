import { execSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

// Starts from freshly seeded data so it does not depend on the other spec file.
test.beforeAll(() => {
  execSync('npm run db:seed', { stdio: 'ignore' })
})

async function login(page: Page, email: string, password = 'demo1234') {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

const PLACES = {
  depot: { latitude: 11.5564, longitude: 104.9282 },
  c001: { latitude: 11.5801, longitude: 104.9101 },
  c002: { latitude: 11.5935, longitude: 104.9023 },
  c003: { latitude: 11.5632, longitude: 104.9319 },
}

test('month end: rep confirms, RSM signs off, payroll CSV has the statement', async ({ browser }) => {
  const rep = await browser.newContext({ geolocation: PLACES.depot, permissions: ['geolocation'] })
  const page = await rep.newPage()
  await login(page, 'sr001@demo.local')
  await page.getByRole('button', { name: /Start day/ }).click()
  await expect(page.getByText('Customers today')).toBeVisible()
  for (const [name, place] of [
    ['Sunrise Mart', PLACES.c001],
    ['Angkor Hardware', PLACES.c002],
    ['Riverside Home', PLACES.c003],
  ] as const) {
    await rep.setGeolocation(place)
    await page.locator('div', { hasText: new RegExp(`^${name}`) }).getByRole('button', { name: 'Check in' }).first().click()
    await expect(page.getByText('Visited').first()).toBeVisible()
  }
  await rep.setGeolocation(PLACES.depot)
  await page.getByRole('button', { name: 'End day' }).click()
  await expect(page.getByRole('button', { name: 'End day' })).toBeHidden()

  const hr = await (await browser.newContext({ acceptDownloads: true })).newPage()
  await login(hr, 'hr01@demo.local')
  await hr.goto('/month')
  await hr.getByRole('button', { name: 'Calculate month' }).click()
  await expect(hr.getByRole('row', { name: /Sokha/ })).toBeVisible()

  await page.goto('/month')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Confirmed by employee')).toBeVisible()

  const rsm = await (await browser.newContext()).newPage()
  await login(rsm, 'rsm01@demo.local')
  await rsm.goto('/month')
  await rsm.getByRole('row', { name: /Sokha/ }).getByRole('button', { name: 'Sign off' }).click()
  await expect(rsm.getByText('Signed off by RSM')).toBeVisible()

  await hr.reload()
  const download = hr.waitForEvent('download')
  await hr.getByRole('button', { name: 'Export payroll CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^fuel-allowance-\d{4}-\d{2}\.csv$/)
  const text = await (await import('node:fs/promises')).readFile((await file.path()) as string, 'utf8')
  expect(text.split('\n')[0]).toContain('employee_code,employee_name')
  expect(text).toContain('SR001,Sokha (SR)')
})

test('HR submits a new plan version and the RSM approves it', async ({ browser }) => {
  const hr = await (await browser.newContext()).newPage()
  await login(hr, 'hr01@demo.local')
  await hr.goto('/plans')
  await hr.getByRole('button', { name: 'New plan version' }).click()
  await hr.getByLabel('Employee', { exact: true }).selectOption({ label: 'Sokha (SR) (SR)' })
  await hr.getByLabel('Add customer to day 1').selectOption({ label: 'Bayon Supplies' })
  await hr.getByLabel('Add customer to day 1').selectOption({ label: 'Kampuchea Build' })
  await hr.getByLabel('Add customer to day 2').selectOption({ label: 'Sunrise Mart' })
  await hr.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(hr.getByText('Sokha (SR), version 2')).toBeVisible()
  await expect(hr.getByText('Waiting').first()).toBeVisible()

  const rsm = await (await browser.newContext()).newPage()
  await login(rsm, 'rsm01@demo.local')
  await rsm.goto('/plans')
  await rsm.getByRole('button', { name: 'Approve plan' }).click()
  await expect(rsm.getByText('Replaced')).toBeVisible()
  await expect(rsm.getByText('Approved').first()).toBeVisible()
})

test('HR adds an employee and the RSM verifies a new customer pin', async ({ browser }) => {
  const hr = await (await browser.newContext()).newPage()
  await login(hr, 'hr01@demo.local')
  await hr.goto('/employees')
  await hr.getByLabel('Code').fill('SR900')
  await hr.getByLabel('Name').fill('Vuthy (SR)')
  await hr.getByLabel('Work email').fill('sr900@demo.local')
  await hr.getByLabel('Reports to').selectOption({ label: 'Rithy (ASM) (ASM)' })
  await hr.getByLabel('Starting password').fill('welcome123')
  await hr.getByRole('button', { name: 'Add employee' }).click()
  await expect(hr.getByText('Added Vuthy (SR)')).toBeVisible()
  await expect(hr.getByRole('row', { name: /Vuthy/ })).toBeVisible()

  await hr.goto('/customers')
  await hr.getByLabel('Code').fill('C900')
  await hr.getByLabel('Name').fill('Tonle Trading')
  await hr.getByLabel('Latitude').fill('11.5701')
  await hr.getByLabel('Longitude').fill('104.9201')
  await hr.getByRole('button', { name: 'Add customer' }).click()
  await expect(hr.getByRole('row', { name: /Tonle Trading/ })).toContainText('Not verified')

  const rsm = await (await browser.newContext()).newPage()
  await login(rsm, 'rsm01@demo.local')
  await rsm.goto('/customers')
  await rsm.getByRole('row', { name: /Tonle Trading/ }).getByRole('button', { name: 'Verify' }).click()
  await expect(rsm.getByRole('row', { name: /Tonle Trading/ })).toContainText('Verified')

  // The new employee can sign in.
  const newbie = await (await browser.newContext()).newPage()
  await login(newbie, 'sr900@demo.local', 'welcome123')
  await expect(newbie.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
})
