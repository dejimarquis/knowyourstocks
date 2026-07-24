import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { defaultThesis } from '../domain/thesis'
import {
  createWatchlistItem,
  emptyWatchlist,
  type Watchlist,
} from '../domain/watchlist'
import { scoreSecurity } from '../scoring/scoreSecurity'
import { WatchlistPanel } from './WatchlistPanel'

const snapshot: SecuritySnapshot = {
  symbol: 'TEST',
  name: 'Test Company',
  exchange: 'NASDAQ',
  sector: 'Technology',
  industry: 'Software',
  price: 100,
  previousClose: 99,
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
  earningsGrowth: 0.1,
  beta: 1,
  week52High: 120,
  week52Low: 80,
  source: 'Test',
}

const watchlist = (status: 'generated' | 'fallback'): Watchlist => ({
  ...emptyWatchlist,
  items: [
    createWatchlistItem(
      snapshot,
      scoreSecurity(snapshot, defaultThesis),
      new Date('2026-07-23T12:00:00Z'),
    ),
  ],
  lastReviewAt: '2026-07-23T12:00:00.000Z',
  latestBrief: {
    generatedAt: '2026-07-23T12:00:00.000Z',
    reviewType: 'manual',
    deterministicInsights: [],
    experimentalInsights: [],
    stableSymbols: ['TEST'],
    errors: [],
    prioritizedSignalIds: [],
    prioritizedEvidenceIds: [],
    aiSummary:
      status === 'generated'
        ? 'Current evidence remains consistent with the saved thesis.'
        : null,
    aiAssessments:
      status === 'generated'
        ? [
            {
              symbol: 'TEST',
              score: 76,
              opinion: 'Promising but mixed',
              summary: 'Quality evidence is positive while valuation is mixed.',
              strengths: [
                {
                  evidenceId: 'stock-evidence:test:growth-quality',
                  text: 'Revenue growth is 15%.',
                },
              ],
              risks: [
                {
                  evidenceId: 'stock-evidence:test:valuation-balance',
                  text: 'P/E is 20.',
                },
              ],
              confidence: 'medium',
            },
          ]
        : [],
    crossStockPatterns: [],
    aiUncertainties: [],
    modelStatus: status,
  },
})

const renderPanel = (value: Watchlist) =>
  render(
    <WatchlistPanel
      onEnablePhiChange={vi.fn()}
      onInsightFeedback={vi.fn()}
      onRemove={vi.fn()}
      onResearch={vi.fn()}
      onReview={vi.fn()}
      reviewError={null}
      reviewStatus="idle"
      watchlist={value}
    />,
  )

afterEach(cleanup)

describe('WatchlistPanel', () => {
  it('renders the per-stock evidence assessment after a generated review', () => {
    renderPanel(watchlist('generated'))

    expect(screen.getByText('76/100 · Promising but mixed')).toBeInTheDocument()
    expect(
      screen.getByText('Quality evidence is positive while valuation is mixed.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Revenue growth is 15%.')).toBeInTheDocument()
    expect(screen.getByText('P/E is 20.')).toBeInTheDocument()
    expect(
      screen.getByText(/Evidence assessment only\. This is not a trade recommendation/),
    ).toBeInTheDocument()
  })

  it('does not imply an AI assessment exists after fallback', () => {
    renderPanel(watchlist('fallback'))

    expect(
      screen.getByText(/no AI assessment was generated/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/\/100/)).not.toBeInTheDocument()
  })
})
