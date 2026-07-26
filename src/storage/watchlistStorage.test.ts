import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('migrates older local watchlists and fills new review fields', () => {
    const snapshot = security(1)
    const item = createWatchlistItem(
      snapshot,
      scoreSecurity(snapshot, defaultThesis),
    )
    window.localStorage.setItem(
      'knowyourstocks.watchlist',
      JSON.stringify({
        version: 1,
        items: [
          {
            ...item,
            currentSnapshot: {
              ...item.currentSnapshot,
              operatingMargin: undefined,
              freeCashFlow: undefined,
              debtToEquity: undefined,
              currentRatio: undefined,
              fundamentalsAsOf: undefined,
              metricProvenance: undefined,
            },
          },
        ],
        lastReviewAt: null,
        lastWeeklyReviewKey: null,
        latestBrief: {
          generatedAt: '2026-07-23T12:00:00.000Z',
          reviewType: 'manual',
          deterministicInsights: [],
          experimentalInsights: [],
          stableSymbols: ['T1'],
          errors: [],
          aiSummary: 'Legacy score-bearing summary.',
          aiAssessments: [
            {
              symbol: 'T1',
              score: 88,
              opinion: 'Compelling',
              summary: 'Legacy assessment.',
              strengths: [],
              risks: [],
              confidence: 'high',
            },
          ],
          modelStatus: 'generated',
        },
        modelPreferences: {
          includeThesisNote: false,
        },
      }),
    )

    const result = loadWatchlist()

    expect(result.recoveryRequired).toBe(false)
    expect(result.watchlist.version).toBe(3)
    expect(result.watchlist.modelPreferences.enablePhi).toBe(true)
    expect(result.watchlist.items[0].currentSnapshot).toMatchObject({
      operatingMargin: null,
      freeCashFlow: null,
      debtToEquity: null,
      currentRatio: null,
      fundamentalsAsOf: null,
      metricProvenance: {},
    })
    expect(result.watchlist.latestBrief).toMatchObject({
      prioritizedSignalIds: [],
      prioritizedEvidenceIds: [],
      prioritizedEvidence: [],
      modelOverallOpinion: null,
      modelOverallSummary: null,
      stockOpinions: [],
      crossStockPatterns: [],
      modelStatus: 'not_requested',
    })
    expect(result.watchlist.insightFeedback).toEqual({})
    expect(
      JSON.parse(
        window.localStorage.getItem('knowyourstocks.watchlist') ?? '{}',
      ).version,
    ).toBe(3)
    expect(
      window.localStorage.getItem('knowyourstocks.watchlist'),
    ).not.toContain('aiAssessments')
    expect(
      window.localStorage.getItem('knowyourstocks.watchlist'),
    ).not.toContain('"score":88')
  })

  it('still rejects malformed stored watchlists after migration', () => {
    window.localStorage.setItem(
      'knowyourstocks.watchlist',
      JSON.stringify({ version: 1, items: 'not-an-array' }),
    )

    expect(loadWatchlist()).toEqual({
      watchlist: emptyWatchlist,
      recoveryRequired: true,
    })
  })

  it('keeps a valid migrated watchlist when the persistence write fails', () => {
    const snapshot = security(1)
    const item = createWatchlistItem(
      snapshot,
      scoreSecurity(snapshot, defaultThesis),
    )
    window.localStorage.setItem(
      'knowyourstocks.watchlist',
      JSON.stringify({
        ...emptyWatchlist,
        version: 1,
        items: [item],
      }),
    )
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage full')
      })

    const result = loadWatchlist()

    expect(result.recoveryRequired).toBe(false)
    expect(result.watchlist.items).toHaveLength(1)
    setItem.mockRestore()
  })
})
