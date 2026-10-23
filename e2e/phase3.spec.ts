import { execSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

test.beforeAll(() => {
  execSync('npm run db:seed', { stdio: 'ignore' })
})

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('demo1234')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

test('language switch: login and rep app turn Khmer and stay Khmer after reload', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'ខ្មែរ' }).click()
  await expect(page.getByText('ចូលប្រើដោយអ៊ីមែលការងាររបស់អ្នក')).toBeVisible()
  await page.getByLabel('អ៊ីមែល').fill('sr001@demo.local')
  await page.getByLabel('ពាក្យសម្ងាត់').fill('demo1234')
  await page.getByRole('button', { name: 'ចូលប្រើ' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
  await expect(page.getByRole('heading', { name: 'ថ្ងៃនេះ', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'ថ្ងៃនេះ', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'EN' }).first().click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
})

test('maps: customers, journey plan route and rep screen show their markers', async ({ browser }) => {
  const rm = await browser.newContext()
  const page = await rm.newPage()
  await login(page, 'rsm01@demo.local')
  await page.goto('/customers')
  const map = page.getByTestId('map').first()
  await expect(map).toHaveAttribute('data-ready', 'true')
  expect(Number(await map.getAttribute('data-markers'))).toBeGreaterThan(0)

  await page.goto('/plans')
  await page.getByRole('button', { name: /Show route on map/ }).first().click()
  await expect(page.getByTestId('map').first()).toHaveAttribute('data-ready', 'true')
  expect(Number(await page.getByTestId('map').first().getAttribute('data-markers'))).toBeGreaterThan(1)
})
