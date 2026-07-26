import type { Route } from '@playwright/test'
import {
  expect,
  researchResponse,
  storageKeys,
  test,
} from './helpers/appHarness'

test.describe('Storage recovery and accessibility', () => {
  test('recovers from corrupted thesis and watchlist storage', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      local: {
        [storageKeys.thesis]: '{broken thesis',
        [storageKeys.watchlist]: '{broken watchlist',
      },
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
    await harness.mockResearch({ json: researchResponse('IBM') })
    await harness.goto()

    await expect(
      page.getByRole('alert').filter({ hasText: 'saved watchlist could not be read' }),
    ).toBeVisible()
    await page.getByText('Personalize your results').click()
    await expect(
      page.getByRole('alert').filter({ hasText: 'saved thesis could not be read' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Save thesis' }).click()
    await harness.research('IBM')
    await page.getByRole('button', { name: 'Add to watchlist' }).click()
    await page.getByRole('button', { name: 'Watchlist 1' }).click()
    await expect(page.getByText('International Business Machines')).toBeVisible()
  })

  test('supports keyboard-only navigation, details, search, and live semantics', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
    let pendingRoute: Route | null = null
    await harness.mockResearch((route) => {
      pendingRoute = route
    })
    await harness.goto()

    const discover = page.getByRole('button', { name: 'Discover' })
    await discover.focus()
    await page.keyboard.press('Enter')
    await expect(discover).toHaveAttribute('aria-current', 'page')
    const watchlist = page.getByRole('button', { name: 'Watchlist' })
    await watchlist.focus()
    await page.keyboard.press('Enter')
    await expect(watchlist).toHaveAttribute('aria-current', 'page')
    const research = page.getByRole('button', { name: 'Research', exact: true })
    await research.focus()
    await page.keyboard.press('Enter')
    await expect(research).toHaveAttribute('aria-current', 'page')

    const dataAccess = page.getByText('Data access', { exact: true })
    await dataAccess.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Free Finnhub key')).toBeVisible()
    const search = page.getByLabel('Company or ticker')
    await search.focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.type('IBM')
    await page.keyboard.press('Enter')

    await expect(
      page.getByRole('status').filter({ hasText: 'Reviewing the supplied evidence' }),
    ).toBeVisible()
    await expect.poll(() => pendingRoute !== null).toBe(true)
    await pendingRoute!.fulfill({ json: researchResponse('IBM') })
    await expect(page.getByText(researchResponse('IBM').headline)).toBeVisible()

    await search.focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.type('!')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('alert').filter({ hasText: /company name or US ticker/i }),
    ).toBeVisible()
  })
})

test.describe('Mobile reachability', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps core Research, Discover, and Watchlist controls reachable without horizontal overflow', async ({
    page,
    harness,
  }) => {
    await harness.goto()
    await expect(page.getByLabel('Company or ticker')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Search', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Data access', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Discover' }).click()
    await expect(page.getByRole('button', { name: 'Refresh ideas' })).toBeVisible()
    await expect(page.getByText('Discover is locked.')).toBeVisible()

    await page.getByRole('button', { name: 'Watchlist' }).click()
    await expect(
      page.getByRole('button', { name: 'Research a stock' }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      })),
    ).toEqual({ scrollWidth: 390, clientWidth: 390 })
  })
})
