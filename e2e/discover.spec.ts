import {
  defaultThesis,
  emptyWatchlist,
  expect,
  makeSnapshot,
  makeWatchlistItem,
  recommendationResponse,
  researchResponse,
  storageKeys,
  test,
} from './helpers/appHarness'

test.describe('Discover intelligence', () => {
  test('is locked without a key and never spends on page load', async ({
    page,
    harness,
  }) => {
    await harness.mockRecommendations({
      status: 500,
      json: { error: 'This endpoint must not be called.' },
    })
    await harness.goto()
    await page.getByRole('button', { name: 'Discover' }).click()

    await expect(page.getByText('Discover is locked.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh ideas' })).toBeDisabled()
    expect(harness.recommendationRequests).toHaveLength(0)
    expect(harness.finnhubRequests).toHaveLength(0)
  })

  test('manually returns exactly five grounded opinions with note and exclusions', async ({
    page,
    harness,
  }) => {
    const note = 'Prefer durable infrastructure economics over narrative momentum.'
    const watchlist = {
      ...emptyWatchlist,
      items: [makeWatchlistItem('AAPL')],
    }
    await harness.seedStorage({
      local: {
        [storageKeys.thesis]: { ...defaultThesis, note },
        [storageKeys.watchlist]: watchlist,
        [storageKeys.lastSecurity]: {
          fetchedAt: Date.now(),
          security: makeSnapshot('IBM'),
        },
      },
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
    await harness.mockResearch({ json: researchResponse('IBM') })
    await harness.mockRecommendations((_route, rawBody) => {
      const body = rawBody as {
        thesis: { note?: string }
        candidates: Array<{
          symbol: string
          evidence: Array<{ id: string; text: string }>
        }>
      }
      expect(body.thesis.note).toBe(note)
      expect(body.candidates).toHaveLength(5)
      expect(body.candidates.map((candidate) => candidate.symbol)).not.toContain(
        'AAPL',
      )
      expect(body.candidates.map((candidate) => candidate.symbol)).not.toContain(
        'IBM',
      )
      return { json: recommendationResponse(body) }
    })

    await harness.goto()
    await page.getByRole('button', { name: 'Discover' }).click()
    await expect(
      page.getByText('No recommendation spend happens on page load.'),
    ).toBeVisible()
    expect(harness.recommendationRequests).toHaveLength(0)

    await page.getByRole('button', { name: 'Refresh ideas' }).click()

    await expect(page.locator('.discover-card')).toHaveCount(5)
    await expect(page.getByText('Model opinions available')).toBeVisible()
    await expect(page.getByText('Fits thesis').first()).toBeVisible()
    await expect(page.getByText('Thesis rationale').first()).toBeVisible()
    await expect(page.getByText('Main concern').first()).toBeVisible()
    await expect(page.getByText('What to research next').first()).toBeVisible()
    await page.locator('.discover-card').first().getByText('Sources (1)').click()
    await expect(
      page.locator('.discover-card').first().getByText(/Supporting evidence/),
    ).toBeVisible()
    await expect(page.locator('.discover-card', { hasText: 'AAPL' })).toHaveCount(0)
    await expect(page.locator('.discover-card', { hasText: 'IBM' })).toHaveCount(0)
    await expect(page.getByText(/AI evidence/i)).toHaveCount(0)
  })

  test('restores the cached shortlist and enforces the manual refresh cooldown', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
    await harness.mockRecommendations((_route, rawBody) => ({
      json: recommendationResponse(
        rawBody as Parameters<typeof recommendationResponse>[0],
      ),
    }))
    await harness.goto()
    await page.getByRole('button', { name: 'Discover' }).click()
    await page.getByRole('button', { name: 'Refresh ideas' }).click()
    await expect(page.locator('.discover-card')).toHaveCount(5)
    const recommendationCalls = harness.recommendationRequests.length

    await page.reload()
    await page.getByRole('button', { name: 'Discover' }).click()
    await expect(page.locator('.discover-card')).toHaveCount(5)
    expect(harness.recommendationRequests).toHaveLength(recommendationCalls)
    const providerCalls = harness.finnhubRequests.length

    await page.getByRole('button', { name: 'Refresh ideas' }).click()
    await expect(page.getByText(/Refresh is cooling down/)).toBeVisible()
    expect(harness.finnhubRequests).toHaveLength(providerCalls)
    expect(harness.recommendationRequests).toHaveLength(recommendationCalls)
  })

  test('keeps five usable cards when one provider candidate fails', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    harness.expectHttpFailure('finnhub.io/api/v1/quote', 502)
    await harness.mockFinnhub({
      failures: { 'quote:MSFT': 502 },
    })
    await harness.mockRecommendations((_route, rawBody) => ({
      json: recommendationResponse(
        rawBody as Parameters<typeof recommendationResponse>[0],
      ),
    }))
    await harness.goto()
    await page.getByRole('button', { name: 'Discover' }).click()
    await page.getByRole('button', { name: 'Refresh ideas' }).click()

    await expect(page.locator('.discover-card')).toHaveCount(5)
    await expect(page.getByText(/Showing partial results; 1 provider request/)).toBeVisible()
    await expect(page.locator('.discover-card', { hasText: 'MSFT' })).toHaveCount(0)
  })

  test('rejects an invented model candidate and falls back deterministically', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
    await harness.mockRecommendations((_route, rawBody) => {
      const response = recommendationResponse(
        rawBody as Parameters<typeof recommendationResponse>[0],
      )
      response.rankings[0].symbol = 'FAKE'
      return { json: response }
    })
    await harness.goto()
    await page.getByRole('button', { name: 'Discover' }).click()
    await page.getByRole('button', { name: 'Refresh ideas' }).click()

    await expect(page.locator('.discover-card')).toHaveCount(5)
    await expect(
      page.getByText('Model unavailable · deterministic fallback'),
    ).toBeVisible()
    await expect(page.getByText('Deterministic comparison').first()).toBeVisible()
    await expect(page.getByText('FAKE')).toHaveCount(0)
  })

  test('keeps deterministic cards when the model is rate limited', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    harness.expectHttpFailure('/api/recommendation-intelligence', 429)
    await harness.mockFinnhub()
    await harness.mockRecommendations({
      status: 429,
      json: {
        error: 'Recommendation intelligence limit reached.',
        code: 'INTELLIGENCE_LIMIT_REACHED',
        retryable: true,
      },
    })
    await harness.goto()
    await page.getByRole('button', { name: 'Discover' }).click()
    await page.getByRole('button', { name: 'Refresh ideas' }).click()

    await expect(page.locator('.discover-card')).toHaveCount(5)
    await expect(
      page.getByText('Model limit reached · deterministic fallback'),
    ).toBeVisible()
    await expect(page.getByText('Deterministic comparison').first()).toBeVisible()
  })
})
