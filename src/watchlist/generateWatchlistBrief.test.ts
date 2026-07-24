import { describe, expect, it } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { defaultThesis } from '../domain/thesis'
import {
  createWatchlistItem,
  emptyWatchlist,
  type Watchlist,
} from '../domain/watchlist'
import { scoreSecurity } from '../scoring/scoreSecurity'
import {
  generateWatchlistBrief,
  getWeeklyReviewKey,
  isWeeklyReviewDue,
} from './generateWatchlistBrief'

const snapshot = (
  symbol: string,
  overrides: Partial<SecuritySnapshot> = {},
): SecuritySnapshot => ({
  symbol,
  name: `${symbol} Company`,
  exchange: 'NASDAQ',
  sector: 'Semiconductors',
  industry: 'Semiconductors',
  price: 100,
  previousClose: 99,
  changePercent: 1,
  latestTradingDay: '2026-07-23',
  marketCap: 20_000_000_000,
  peRatio: 20,
  priceToBook: 3,
  dividendYield: null,
  eps: 5,
  profitMargin: 0.2,
  returnOnEquity: 0.25,
  revenueGrowth: 0.15,
  earningsGrowth: 0.1,
  beta: 1,
  week52High: 120,
  week52Low: 80,
  source: 'Test',
  ...overrides,
})

describe('generateWatchlistBrief', () => {
  it('detects fit decline, price movement, and an upcoming earnings date', () => {
    const previous = snapshot('TEST')
    const current = snapshot('TEST', {
      changePercent: -8,
      profitMargin: -0.05,
      revenueGrowth: -0.05,
    })
    const item = {
      ...createWatchlistItem(
        current,
        scoreSecurity(current, defaultThesis),
        new Date('2026-07-01T00:00:00Z'),
      ),
      previousSnapshot: previous,
      previousFit: scoreSecurity(previous, defaultThesis),
      earningsDate: '2026-07-28',
    }
    const watchlist: Watchlist = {
      ...emptyWatchlist,
      items: [item],
      lastReviewAt: '2026-07-23T00:00:00Z',
    }

    const brief = generateWatchlistBrief(
      watchlist,
      new Date('2026-07-23T00:00:00Z'),
    )
    const types = brief.deterministicInsights.map((insight) => insight.type)

    expect(types).toContain('fit_change')
    expect(types).toContain('price_move')
    expect(types).toContain('fundamental_change')
    expect(types).toContain('earnings')
  })

  it('detects watchlist concentration', () => {
    const items = ['A', 'B', 'C', 'D'].map((symbol) => {
      const current = snapshot(symbol)
      return createWatchlistItem(
        current,
        scoreSecurity(current, defaultThesis),
      )
    })
    const brief = generateWatchlistBrief({
      ...emptyWatchlist,
      items,
    })

    expect(
      brief.deterministicInsights.some(
        (insight) => insight.type === 'concentration',
      ),
    ).toBe(true)
  })

  it('tracks whether the current week needs a review', () => {
    const date = new Date('2026-07-23T12:00:00Z')
    const weekKey = getWeeklyReviewKey(date)

    expect(weekKey).toBe('2026-07-20')
    expect(isWeeklyReviewDue(emptyWatchlist, date)).toBe(true)
    expect(
      isWeeklyReviewDue(
        { ...emptyWatchlist, lastWeeklyReviewKey: weekKey },
        date,
      ),
    ).toBe(false)
  })

  it('surfaces lost fit coverage and stale fundamentals', () => {
    const previous = snapshot('TEST')
    const current = snapshot('TEST', {
      fundamentalsAsOf: '2025-01-01',
      marketCap: null,
      peRatio: null,
      eps: null,
      profitMargin: null,
      returnOnEquity: null,
      revenueGrowth: null,
      earningsGrowth: null,
      beta: null,
    })
    const item = {
      ...createWatchlistItem(
        current,
        scoreSecurity(current, defaultThesis),
      ),
      previousSnapshot: previous,
      previousFit: scoreSecurity(previous, defaultThesis),
    }

    const brief = generateWatchlistBrief(
      {
        ...emptyWatchlist,
        items: [item],
      },
      new Date('2026-07-23T00:00:00Z'),
    )

    expect(
      brief.deterministicInsights.some(
        (value) =>
          value.type === 'fit_change' &&
          value.title.includes('coverage weakened'),
      ),
    ).toBe(true)
    expect(
      brief.deterministicInsights.some(
        (value) =>
          value.type === 'stale_data' &&
          value.summary.includes('fundamentals'),
      ),
    ).toBe(true)
  })
})
