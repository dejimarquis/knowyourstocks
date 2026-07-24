import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultThesis } from '../domain/thesis'
import { SecurityLookup } from './SecurityLookup'

const defaultProps = {
  thesis: defaultThesis,
  watchedSymbols: new Set<string>(),
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
    marketCapitalization: 193400.209,
    netProfitMarginTTM: 15.6,
    peBasicExclExtraTTM: 18.21,
    revenueGrowthTTMYoy: 9.5,
    roeTTM: 35.8,
  },
}

describe('SecurityLookup', () => {
  beforeEach(() => {
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
        ),
    )

    render(<SecurityLookup {...defaultProps} />)

    fireEvent.click(screen.getByText('Data access'))
    fireEvent.change(screen.getByLabelText('Free Finnhub key'), {
      target: { value: 'personal-key' },
    })
    expect(
      window.sessionStorage.getItem('knowyourstocks.finnhubKey'),
    ).toBe('personal-key')
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(
      await screen.findByRole('heading', {
        name: 'International Business Machines',
      }),
    ).toBeInTheDocument()
    expect(
      window.sessionStorage.getItem('knowyourstocks.finnhubKey'),
    ).toBe('personal-key')
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

    vi.stubGlobal('fetch', fetchMock)

    const firstRender = render(<SecurityLookup {...defaultProps} />)
    fireEvent.click(screen.getByText('Data access'))
    fireEvent.change(screen.getByLabelText('Free Finnhub key'), {
      target: { value: 'personal-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', {
      name: 'International Business Machines',
    })
    firstRender.unmount()

    render(<SecurityLookup {...defaultProps} />)

    expect(
      screen.getByRole('heading', {
        name: 'International Business Machines',
      }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
