import { expect, test, type Page } from '@playwright/test'

// Needs a freshly seeded database (npm run db:seed) and the app running.
// Demo plan: day 1..5 of the weekly cycle visit C001, C002, C003 (4 km planned per stop).

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('demo1234')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

const PLACES = {
  depot: { latitude: 11.5564, longitude: 104.9282 },
  farStart: { latitude: 11.63, longitude: 104.9282 },
  c001: { latitude: 11.5801, longitude: 104.9101 },
  c002: { latitude: 11.5935, longitude: 104.9023 },
  c003: { latitude: 11.5632, longitude: 104.9319 },
}

test('rep checks in, goes over tolerance, RSM approves extra km', async ({ browser }) => {
  const rep = await browser.newContext({ geolocation: PLACES.farStart, permissions: ['geolocation'] })
  const page = await rep.newPage()
  await login(page, 'sr001@demo.local')
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()

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

  // 12 km planned; starting about 8 km from the depot pushes the day far above plan + 15%.
  await expect(page.getByText('outside geofence').first()).toBeVisible()
  await expect(page.getByText('Request extra km').first()).toBeVisible()
  const max = (await page.getByLabel(/Km to request/).getAttribute('max')) ?? '0'
  await page.getByLabel(/Km to request/).fill(max)
  await page.getByRole('button', { name: 'Send to RSM' }).click()
  await expect(page.getByText(/Extra km request: /)).toBeVisible()

  const rsm = await browser.newContext()
  const rsmPage = await rsm.newPage()
  await login(rsmPage, 'rsm01@demo.local')
  await expect(rsmPage.getByRole('heading', { name: 'Approvals', exact: true })).toBeVisible()
  await rsmPage.getByRole('button', { name: /^Approve$/ }).first().click()
  await expect(rsmPage.getByText('Approved').first()).toBeVisible()
})

test('replacement request clones the allowance and needs the full chain', async ({ browser }) => {
  const ctx = await browser.newContext()
  const hr = await ctx.newPage()
  await login(hr, 'hr01@demo.local')
  await hr.goto('/requests/new')
  await hr.getByLabel('Employee', { exact: true }).selectOption({ label: 'Bopha (SR) (SR)' })
  await hr.getByLabel('Replacement of (optional)').selectOption({ label: 'Sokha (SR) (SR)' })
  await hr.getByRole('button', { name: 'Copy' }).click()
  await expect(hr.getByLabel('Baseline km per month')).toHaveValue('900')
  await hr.getByLabel('Reason').fill('Bopha takes over Sokha route')
  await hr.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(hr.getByRole('heading', { name: 'Approvals', exact: true })).toBeVisible()
  await expect(hr.getByText('Waiting for Regional sales manager').first()).toBeVisible()

  for (const email of ['rsm01@demo.local', 'nsm01@demo.local', 'hr01@demo.local']) {
    const c = await browser.newContext()
    const p = await c.newPage()
    await login(p, email)
    await expect(p.getByRole('heading', { name: 'Approvals', exact: true })).toBeVisible()
    await p.getByRole('button', { name: /^Approve$/ }).first().click()
    await p.waitForTimeout(500)
  }
  const check = await ctx.newPage()
  await check.goto('/employees')
  await expect(check.getByRole('row', { name: /Bopha/ })).toContainText('900 km/mo')
})
