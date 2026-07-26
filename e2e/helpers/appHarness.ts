import {
  expect,
  test as base,
  type Page,
  type Request,
  type Route,
} from '@playwright/test'

export const storageKeys = {
  thesis: 'knowyourstocks.thesis',
  watchlist: 'knowyourstocks.watchlist',
  lastSecurity: 'knowyourstocks.lastSecurity.v2',
  discoverCache: 'knowyourstocks.discoverCache',
  discoverCooldown: 'knowyourstocks.discoverCooldown',
  finnhubKey: 'knowyourstocks.finnhubKey',
  researchCachePrefix: 'knowyourstocks.researchIntelligence.v2',
} as const

export const defaultThesis = {
  version: 1,
  sectors: ['ai', 'technology'],
  horizon: 'seven-plus',
  risk: 'balanced',
  style: 'quality',
  note: '',
}

export type Snapshot = {
  symbol: string
  name: string
  exchange: string | null
  sector: string | null
  industry: string | null
  price: number
  previousClose: number | null
  changePercent: number | null
  latestTradingDay: string
  marketCap: number | null
  peRatio: number | null
  priceToBook: number | null
  dividendYield: number | null
  eps: number | null
  profitMargin: number | null
  returnOnEquity: number | null
  revenueGrowth: number | null
  earningsGrowth: number | null
  operatingMargin: number | null
  freeCashFlow: number | null
  debtToEquity: number | null
  currentRatio: number | null
  beta: number | null
  week52High: number | null
  week52Low: number | null
  fundamentalsAsOf: string | null
  metricProvenance: Record<
    string,
    {
      source: 'Alpha Vantage' | 'Finnhub' | 'SEC EDGAR'
      asOf: string | null
      period: string
    }
  >
  source: string
}

const names: Record<string, string> = {
  AAPL: 'Apple',
  MSFT: 'Microsoft',
  NVDA: 'NVIDIA',
  AMD: 'Advanced Micro Devices',
  AVGO: 'Broadcom',
  ORCL: 'Oracle',
  CRM: 'Salesforce',
  ADBE: 'Adobe',
  IBM: 'International Business Machines',
  TEST: 'Test Company',
}

export const makeSnapshot = (
  symbol = 'IBM',
  overrides: Partial<Snapshot> = {},
): Snapshot => ({
  symbol,
  name: names[symbol] ?? `${symbol} Company`,
  exchange: symbol === 'IBM' ? 'NYSE' : 'NASDAQ',
  sector: 'Technology',
  industry: 'Software',
  price: symbol === 'IBM' ? 206.5 : 150,
  previousClose: symbol === 'IBM' ? 205.77 : 149,
  changePercent: 0.5,
  latestTradingDay: '2026-07-23',
  marketCap: 100_000_000_000,
  peRatio: 24,
  priceToBook: 5,
  dividendYield: 0.01,
  eps: 5,
  profitMargin: 0.2,
  returnOnEquity: 0.25,
  revenueGrowth: 0.15,
  earningsGrowth: 0.12,
  operatingMargin: 0.22,
  freeCashFlow: 5_000_000_000,
  debtToEquity: 0.5,
  currentRatio: 1.5,
  beta: 1,
  week52High: 220,
  week52Low: 120,
  fundamentalsAsOf: '2026-06-30',
  metricProvenance: {
    profitMargin: {
      source: 'Finnhub',
      asOf: '2026-06-30',
      period: 'trailing-twelve-months',
    },
    revenueGrowth: {
      source: 'Finnhub',
      asOf: '2026-06-30',
      period: 'trailing-twelve-months',
    },
    operatingMargin: {
      source: 'Finnhub',
      asOf: '2026-06-30',
      period: 'trailing-twelve-months',
    },
  },
  source: 'Finnhub',
  ...overrides,
})

export const makeFit = (total = 84) => ({
  total,
  label: total >= 80 ? 'Strong match' : total >= 55 ? 'Moderate match' : 'Limited match',
  factors: [
    {
      key: 'sector',
      label: 'Theme fit',
      earned: 20,
      maximum: 20,
      evidence: 'Technology matches your selected themes.',
      available: true,
    },
    {
      key: 'quality',
      label: 'Business quality',
      earned: 20,
      maximum: 25,
      evidence: 'Profitability and returns are positive.',
      available: true,
    },
    {
      key: 'growth',
      label: 'Growth',
      earned: 15,
      maximum: 20,
      evidence: 'Revenue and earnings are growing.',
      available: true,
    },
    {
      key: 'valuation',
      label: 'Valuation',
      earned: 8,
      maximum: 15,
      evidence: 'Valuation is mixed.',
      available: true,
    },
    {
      key: 'risk',
      label: 'Risk fit',
      earned: 10,
      maximum: 10,
      evidence: 'Beta is near the market.',
      available: true,
    },
    {
      key: 'preference',
      label: 'Style fit',
      earned: 10,
      maximum: 10,
      evidence: 'Quality aligns with your style.',
      available: true,
    },
  ],
  missing: [],
})

export const makeWatchlistItem = (
  symbol = 'IBM',
  overrides: Record<string, unknown> = {},
) => {
  const snapshot = makeSnapshot(symbol)
  return {
    symbol,
    name: snapshot.name,
    addedAt: '2026-07-01T12:00:00.000Z',
    lastReviewedAt: '2026-07-01T12:00:00.000Z',
    currentSnapshot: snapshot,
    previousSnapshot: null,
    currentFit: makeFit(),
    previousFit: null,
    earningsDate: null,
    sentiment: null,
    previousSentiment: null,
    reviewError: null,
    ...overrides,
  }
}

export const emptyWatchlist = {
  version: 3,
  items: [],
  lastReviewAt: null,
  lastWeeklyReviewKey: null,
  latestBrief: null,
  modelPreferences: { enablePhi: true },
  insightFeedback: {},
}

const citation = (symbol: string, evidenceId: string, text: string) => ({
  evidenceId,
  symbol,
  text,
})

const claim = (symbol: string, text: string, evidenceId: string) => ({
  text,
  citationIds: [evidenceId],
  citations: [citation(symbol, evidenceId, `Verified ${symbol} evidence.`)],
})

export const researchResponse = (
  symbol = 'IBM',
  overrides: Record<string, unknown> = {},
) => ({
  opinion: 'Mixed',
  headline: `${symbol} quality supports the thesis while valuation needs attention.`,
  reasoningSummary: claim(
    symbol,
    'The grounded evidence supports the thesis with important constraints.',
    'fit:quality',
  ),
  whyItFits: [
    claim(symbol, 'Quality evidence is supportive.', 'fit:quality'),
  ],
  concerns: [
    claim(symbol, 'Valuation remains a constraint.', 'fit:valuation'),
  ],
  whatToWatchNext: [
    claim(
      symbol,
      'Review operating margin in the next filing.',
      'metric:operatingMargin',
    ),
  ],
  confidence: 'high',
  uncertainty: claim(
    symbol,
    'Future operating performance remains uncertain.',
    'metric:operatingMargin',
  ),
  ...overrides,
})

export const watchlistIntelligenceResponse = (
  body: {
    stocks: Array<{
      symbol: string
      evidence: Array<{ id: string; text: string }>
    }>
    deterministicSignals: Array<{ id: string }>
  },
  withPattern = false,
) => {
  const first = body.stocks[0]
  const firstEvidence = first.evidence[0]
  const firstCitation = citation(
    first.symbol,
    firstEvidence.id,
    firstEvidence.text,
  )
  return {
    overallOpinion: 'Mixed',
    overallSummary: {
      text: 'Current evidence remains consistent with the saved thesis.',
      citationIds: [firstEvidence.id],
      citations: [firstCitation],
    },
    prioritizedSignalIds: body.deterministicSignals.map((signal) => signal.id),
    prioritizedEvidenceIds: [firstEvidence.id],
    prioritizedEvidence: [firstCitation],
    stocks: body.stocks.map((stock) => ({
      symbol: stock.symbol,
      opinion: 'Mixed',
      whatChanged: claim(
        stock.symbol,
        body.deterministicSignals.some((signal) =>
          signal.id.toLowerCase().includes(stock.symbol.toLowerCase()),
        )
          ? 'Verified signals changed materially'
          : 'No material change',
        stock.evidence.find((evidence) => evidence.id.endsWith(':context'))?.id ??
          stock.evidence[0].id,
      ),
      whyItFits: [
        claim(
          stock.symbol,
          'Growth and quality evidence supports the thesis.',
          stock.evidence[0].id,
        ),
      ],
      concerns: [
        claim(
          stock.symbol,
          'Valuation and balance-sheet evidence is mixed.',
          stock.evidence[1]?.id ?? stock.evidence[0].id,
        ),
      ],
      whatToWatchNext: [
        claim(
          stock.symbol,
          'Review the next filing.',
          stock.evidence.at(-1)?.id ?? stock.evidence[0].id,
        ),
      ],
      confidence: 'medium',
    })),
    crossStockPatterns:
      withPattern && body.stocks.length >= 2
        ? [
            {
              title: 'Shared margin sensitivity',
              summary: 'Margins are the main shared evidence gap.',
              citationIds: [
                body.stocks[0].evidence[0].id,
                body.stocks[1].evidence[0].id,
              ],
              citations: [
                citation(
                  body.stocks[0].symbol,
                  body.stocks[0].evidence[0].id,
                  body.stocks[0].evidence[0].text,
                ),
                citation(
                  body.stocks[1].symbol,
                  body.stocks[1].evidence[0].id,
                  body.stocks[1].evidence[0].text,
                ),
              ],
              confidence: 'medium',
            },
          ]
        : [],
  }
}

type ExpectedFailure = {
  pattern: string | RegExp
  status?: number
  observed: number
}

class NetworkSentinel {
  private readonly browserErrors: string[] = []
  private readonly httpFailures: Array<{ url: string; status: number }> = []
  private readonly requestFailures: Array<{ url: string; error: string }> = []
  private readonly expectedHttp: ExpectedFailure[] = []
  private readonly expectedRequests: ExpectedFailure[] = []

  constructor(page: Page) {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        this.browserErrors.push(message.text())
      }
    })
    page.on('pageerror', (error) => this.browserErrors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400) {
        this.httpFailures.push({
          url: response.url(),
          status: response.status(),
        })
      }
    })
    page.on('requestfailed', (request) => {
      this.requestFailures.push({
        url: request.url(),
        error: request.failure()?.errorText ?? 'unknown request failure',
      })
    })
  }

  expectHttpFailure(pattern: string | RegExp, status: number) {
    this.expectedHttp.push({ pattern, status, observed: 0 })
  }

  expectRequestFailure(pattern: string | RegExp) {
    this.expectedRequests.push({ pattern, observed: 0 })
  }

  private matches(value: string, pattern: string | RegExp) {
    return typeof pattern === 'string' ? value.includes(pattern) : pattern.test(value)
  }

  assertClean() {
    for (const failure of this.httpFailures) {
      const expected = this.expectedHttp.find(
        (candidate) =>
          candidate.status === failure.status &&
          this.matches(failure.url, candidate.pattern),
      )
      expect(
        expected,
        `Unexpected HTTP failure: ${failure.status} ${failure.url}`,
      ).toBeTruthy()
      if (expected) {
        expected.observed += 1
      }
    }
    for (const failure of this.requestFailures) {
      const expected = this.expectedRequests.find((candidate) =>
        this.matches(failure.url, candidate.pattern),
      )
      expect(
        expected,
        `Unexpected request failure: ${failure.url} (${failure.error})`,
      ).toBeTruthy()
      if (expected) {
        expected.observed += 1
      }
    }
    for (const expected of [...this.expectedHttp, ...this.expectedRequests]) {
      expect(
        expected.observed,
        `Expected mocked failure was not observed: ${String(expected.pattern)}`,
      ).toBeGreaterThan(0)
    }
    const unexpectedBrowserErrors = this.browserErrors.filter((message) => {
      const status = message.match(/status of (\d{3})/)?.[1]
      if (
        status &&
        this.expectedHttp.some(
          (expected) =>
            expected.status === Number(status) && expected.observed > 0,
        )
      ) {
        return false
      }
      if (
        message.includes('net::ERR_FAILED') &&
        this.expectedRequests.some((expected) => expected.observed > 0)
      ) {
        return false
      }
      return true
    })
    expect(unexpectedBrowserErrors, 'Browser console/page errors').toEqual([])
  }
}

type RouteResult = {
  status?: number
  json?: unknown
  body?: string
}

export class AppHarness {
  readonly researchRequests: unknown[] = []
  readonly recommendationRequests: unknown[] = []
  readonly watchlistRequests: unknown[] = []
  readonly finnhubRequests: Array<{ path: string; symbol: string | null }> = []

  constructor(
    readonly page: Page,
    private readonly sentinel: NetworkSentinel,
  ) {}

  expectHttpFailure(pattern: string | RegExp, status: number) {
    this.sentinel.expectHttpFailure(pattern, status)
  }

  expectRequestFailure(pattern: string | RegExp) {
    this.sentinel.expectRequestFailure(pattern)
  }

  async seedStorage({
    local = {},
    session = {},
  }: {
    local?: Record<string, unknown>
    session?: Record<string, unknown>
  }) {
    const id = crypto.randomUUID()
    await this.page.addInitScript(
      ({ localValues, sessionValues, marker }) => {
        if (window.sessionStorage.getItem(marker)) {
          return
        }
        for (const [key, value] of Object.entries(localValues)) {
          window.localStorage.setItem(
            key,
            typeof value === 'string' ? value : JSON.stringify(value),
          )
        }
        for (const [key, value] of Object.entries(sessionValues)) {
          window.sessionStorage.setItem(
            key,
            typeof value === 'string' ? value : JSON.stringify(value),
          )
        }
        window.sessionStorage.setItem(marker, '1')
      },
      {
        localValues: local,
        sessionValues: session,
        marker: `__e2e_seed_${id}`,
      },
    )
  }

  async goto() {
    await this.page.goto('/')
  }

  async openDataAccessWithKey(key = 'e2e-finnhub-key') {
    await this.page.getByText('Data access', { exact: true }).click()
    await this.page.getByLabel('Free Finnhub key').fill(key)
  }

  async research(symbol: string) {
    await this.page.getByLabel('Company or ticker').fill(symbol)
    await this.page
      .getByRole('button', { name: /^(Search|Refresh)$/ })
      .click()
    await expect(
      this.page.getByRole('heading', {
        name: names[symbol] ?? `${symbol} Company`,
      }),
    ).toBeVisible()
  }

  async mockFinnhub(options: {
    snapshots?: Record<string, Partial<Snapshot>>
    failures?: Record<string, number>
    peers?: string[]
    earnings?: Array<{ symbol: string; date: string }>
  } = {}) {
    const { snapshots = {}, failures = {}, peers = [], earnings = [] } = options
    await this.page.route('https://finnhub.io/api/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname.replace('/api/v1/', '')
      const symbol = url.searchParams.get('symbol')
      this.finnhubRequests.push({ path, symbol })
      const failureStatus =
        failures[`${path}:${symbol ?? ''}`] ?? failures[path] ?? undefined
      if (failureStatus) {
        await route.fulfill({
          status: failureStatus,
          json: { error: `Intentional ${path} failure` },
        })
        return
      }
      const snapshot = makeSnapshot(symbol ?? 'IBM', snapshots[symbol ?? ''] ?? {})
      if (path === 'quote') {
        await route.fulfill({
          json: {
            c: snapshot.price,
            dp: snapshot.changePercent,
            pc: snapshot.previousClose,
            t: Date.parse(`${snapshot.latestTradingDay}T12:00:00Z`) / 1000,
          },
        })
        return
      }
      if (path === 'stock/profile2') {
        await route.fulfill({
          json: {
            exchange: snapshot.exchange ?? undefined,
            finnhubIndustry: snapshot.industry ?? undefined,
            marketCapitalization:
              snapshot.marketCap == null ? null : snapshot.marketCap / 1_000_000,
            name: snapshot.name,
            ticker: snapshot.symbol,
          },
        })
        return
      }
      if (path === 'stock/metric') {
        await route.fulfill({
          json: {
            metric: {
              beta: snapshot.beta,
              epsTTM: snapshot.eps,
              epsGrowthTTMYoy:
                snapshot.earningsGrowth == null
                  ? null
                  : snapshot.earningsGrowth * 100,
              freeCashFlowTTM:
                snapshot.freeCashFlow == null
                  ? null
                  : snapshot.freeCashFlow / 1_000_000,
              marketCapitalization:
                snapshot.marketCap == null
                  ? null
                  : snapshot.marketCap / 1_000_000,
              netProfitMarginTTM:
                snapshot.profitMargin == null
                  ? null
                  : snapshot.profitMargin * 100,
              operatingMarginTTM:
                snapshot.operatingMargin == null
                  ? null
                  : snapshot.operatingMargin * 100,
              peBasicExclExtraTTM: snapshot.peRatio,
              pbAnnual: snapshot.priceToBook,
              currentRatioQuarterly: snapshot.currentRatio,
              'totalDebt/totalEquityQuarterly':
                snapshot.debtToEquity == null
                  ? null
                  : snapshot.debtToEquity * 100,
              dividendYieldIndicatedAnnual:
                snapshot.dividendYield == null
                  ? null
                  : snapshot.dividendYield * 100,
              revenueGrowthTTMYoy:
                snapshot.revenueGrowth == null
                  ? null
                  : snapshot.revenueGrowth * 100,
              roeTTM:
                snapshot.returnOnEquity == null
                  ? null
                  : snapshot.returnOnEquity * 100,
              '52WeekHigh': snapshot.week52High,
              '52WeekLow': snapshot.week52Low,
            },
          },
        })
        return
      }
      if (path === 'stock/peers') {
        await route.fulfill({ json: peers })
        return
      }
      if (path === 'calendar/earnings') {
        await route.fulfill({ json: { earningsCalendar: earnings } })
        return
      }
      if (path === 'news-sentiment') {
        await route.fulfill({
          json: {
            sentiment: { bullishPercent: 0.6, bearishPercent: 0.4 },
            buzz: { articlesInLastWeek: 8 },
          },
        })
        return
      }
      await route.fulfill({ status: 404, json: { error: 'Unhandled Finnhub mock' } })
    })
  }

  async mockSec(
    handler:
      | RouteResult
      | ((symbol: string, request: Request) => RouteResult | Promise<RouteResult>),
  ) {
    await this.page.route('**/api/sec-fundamentals/**', async (route) => {
      const symbol = route.request().url().split('/').at(-1) ?? ''
      const result =
        typeof handler === 'function'
          ? await handler(symbol, route.request())
          : handler
      await route.fulfill(result)
    })
  }

  async mockResearch(
    handler:
      | RouteResult
      | ((
          route: Route,
          body: Record<string, unknown>,
          index: number,
        ) => RouteResult | void | Promise<RouteResult | void>),
  ) {
    await this.page.route('**/api/research-intelligence', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      const index = this.researchRequests.push(body) - 1
      const result =
        typeof handler === 'function'
          ? await handler(route, body, index)
          : handler
      if (result) {
        await route.fulfill(result)
      }
    })
  }

  async mockRecommendations(
    handler:
      | RouteResult
      | ((
          route: Route,
          body: Record<string, unknown>,
          index: number,
        ) => RouteResult | void | Promise<RouteResult | void>),
  ) {
    await this.page.route('**/api/recommendation-intelligence', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      const index = this.recommendationRequests.push(body) - 1
      const result =
        typeof handler === 'function'
          ? await handler(route, body, index)
          : handler
      if (result) {
        await route.fulfill(result)
      }
    })
  }

  async mockWatchlistIntelligence(
    handler:
      | RouteResult
      | ((
          route: Route,
          body: Record<string, unknown>,
          index: number,
        ) => RouteResult | void | Promise<RouteResult | void>),
  ) {
    await this.page.route('**/api/watchlist-intelligence', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      const index = this.watchlistRequests.push(body) - 1
      const result =
        typeof handler === 'function'
          ? await handler(route, body, index)
          : handler
      if (result) {
        await route.fulfill(result)
      }
    })
  }
}

export const recommendationResponse = (body: {
  candidates: Array<{
    symbol: string
    evidence: Array<{ id: string; text: string }>
  }>
}) => ({
  rankings: body.candidates.map((candidate, index) => {
    const source = candidate.evidence[0]
    return {
      symbol: candidate.symbol,
      opinion: index < 2 ? 'Fits thesis' : 'Mixed',
      thesisRationale: `${candidate.symbol} has thesis-aligned verified evidence.`,
      mainConcern: `${candidate.symbol} valuation deserves review.`,
      whatToResearchNext: `Read the next ${candidate.symbol} filing.`,
      confidence: index < 2 ? 'high' : 'medium',
      citationIds: [source.id],
      citations: [citation(candidate.symbol, source.id, source.text)],
    }
  }),
})

type Fixtures = {
  harness: AppHarness
  sentinel: NetworkSentinel
}

export const test = base.extend<Fixtures>({
  sentinel: [
    async ({ page }, provide) => {
      const sentinel = new NetworkSentinel(page)
      await provide(sentinel)
      sentinel.assertClean()
    },
    { auto: true },
  ],
  harness: async ({ page, sentinel }, provide) => {
    await provide(new AppHarness(page, sentinel))
  },
})

export { expect }
