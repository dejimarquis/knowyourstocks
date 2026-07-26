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
  opinion: 'Mixed',
  headline: 'Quality supports the thesis, while valuation needs attention.',
  reasoningSummary: {
    text: 'The grounded evidence supports the thesis with some constraints.',
    citationIds: ['fit:quality'],
    citations: [{
      evidenceId: 'fit:quality',
      symbol: 'IBM',
      text: 'Quality supports your thesis.',
    }],
  },
  whyItFits: [{
    text: 'Quality evidence is supportive.',
    citationIds: ['fit:quality'],
    citations: [{
      evidenceId: 'fit:quality',
      symbol: 'IBM',
      text: 'Quality supports your thesis.',
    }],
  }],
  concerns: [{
    text: 'Valuation remains a constraint.',
    citationIds: ['fit:valuation'],
    citations: [{
      evidenceId: 'fit:valuation',
      symbol: 'IBM',
      text: 'Valuation weakens the thesis fit.',
    }],
  }],
  whatToWatchNext: [{
    text: 'Review operating margin in the next filing.',
    citationIds: ['metric:operatingMargin'],
    citations: [{
      evidenceId: 'metric:operatingMargin',
      symbol: 'IBM',
      text: 'Operating margin: 18.4%.',
    }],
  }],
  confidence: 'high',
  uncertainty: {
    text: 'Future operating performance remains uncertain.',
    citationIds: ['metric:operatingMargin'],
    citations: [{
      evidenceId: 'metric:operatingMargin',
      symbol: 'IBM',
      text: 'Operating margin: 18.4%.',
    }],
  },
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
    await screen.findByText(intelligenceResponse.headline)
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
      await screen.findByText('Model opinion could not load'),
    ).toBeInTheDocument()
    expect(screen.getByText('Fit')).toBeInTheDocument()
    expect(
      screen.queryByText('AI evidence score'),
    ).not.toBeInTheDocument()
  })

  it.each([
    [
      429,
      {
        error: 'Research opinion limit reached.',
        code: 'INTELLIGENCE_LIMIT_REACHED',
        retryable: true,
      },
      'Model opinion limit reached',
      true,
    ],
    [
      400,
      {
        error: 'Invalid intelligence request.',
        code: 'INVALID_REQUEST',
        retryable: false,
      },
      'Model opinion could not load',
      false,
    ],
  ] as const)(
    'renders truthful safe-error copy for HTTP %s',
    async (status, body, heading, retryable) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(jsonResponse(quoteResponse))
          .mockResolvedValueOnce(jsonResponse(profileResponse))
          .mockResolvedValueOnce(jsonResponse(metricResponse))
          .mockResolvedValueOnce(jsonResponse(body, status)),
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

      expect(await screen.findByText(heading)).toBeInTheDocument()
      const retry = screen.queryByRole('button', {
        name: 'Try model opinion again',
      })
      expect(Boolean(retry)).toBe(retryable)
      expect(screen.getByText('Fit')).toBeInTheDocument()
    },
  )

  it('automatically requests AI when cached research is present', async () => {
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(intelligenceResponse))
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
    expect(
      await screen.findByText(intelligenceResponse.headline),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(onSecurityResearched).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'IBM' }),
    )
  })

  it('shows the opinion, reasoning sections, confidence, citations, and disclosure', async () => {
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
      await screen.findByText(intelligenceResponse.headline),
    ).toBeInTheDocument()
    expect(screen.queryByText(/out of 100/i)).not.toBeInTheDocument()
    expect(screen.getByText('Mixed')).toBeInTheDocument()
    expect(screen.getByText('high confidence')).toBeInTheDocument()
    expect(screen.getByText('Quality evidence is supportive.')).toBeInTheDocument()
    expect(screen.getByText('Valuation remains a constraint.')).toBeInTheDocument()
    expect(
      screen.getByText('Review operating margin in the next filing.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Future operating performance remains uncertain.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Sources (1)').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/Model: Azure AI Foundry grounded opinion/),
    ).toBeInTheDocument()
    expect(screen.getByText(/does not predict returns/i)).toBeInTheDocument()
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
      headline: 'Stale IBM opinion.',
      reasoningSummary: {
        ...intelligenceResponse.reasoningSummary,
        text: 'Stale IBM assessment.',
      },
    }
    const currentResponse = {
      ...intelligenceResponse,
      opinion: 'Fits thesis',
      headline: 'Current Microsoft opinion.',
      reasoningSummary: {
        ...intelligenceResponse.reasoningSummary,
        text: 'Current Microsoft assessment.',
        citations: intelligenceResponse.reasoningSummary.citations.map(
          (citation) => ({ ...citation, symbol: 'MSFT' }),
        ),
      },
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
    expect(await screen.findByText('Current Microsoft opinion.')).toBeInTheDocument()

    await act(async () => {
      firstIntelligence.resolve(jsonResponse(staleResponse))
      await firstIntelligence.promise
    })

    expect(screen.getByText('Current Microsoft opinion.')).toBeInTheDocument()
    expect(screen.queryByText('Stale IBM assessment.')).not.toBeInTheDocument()
  })
})
