import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultThesis } from '../domain/thesis'
import { SecurityLookup } from './SecurityLookup'

const quoteResponse = {
  'Global Quote': {
    '01. symbol': 'IBM',
    '05. price': '206.5000',
    '07. latest trading day': '2026-07-23',
    '08. previous close': '205.7700',
    '10. change percent': '0.3548%',
  },
}

const overviewResponse = {
  Symbol: 'IBM',
  Name: 'International Business Machines',
  Exchange: 'NYSE',
  Sector: 'TECHNOLOGY',
  Industry: 'INFORMATION TECHNOLOGY SERVICES',
  MarketCapitalization: '193400209000',
  TrailingPE: '18.21',
  ProfitMargin: '0.156',
  ReturnOnEquityTTM: '0.358',
  QuarterlyRevenueGrowthYOY: '0.095',
  QuarterlyEarningsGrowthYOY: '0.142',
  Beta: '0.675',
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
          new Response(JSON.stringify(overviewResponse), { status: 200 }),
        ),
    )

    render(<SecurityLookup thesis={defaultThesis} />)

    fireEvent.click(screen.getByText('Data access'))
    fireEvent.change(screen.getByLabelText('Free Alpha Vantage key'), {
      target: { value: 'personal-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(
      await screen.findByRole('heading', {
        name: 'International Business Machines',
      }),
    ).toBeInTheDocument()
    expect(
      window.sessionStorage.getItem('knowyourstocks.alphaVantageKey'),
    ).toBe('personal-key')
    expect(
      window.localStorage.getItem('knowyourstocks.alphaVantageKey'),
    ).toBeNull()
  })
})
