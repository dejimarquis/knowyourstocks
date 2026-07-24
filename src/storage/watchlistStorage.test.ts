import { beforeEach, describe, expect, it } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import {
  createWatchlistItem,
  emptyWatchlist,
  watchlistLimit,
} from '../domain/watchlist'
import { scoreSecurity } from '../scoring/scoreSecurity'
import { defaultThesis } from '../domain/thesis'
import {
  addWatchlistItem,
  loadWatchlist,
  removeWatchlistItem,
  saveWatchlist,
} from './watchlistStorage'

const security = (index: number): SecuritySnapshot => ({
  symbol: `T${index}`,
  name: `Test ${index}`,
  exchange: 'NASDAQ',
  sector: 'Technology',
  industry: 'Software',
  price: 100 + index,
  previousClose: 99 + index,
  changePercent: 1,
  latestTradingDay: '2026-07-23',
  marketCap: 10_000_000_000,
  peRatio: 20,
  priceToBook: 3,
  dividendYield: null,
  eps: 5,
  profitMargin: 0.2,
  returnOnEquity: 0.25,
  revenueGrowth: 0.15,
  earningsGrowth: 0.12,
  beta: 1,
  week52High: 120,
  week52Low: 80,
  source: 'Test',
})

describe('watchlistStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('adds, persists, and removes a watchlist item', () => {
    const snapshot = security(1)
    const item = createWatchlistItem(
      snapshot,
      scoreSecurity(snapshot, defaultThesis),
    )
    const watchlist = addWatchlistItem(emptyWatchlist, item)

    saveWatchlist(watchlist)

    expect(loadWatchlist().watchlist.items).toHaveLength(1)
    expect(removeWatchlistItem(watchlist, snapshot.symbol).items).toHaveLength(0)
  })

  it('prevents duplicates', () => {
    const snapshot = security(1)
    const item = createWatchlistItem(
      snapshot,
      scoreSecurity(snapshot, defaultThesis),
    )
    const watchlist = addWatchlistItem(emptyWatchlist, item)

    expect(addWatchlistItem(watchlist, item)).toBe(watchlist)
  })

  it('enforces the 25-security limit', () => {
    let watchlist = emptyWatchlist

    for (let index = 0; index < watchlistLimit; index += 1) {
      const snapshot = security(index)
      watchlist = addWatchlistItem(
        watchlist,
        createWatchlistItem(snapshot, scoreSecurity(snapshot, defaultThesis)),
      )
    }

    const extraSnapshot = security(watchlistLimit + 1)

    expect(() =>
      addWatchlistItem(
        watchlist,
        createWatchlistItem(
          extraSnapshot,
          scoreSecurity(extraSnapshot, defaultThesis),
        ),
      ),
    ).toThrow(`Watchlists are limited to ${watchlistLimit} securities.`)
  })
})
