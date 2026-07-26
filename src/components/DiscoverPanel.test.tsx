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
  version: 2,
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
      opinion: null,
      thesisRationale: 'The deterministic evidence supports thesis fit.',
      mainConcern: 'Beta is near the market baseline.',
      whatToResearchNext: 'Review the latest filing and valuation context.',
      confidence: null,
      citations: [],
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
    expect(
      screen.getByText('Model unavailable · deterministic fallback'),
    ).toBeInTheDocument()
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

  it('renders opinion details, confidence, and citations without an AI score', async () => {
    discoverMock.mockResolvedValue({
      ...result,
      modelStatus: 'generated',
      recommendations: [
        {
          ...result.recommendations[0],
          opinion: 'Fits thesis',
          thesisRationale: 'Durable growth supports the thesis.',
          mainConcern: 'Valuation evidence remains demanding.',
          whatToResearchNext: 'Review margin durability in the next filing.',
          confidence: 'high',
          citations: [
            {
              evidenceId: 'msft-quality-0',
              symbol: 'MSFT',
              text: 'Quality evidence is available.',
            },
          ],
        },
      ],
    })

    render(<DiscoverPanel {...props} finnhubKey="key" />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh ideas' }))

    expect(await screen.findByText('Fits thesis')).toBeInTheDocument()
    expect(screen.getByText('high confidence')).toBeInTheDocument()
    expect(screen.getByText('What to research next')).toBeInTheDocument()
    expect(screen.queryByText(/AI evidence/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Sources (1)'))
    expect(screen.getByText('Quality evidence is available.')).toBeInTheDocument()
  })

  it('keeps deterministic cards usable when the model limit is reached', async () => {
    discoverMock.mockResolvedValue({ ...result, modelStatus: 'rate_limited' })
    render(<DiscoverPanel {...props} finnhubKey="key" />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh ideas' }))

    expect(await screen.findByText('Microsoft')).toBeInTheDocument()
    expect(
      screen.getByText('Model limit reached · deterministic fallback'),
    ).toBeInTheDocument()
    expect(screen.getByText('Deterministic comparison')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Research' })).toBeEnabled()
  })

  it('ignores a stale refresh after the thesis fingerprint changes', async () => {
    let resolveResult: (value: DiscoverResult) => void = () => undefined
    discoverMock.mockImplementation(
      () =>
        new Promise<DiscoverResult>((resolve) => {
          resolveResult = resolve
        }),
    )
    const rendered = render(
      <DiscoverPanel {...props} finnhubKey="key" thesis={defaultThesis} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ideas' }))

    rendered.rerender(
      <DiscoverPanel
        {...props}
        finnhubKey="key"
        thesis={{ ...defaultThesis, style: 'value' }}
      />,
    )
    resolveResult(result)

    await Promise.resolve()
    expect(screen.queryByText('Microsoft')).not.toBeInTheDocument()
  })
})
