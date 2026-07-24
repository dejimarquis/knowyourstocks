import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { defaultThesis } from '../domain/thesis'
import { createWatchlistItem, emptyWatchlist } from '../domain/watchlist'
import { scoreSecurity } from '../scoring/scoreSecurity'
import { addWatchlistItem } from '../storage/watchlistStorage'
import { reviewWatchlist } from './reviewWatchlist'

vi.mock('../data/finnhub', () => ({
  refreshFinnhubSecurity: vi.fn(async (existing: SecuritySnapshot) => ({
    ...existing,
    price: 110,
    previousClose: 100,
    changePercent: 10,
    revenueGrowth: 0.2,
  })),
  fetchFinnhubEarningsCalendar: vi.fn(
    async () => new Map([['TEST', '2026-07-30']]),
  ),
  fetchFinnhubSentiment: vi.fn(async () => ({
    score: 0.25,
    articleCount: 8,
    source: 'Finnhub',
  })),
}))

vi.mock('../data/sec', () => ({
  enrichWithSecFallback: vi.fn(async (security: SecuritySnapshot) => security),
}))

const snapshot: SecuritySnapshot = {
  symbol: 'TEST',
  name: 'Test Company',
  exchange: 'NASDAQ',
  sector: 'Technology',
  industry: 'Software',
  price: 100,
  previousClose: 99,
  changePercent: 1,
  latestTradingDay: '2026-07-22',
  marketCap: 10_000_000_000,
  peRatio: 20,
  priceToBook: 3,
  dividendYield: null,
  eps: 5,
  profitMargin: 0.2,
  returnOnEquity: 0.25,
  revenueGrowth: 0.1,
  earningsGrowth: 0.1,
  beta: 1,
  week52High: 120,
  week52Low: 80,
  source: 'Finnhub',
}

describe('reviewWatchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves the previous snapshot and adds review context', async () => {
    const item = createWatchlistItem(
      snapshot,
      scoreSecurity(snapshot, defaultThesis),
    )
    const watchlist = addWatchlistItem(emptyWatchlist, item)
    const reviewed = await reviewWatchlist(
      watchlist,
      defaultThesis,
      'personal-key',
      new Date('2026-07-23T12:00:00Z'),
    )
    const reviewedItem = reviewed.items[0]

    expect(reviewed.lastReviewAt).toBe('2026-07-23T12:00:00.000Z')
    expect(reviewedItem.previousSnapshot?.price).toBe(100)
    expect(reviewedItem.currentSnapshot.price).toBe(110)
    expect(reviewedItem.earningsDate).toBe('2026-07-30')
    expect(reviewedItem.sentiment?.score).toBe(0.25)
    expect(reviewedItem.reviewError).toBeNull()
  })

  it('requires a personal key', async () => {
    await expect(
      reviewWatchlist(emptyWatchlist, defaultThesis, ''),
    ).rejects.toThrow('Add your Finnhub key')
  })
})
