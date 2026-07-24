import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import type { DiscoverResult } from '../discover/recommendations'
import { defaultThesis } from '../domain/thesis'
import { DiscoverPanel } from './DiscoverPanel'

const discoverMock = vi.hoisted(() => vi.fn())

vi.mock('../discover/recommendations', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../discover/recommendations')>()
  return { ...actual, discoverRecommendations: discoverMock }
})

const security: SecuritySnapshot = {
  symbol: 'MSFT',
  name: 'Microsoft',
  exchange: 'NASDAQ',
  sector: 'Technology',
  industry: 'Software',
  price: 100,
  previousClose: 99,
  changePercent: 1,
  latestTradingDay: '2026-07-23',
  marketCap: 100_000_000_000,
  peRatio: 25,
  priceToBook: 5,
  dividendYield: 0.01,
  eps: 5,
  profitMargin: 0.2,
  returnOnEquity: 0.25,
  revenueGrowth: 0.15,
  earningsGrowth: 0.18,
  beta: 1,
  week52High: 110,
  week52Low: 70,
  source: 'Finnhub',
}

const result: DiscoverResult = {
  version: 1,
  universeVersion: 1,
  generatedAt: '2026-07-23T20:00:00.000Z',
  modelStatus: 'fallback',
  providerErrors: 1,
  recommendations: [
    {
      snapshot: security,
      fit: {
        total: 82,
        label: 'Strong match',
        factors: [],
        missing: [],
      },
      reason: 'The deterministic evidence supports thesis fit.',
      risk: 'Beta is near the market baseline.',
      aiScore: null,
      aiOpinion: null,
      aiConfidence: null,
    },
  ],
}

const props = {
  thesis: defaultThesis,
  watchedSymbols: [] as string[],
  onResearch: vi.fn(),
  onAddToWatchlist: vi.fn(),
}

describe('DiscoverPanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
    discoverMock.mockReset()
    props.onResearch.mockReset()
    props.onAddToWatchlist.mockReset()
  })

  afterEach(cleanup)

  it('shows an explicit locked state without a Finnhub key', () => {
    render(<DiscoverPanel {...props} />)

    expect(screen.getByText('Discover is locked.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh ideas' })).toBeDisabled()
    expect(discoverMock).not.toHaveBeenCalled()
  })

  it('does not spend on page load and refreshes only after the manual action', async () => {
    discoverMock.mockResolvedValue(result)
    render(<DiscoverPanel {...props} finnhubKey="key" />)

    expect(
      screen.getByText('No recommendation spend happens on page load.'),
    ).toBeInTheDocument()
    expect(discoverMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh ideas' }))

    expect(await screen.findByText('Microsoft')).toBeInTheDocument()
    expect(discoverMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Deterministic fallback')).toBeInTheDocument()
    expect(screen.getByText(/Showing partial results/)).toBeInTheDocument()
  })

  it('shows loading and wires research and watchlist actions', async () => {
    let resolveResult: (value: DiscoverResult) => void = () => undefined
    discoverMock.mockImplementation(
      () =>
        new Promise<DiscoverResult>((resolve) => {
          resolveResult = resolve
        }),
    )
    render(<DiscoverPanel {...props} finnhubKey="key" />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh ideas' }))
    expect(screen.getByText(/Comparing up to eight/)).toBeInTheDocument()
    resolveResult(result)

    await screen.findByText('Microsoft')
    fireEvent.click(screen.getByRole('button', { name: 'Research' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to watchlist' }))

    expect(props.onResearch).toHaveBeenCalledWith('MSFT')
    expect(props.onAddToWatchlist).toHaveBeenCalledWith(
      security,
      result.recommendations[0].fit,
    )
  })
})
