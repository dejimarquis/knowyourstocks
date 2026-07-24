import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultThesis } from '../domain/thesis'
import { SecurityLookup } from './SecurityLookup'

const defaultProps = {
  thesis: defaultThesis,
  watchedSymbols: new Set<string>(),
  watchlistLocked: false,
  onToggleWatch: vi.fn(),
}

const quoteResponse = {
  c: 206.5,
  dp: 0.3548,
  pc: 205.77,
  t: 1784840400,
}

const profileResponse = {
  exchange: 'NYSE',
  finnhubIndustry: 'Technology',
  marketCapitalization: 193400.209,
  name: 'International Business Machines',
  ticker: 'IBM',
}

const metricResponse = {
  metric: {
    beta: 0.675,
    epsTTM: 11.3,
    epsGrowthTTMYoy: 14.2,
    marketCapitalization: 193400.209,
    netProfitMarginTTM: 15.6,
    peBasicExclExtraTTM: 18.21,
    revenueGrowthTTMYoy: 9.5,
    roeTTM: 35.8,
  },
}

const intelligenceResponse = {
  score: 78,
  opinion: 'Promising but mixed',
  summary: 'The grounded evidence supports the thesis with some constraints.',
  strengths: [{ evidenceId: 'fit:quality', text: 'Quality evidence is supportive.' }],
  risks: [{ evidenceId: 'fit:valuation', text: 'Valuation remains a constraint.' }],
  confidence: 'high',
}

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status })

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

let apiKeySequence = 0
let apiKey = ''
let researchSymbol = ''

describe('SecurityLookup', () => {
  beforeEach(() => {
    apiKeySequence += 1
    apiKey = `personal-key-${apiKeySequence}`
    researchSymbol = `TST${apiKeySequence}`
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('keeps a personal API key in session storage only', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(quoteResponse), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(profileResponse), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(metricResponse), { status: 200 }),
        )
        .mockResolvedValueOnce(jsonResponse(intelligenceResponse)),
    )

    render(<SecurityLookup {...defaultProps} />)

    fireEvent.click(screen.getByText('Data access'))
    fireEvent.change(screen.getByLabelText('Free Finnhub key'), {
      target: { value: apiKey },
    })
    fireEvent.change(screen.getByLabelText('Company or ticker'), {
      target: { value: researchSymbol },
    })
    expect(
      window.sessionStorage.getItem('knowyourstocks.finnhubKey'),
    ).toBe(apiKey)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(
      await screen.findByRole('heading', {
        name: 'International Business Machines',
      }),
    ).toBeInTheDocument()
    expect(
      window.sessionStorage.getItem('knowyourstocks.finnhubKey'),
    ).toBe(apiKey)
    expect(
      window.localStorage.getItem('knowyourstocks.finnhubKey'),
    ).toBeNull()
  })

  it('restores the last normalized result without another API request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(quoteResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(profileResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(metricResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(jsonResponse(intelligenceResponse))

    vi.stubGlobal('fetch', fetchMock)

    const firstRender = render(<SecurityLookup {...defaultProps} />)
    fireEvent.click(screen.getByText('Data access'))
    fireEvent.change(screen.getByLabelText('Free Finnhub key'), {
      target: { value: apiKey },
    })
    fireEvent.change(screen.getByLabelText('Company or ticker'), {
      target: { value: researchSymbol },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', {
      name: 'International Business Machines',
    })
    await screen.findByLabelText('78 out of 100')
    firstRender.unmount()

    render(<SecurityLookup {...defaultProps} />)

    expect(
      screen.getByRole('heading', {
        name: 'International Business Machines',
      }),
    ).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  })

  it('renders deterministic Fit first and keeps it when AI is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(quoteResponse))
        .mockResolvedValueOnce(jsonResponse(profileResponse))
        .mockResolvedValueOnce(jsonResponse(metricResponse))
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    )

    render(<SecurityLookup {...defaultProps} />)
    fireEvent.click(screen.getByText('Data access'))
    fireEvent.change(screen.getByLabelText('Free Finnhub key'), {
      target: { value: apiKey },
    })

    fireEvent.change(screen.getByLabelText('Company or ticker'), {
      target: { value: researchSymbol },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Fit')).toBeInTheDocument()
    expect(
      await screen.findByText('AI assessment unavailable'),
    ).toBeInTheDocument()
    expect(screen.getByText('Fit')).toBeInTheDocument()
    expect(
      screen.queryByText('AI thesis-evidence score'),
    ).not.toBeInTheDocument()
  })

  it('does not request AI merely because cached research is present', () => {
    window.localStorage.setItem(
      'knowyourstocks.lastSecurity.v2',
      JSON.stringify({
        fetchedAt: Date.now(),
        security: {
          symbol: 'IBM',
          name: 'International Business Machines',
          exchange: 'NYSE',
          sector: 'Technology',
          industry: 'Technology',
          price: 206.5,
          previousClose: 205.77,
          changePercent: 0.3548,
          latestTradingDay: '2026-07-23',
          marketCap: 193_400_209_000,
          peRatio: 18.21,
          priceToBook: 4,
          dividendYield: 0.03,
          eps: 11.3,
          profitMargin: 0.156,
          returnOnEquity: 0.358,
          revenueGrowth: 0.095,
          earningsGrowth: 0.142,
          beta: 0.675,
          week52High: 210,
          week52Low: 150,
          source: 'Finnhub',
        },
      }),
    )
    const fetchMock = vi.fn()
    const onSecurityResearched = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <SecurityLookup
        {...defaultProps}
        onSecurityResearched={onSecurityResearched}
      />,
    )

    expect(
      screen.getByText('International Business Machines'),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSecurityResearched).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'IBM' }),
    )
    expect(screen.getByText('AI assessment not requested')).toBeInTheDocument()
    expect(
      screen.queryByText('AI thesis-evidence score'),
    ).not.toBeInTheDocument()
  })

  it('shows the separate grounded AI score, evidence, confidence, and disclosure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(quoteResponse))
        .mockResolvedValueOnce(jsonResponse(profileResponse))
        .mockResolvedValueOnce(jsonResponse(metricResponse))
        .mockResolvedValueOnce(jsonResponse(intelligenceResponse)),
    )

    render(<SecurityLookup {...defaultProps} />)
    fireEvent.click(screen.getByText('Data access'))
    fireEvent.change(screen.getByLabelText('Free Finnhub key'), {
      target: { value: apiKey },
    })
    fireEvent.change(screen.getByLabelText('Company or ticker'), {
      target: { value: researchSymbol },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(
      await screen.findByText('AI thesis-evidence score'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('78 out of 100')).toBeInTheDocument()
    expect(screen.getByText('Promising but mixed')).toBeInTheDocument()
    expect(screen.getByText('high confidence')).toBeInTheDocument()
    expect(screen.getByText('Quality evidence is supportive.')).toBeInTheDocument()
    expect(
      screen.getByText(/Model: Azure AI Foundry grounded assessment/),
    ).toBeInTheDocument()
    expect(screen.getByText(/neither score predicts returns/i)).toBeInTheDocument()
  })

  it('ignores a stale AI response after a new security search', async () => {
    const firstIntelligence = deferred<Response>()
    const microsoftProfile = {
      ...profileResponse,
      name: 'Microsoft',
      ticker: 'MSFT',
    }
    const staleResponse = {
      ...intelligenceResponse,
      score: 22,
      summary: 'Stale IBM assessment.',
    }
    const currentResponse = {
      ...intelligenceResponse,
      score: 91,
      opinion: 'Compelling',
      summary: 'Current Microsoft assessment.',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quoteResponse))
      .mockResolvedValueOnce(jsonResponse(profileResponse))
      .mockResolvedValueOnce(jsonResponse(metricResponse))
      .mockReturnValueOnce(firstIntelligence.promise)
      .mockResolvedValueOnce(jsonResponse(quoteResponse))
      .mockResolvedValueOnce(jsonResponse(microsoftProfile))
      .mockResolvedValueOnce(jsonResponse(metricResponse))
      .mockResolvedValueOnce(jsonResponse(currentResponse))
    vi.stubGlobal('fetch', fetchMock)

    render(<SecurityLookup {...defaultProps} />)
    fireEvent.click(screen.getByText('Data access'))
    fireEvent.change(screen.getByLabelText('Free Finnhub key'), {
      target: { value: apiKey },
    })
    fireEvent.change(screen.getByLabelText('Company or ticker'), {
      target: { value: researchSymbol },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', {
      name: 'International Business Machines',
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))

    fireEvent.change(screen.getByLabelText('Company or ticker'), {
      target: { value: `NEW${apiKeySequence}` },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(
      await screen.findByRole('heading', { name: 'Microsoft' }),
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('91 out of 100')).toBeInTheDocument()

    await act(async () => {
      firstIntelligence.resolve(jsonResponse(staleResponse))
      await firstIntelligence.promise
    })

    expect(screen.getByLabelText('91 out of 100')).toBeInTheDocument()
    expect(screen.queryByText('Stale IBM assessment.')).not.toBeInTheDocument()
  })
})
