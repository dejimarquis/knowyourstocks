import { useMemo, useState } from 'react'
import {
  fetchAlphaVantageSecurity,
  type SecuritySnapshot,
} from '../data/alphaVantage'
import type { InvestmentThesis } from '../domain/thesis'
import { scoreSecurity } from '../scoring/scoreSecurity'

const apiKeyStorageKey = 'knowyourstocks.alphaVantageKey'
const demoKey = 'demo'

type SecurityLookupProps = {
  thesis: InvestmentThesis
}

const loadApiKey = () => window.sessionStorage.getItem(apiKeyStorageKey) ?? ''

const metricDefinitions = {
  marketCap: {
    label: 'Market cap',
    definition:
      'The total market value of all the company’s shares. It helps you understand company size, not business quality.',
  },
  peRatio: {
    label: 'Trailing P/E',
    definition:
      'The price investors pay for each $1 of recent annual earnings. A high P/E can reflect optimism; a low P/E can reflect value or concern.',
  },
  profitMargin: {
    label: 'Profit margin',
    definition:
      'How much profit remains from each $1 of sales. A 15.6% margin means about 16 cents of profit per dollar of revenue.',
  },
  revenueGrowth: {
    label: 'Revenue growth',
    definition:
      'How quickly sales changed from the same quarter a year ago. It shows whether demand for the business is expanding or shrinking.',
  },
} as const

const factorEducation: Record<string, string> = {
  sector:
    'Checks whether the company operates in the sectors and themes you selected.',
  risk:
    'Uses beta, a measure of how much the stock has historically moved compared with the overall market. A beta of 1 is market-like, below 1 is usually calmer, and above 1 is usually more volatile.',
  quality:
    'Looks at profitability, return on shareholder money, and earnings per share to estimate business quality.',
  growth:
    'Looks at recent sales and earnings growth. Growth can support a long-term thesis, but one quarter does not define the business.',
  resilience:
    'Uses company size and profitability as simple clues about its ability to handle difficult periods.',
  valuation:
    'Compares the share price with recent earnings. Valuation helps show how much optimism may already be included in the price.',
  preference:
    'Checks the company against the investing style you selected, such as quality, growth, value, or income.',
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)

const formatCompactCurrency = (value: number | null) =>
  value === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value)

const formatPercent = (value: number | null) =>
  value === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))

export function SecurityLookup({ thesis }: SecurityLookupProps) {
  const [apiKey, setApiKey] = useState(loadApiKey)
  const [symbol, setSymbol] = useState('IBM')
  const [security, setSecurity] = useState<SecuritySnapshot | null>(null)
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [error, setError] = useState<string | null>(null)

  const fit = useMemo(
    () => (security ? scoreSecurity(security, thesis) : null),
    [security, thesis],
  )
  const strongestFactors = fit?.factors
    .filter((factor) => factor.available)
    .sort(
      (left, right) =>
        right.earned / right.maximum - left.earned / left.maximum,
    )
    .slice(0, 2)
  const isRefreshing =
    security?.symbol === symbol.trim().toUpperCase() && status !== 'loading'

  const handleResearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('loading')
    setError(null)

    const key = apiKey.trim() || demoKey

    if (!key) {
      setStatus('error')
      setError('Add your free Alpha Vantage API key before researching a stock.')
      return
    }

    if (key === demoKey && symbol.trim().toUpperCase() !== 'IBM') {
      setStatus('error')
      setError('The free demo supports IBM only. Open Data access to use another company.')
      return
    }

    try {
      const result = await fetchAlphaVantageSecurity(symbol, key)

      if (apiKey.trim()) {
        window.sessionStorage.setItem(apiKeyStorageKey, apiKey.trim())
      }

      setSecurity(result)
      setStatus('success')
    } catch (caughtError) {
      setSecurity(null)
      setStatus('error')
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Market data could not be loaded.',
      )
    }
  }

  return (
    <section className="security-research" aria-labelledby="research-title">
      <h2 className="visually-hidden" id="research-title">
        Research a stock
      </h2>

      <form className="lookup-form" onSubmit={handleResearch}>
        <label>
          <span>Company or ticker</span>
          <input
            aria-label="Ticker symbol"
            autoComplete="off"
            maxLength={80}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="Try Apple or AAPL"
            value={symbol}
          />
        </label>
        <button className="primary-action" disabled={status === 'loading'} type="submit">
          {status === 'loading'
            ? 'Loading'
            : isRefreshing
              ? 'Refresh'
              : 'Search'}
        </button>
      </form>

      <details className="data-access">
        <summary>Data access</summary>
        <label>
          <span>Free Alpha Vantage key</span>
          <input
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Optional for the IBM demo"
            type="text"
            value={apiKey}
          />
        </label>
        <p>
          Kept only for this browser session and never sent to us.{' '}
          <a
            href="https://www.alphavantage.co/support/#api-key"
            rel="noreferrer"
            target="_blank"
          >
            Get a free key
          </a>
          .
        </p>
      </details>

      {error ? (
        <p className="lookup-error" role="alert">
          {error}
        </p>
      ) : null}

      {security && fit ? (
        <div className="research-result" aria-live="polite">
          <article className="result-summary">
            <div className="result-hero">
              <div className="company-panel">
                <h3>{security.name}</h3>
                <div className="result-symbol">{security.symbol}</div>
                <div className="price-line">
                  <strong>{formatCurrency(security.price)}</strong>
                  <span
                    className={
                      security.changePercent !== null &&
                      security.changePercent < 0
                        ? 'negative'
                        : 'positive'
                    }
                  >
                    {security.changePercent === null
                      ? 'Change unavailable'
                      : `${security.changePercent >= 0 ? '+' : ''}${security.changePercent.toFixed(2)}%`}
                  </span>
                </div>
                <p>
                  {[security.exchange, security.sector, security.industry]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="fit-panel">
                <span>Fit</span>
                <strong>{fit.total ?? '—'}</strong>
                <h4 id="fit-title">{fit.label}</h4>
                <p>
                  {strongestFactors?.map((factor) => factor.label).join(' and ')}
                  {strongestFactors?.length ? ' support your thesis.' : ''}
                </p>
                <small>
                  This is a match against your preferences, not a prediction of
                  future returns.
                </small>
              </div>
            </div>

            <div className="metric-grid">
              <details>
                <summary>
                  <span>{metricDefinitions.marketCap.label}</span>
                  <strong>{formatCompactCurrency(security.marketCap)}</strong>
                </summary>
                <p>{metricDefinitions.marketCap.definition}</p>
              </details>
              <details>
                <summary>
                  <span>{metricDefinitions.peRatio.label}</span>
                  <strong>{security.peRatio?.toFixed(1) ?? '—'}</strong>
                </summary>
                <p>{metricDefinitions.peRatio.definition}</p>
              </details>
              <details>
                <summary>
                  <span>{metricDefinitions.profitMargin.label}</span>
                  <strong>{formatPercent(security.profitMargin)}</strong>
                </summary>
                <p>{metricDefinitions.profitMargin.definition}</p>
              </details>
              <details>
                <summary>
                  <span>{metricDefinitions.revenueGrowth.label}</span>
                  <strong>{formatPercent(security.revenueGrowth)}</strong>
                </summary>
                <p>{metricDefinitions.revenueGrowth.definition}</p>
              </details>
            </div>

            <p className="data-trust-line">
              Source: {security.source} · End-of-day price as of{' '}
              {formatDate(security.latestTradingDay)} · Refresh anytime
            </p>

            <details className="factor-details">
              <summary>Why this score</summary>
              <ol className="factor-list">
                {fit.factors.map((factor) => (
                  <li key={factor.key}>
                    <div>
                      <strong>{factor.label}</strong>
                      <span>
                        {factor.available
                          ? `${factor.earned.toFixed(factor.earned % 1 === 0 ? 0 : 1)} of ${factor.maximum}`
                          : 'Unavailable'}
                      </span>
                    </div>
                    <p>{factor.evidence}</p>
                    <p className="factor-education">
                      {factorEducation[factor.key]}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          </article>
        </div>
      ) : null}
    </section>
  )
}
