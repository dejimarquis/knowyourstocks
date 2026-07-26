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
    prioritizedEvidenceIds:
      status === 'generated' ? ['stock-evidence:test:growth-quality'] : [],
    prioritizedEvidence:
      status === 'generated'
        ? [{
            evidenceId: 'stock-evidence:test:growth-quality',
            symbol: 'TEST',
            text: 'Revenue growth is 15%.',
          }]
        : [],
    modelOverallOpinion: status === 'generated' ? 'Mixed' : null,
    modelOverallSummary:
      status === 'generated'
        ? {
            text: 'Current evidence remains consistent with the saved thesis.',
            citationIds: ['stock-evidence:test:growth-quality'],
            citations: [{
              evidenceId: 'stock-evidence:test:growth-quality',
              symbol: 'TEST',
              text: 'Revenue growth is 15%.',
            }],
          }
        : null,
    stockOpinions:
      status === 'generated'
        ? [{
            symbol: 'TEST',
            opinion: 'Mixed',
            whatChanged: {
              text: 'No material change',
              citationIds: ['stock-evidence:test:context'],
              citations: [{
                evidenceId: 'stock-evidence:test:context',
                symbol: 'TEST',
                text: 'No stock-specific deterministic change signal.',
              }],
            },
            whyItFits: [{
              text: 'Quality evidence supports the thesis.',
              citationIds: ['stock-evidence:test:growth-quality'],
              citations: [{
                evidenceId: 'stock-evidence:test:growth-quality',
                symbol: 'TEST',
                text: 'Revenue growth is 15%.',
              }],
            }],
            concerns: [{
              text: 'Valuation remains mixed.',
              citationIds: ['stock-evidence:test:valuation-balance'],
              citations: [{
                evidenceId: 'stock-evidence:test:valuation-balance',
                symbol: 'TEST',
                text: 'P/E is 20.',
              }],
            }],
            whatToWatchNext: [{
              text: 'Review the next filing.',
              citationIds: ['stock-evidence:test:context'],
              citations: [{
                evidenceId: 'stock-evidence:test:context',
                symbol: 'TEST',
                text: 'Latest filing context.',
              }],
            }],
            confidence: 'medium',
          }]
        : [],
    crossStockPatterns:
      status === 'generated'
        ? [{
            title: 'Shared margin sensitivity',
            summary: 'Margins are the main shared evidence gap.',
            citationIds: ['stock-evidence:test:growth-quality', 'other:margin'],
            citations: [
              {
                evidenceId: 'stock-evidence:test:growth-quality',
                symbol: 'TEST',
                text: 'Revenue growth is 15%.',
              },
              {
                evidenceId: 'other:margin',
                symbol: 'OTHER',
                text: 'Operating margin evidence is incomplete.',
              },
            ],
            confidence: 'low',
          }]
        : [],
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
  it('renders overall and per-stock opinions with exact stable copy and citations', () => {
    renderPanel(watchlist('generated'))

    expect(screen.getAllByText('Mixed')).toHaveLength(2)
    expect(
      screen.getByText('Current evidence remains consistent with the saved thesis.'),
    ).toBeInTheDocument()
    expect(screen.getByText('No material change')).toBeInTheDocument()
    expect(screen.getByText('Quality evidence supports the thesis.')).toBeInTheDocument()
    expect(screen.getByText('Valuation remains mixed.')).toBeInTheDocument()
    expect(screen.getByText('Review the next filing.')).toBeInTheDocument()
    expect(
      screen
        .getAllByText(/Confidence:/)
        .find((element) => element.textContent?.includes('medium')),
    ).toHaveTextContent(
      'Confidence: medium. Research context only.',
    )
    expect(
      screen.getByText(/Research context only\. This is not a trade recommendation/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/\/100/)).not.toBeInTheDocument()
    expect(screen.getByText('Priority sources (1)')).toBeInTheDocument()
    expect(screen.getByText('Shared margin sensitivity')).toBeInTheDocument()
    expect(screen.getByText('Margins are the main shared evidence gap.')).toBeInTheDocument()
  })

  it('does not imply a model opinion exists after fallback', () => {
    renderPanel(watchlist('fallback'))

    expect(
      screen.queryByText(/no AI assessment was generated/i),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/no opinion was added/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/\/100/)).not.toBeInTheDocument()
  })
})
