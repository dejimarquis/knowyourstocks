import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAlphaVantageSecurity,
  type SecuritySnapshot,
} from '../data/alphaVantage'
import { fetchFinnhubSecurity } from '../data/finnhub'
import { enrichWithSecFallback } from '../data/sec'
import type { InvestmentThesis } from '../domain/thesis'
import {
  IntelligenceApiError,
  type CitedClaim,
} from '../intelligence/contracts'
import { scoreSecurity, type FitScore } from '../scoring/scoreSecurity'
import {
  createResearchIntelligenceRequest,
  requestResearchIntelligence,
  researchIntelligenceCacheKey,
  type ResearchIntelligenceResult,
} from '../research/requestResearchIntelligence'
import {
  loadFinnhubKey,
  saveFinnhubKey,
} from '../storage/providerKeyStorage'
import { IntelligenceCitations } from './IntelligenceCitations'

const securityCacheKey = 'knowyourstocks.lastSecurity.v2'
const demoKey = 'demo'
const cacheLifetimeMs = 6 * 60 * 60 * 1000

type SecurityLookupProps = {
  thesis: InvestmentThesis
  watchedSymbols: Set<string>
  watchlistLocked: boolean
  requestedSymbol?: string | null
  onSecurityResearched?: (security: SecuritySnapshot) => void
  onToggleWatch: (security: SecuritySnapshot, fit: FitScore) => void
}

type CachedSecurity = {
  fetchedAt: number
  security: SecuritySnapshot
}

type IntelligenceState = {
  key: string
  status: 'loading' | 'success' | 'unavailable'
  result?: ResearchIntelligenceResult
  error?: IntelligenceApiError
}

const loadCachedSecurity = (): SecuritySnapshot | null => {
  const storedValue = window.localStorage.getItem(securityCacheKey)

  if (!storedValue) {
    return null
  }

  try {
    const cached = JSON.parse(storedValue) as CachedSecurity

    if (
      typeof cached.fetchedAt !== 'number' ||
      Date.now() - cached.fetchedAt > cacheLifetimeMs ||
      typeof cached.security?.symbol !== 'string' ||
      typeof cached.security?.price !== 'number'
    ) {
      window.localStorage.removeItem(securityCacheKey)
      return null
    }

    return cached.security
  } catch {
    window.localStorage.removeItem(securityCacheKey)
    return null
  }
}

const cacheSecurity = (security: SecuritySnapshot) => {
  window.localStorage.setItem(
    securityCacheKey,
    JSON.stringify({ fetchedAt: Date.now(), security } satisfies CachedSecurity),
  )
}

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

const factorMeaning: Record<string, string> = {
  sector: 'your selected themes',
  risk: 'your risk comfort',
  quality: 'profitability',
  growth: 'your growth goals',
  resilience: 'company size',
  valuation: 'the price investors are paying',
  preference: 'your investing style',
}

const joinPhrases = (values: string[]) =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`

const capitalize = (value: string) =>
  value ? `${value[0].toUpperCase()}${value.slice(1)}` : value

const explainFit = (fit: FitScore) => {
  if (fit.total == null) {
    return 'There is not enough reliable data to judge this stock against your thesis yet.'
  }

  const available = fit.factors.filter((factor) => factor.available)
  const supporting = available
    .filter((factor) => factor.earned / factor.maximum >= 0.7)
    .sort(
      (left, right) =>
        right.earned / right.maximum - left.earned / left.maximum,
    )
    .slice(0, 2)
    .map((factor) => factorMeaning[factor.key] ?? factor.label.toLowerCase())
  const conflicting = available
    .filter((factor) => factor.earned / factor.maximum < 0.5)
    .sort(
      (left, right) =>
        left.earned / left.maximum - right.earned / right.maximum,
    )
    .slice(0, 2)
    .map((factor) => factorMeaning[factor.key] ?? factor.label.toLowerCase())

  if (fit.label === 'Strong match') {
    return `The strongest matches are ${joinPhrases(supporting)}.${
      conflicting.length > 0
        ? ` ${joinPhrases(conflicting)} still deserves a closer look.`
        : ''
    }`
  }

  if (fit.label === 'Moderate match') {
    const conflict = joinPhrases(conflicting)
    return `${supporting.length > 0 ? `It matches ${joinPhrases(supporting)}` : 'Some evidence matches your preferences'}, but ${
      conflicting.length > 0
        ? conflict
        : 'the remaining evidence is mixed'
    } ${conflicting.length > 1 ? 'keep' : 'keeps'} it from being a strong match.`
  }

  const conflict = joinPhrases(conflicting)
  return `${supporting.length > 0 ? `The clearest match is ${joinPhrases(supporting)}.` : 'There is no clear match in the available evidence.'} ${
    conflicting.length > 0
      ? `${capitalize(conflict)} ${conflicting.length === 1 ? 'weakens' : 'weaken'} the Fit.`
      : 'Several factors only partially match your preferences.'
  }`
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)

const formatPeRatio = (security: SecuritySnapshot) => {
  if (security.peRatio != null) {
    if (security.peRatio > 500) {
      return 'Over 500'
    }
    return security.peRatio.toFixed(1)
  }

  if (security.eps != null && security.eps <= 0) {
    return 'Not meaningful'
  }

  return '—'
}

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

const formatTimestamp = (value: number) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const ClaimList = ({
  claims,
  emptyMessage,
}: {
  claims: CitedClaim[]
  emptyMessage: string
}) =>
  claims.length > 0 ? (
    <ul>
      {claims.map((claim) => (
        <li key={`${claim.text}:${claim.citationIds.join(':')}`}>
          <p>{claim.text}</p>
          <IntelligenceCitations citations={claim.citations} />
        </li>
      ))}
    </ul>
  ) : (
    <p>{emptyMessage}</p>
  )

export function SecurityLookup({
  thesis,
  watchedSymbols,
  watchlistLocked,
  requestedSymbol = null,
  onSecurityResearched,
  onToggleWatch,
}: SecurityLookupProps) {
  const [apiKey, setApiKey] = useState(loadFinnhubKey)
  const [initialSecurity] = useState(loadCachedSecurity)
  const [symbol, setSymbol] = useState(initialSecurity?.symbol ?? 'IBM')
  const [security, setSecurity] = useState<SecuritySnapshot | null>(
    initialSecurity,
  )
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [error, setError] = useState<string | null>(null)
  const [dataAccessOpen, setDataAccessOpen] = useState(false)
  const [intelligence, setIntelligence] =
    useState<IntelligenceState | null>(null)
  const [intelligenceInput, setIntelligenceInput] = useState<{
    security: SecuritySnapshot
    fit: FitScore
    thesis: InvestmentThesis
  } | null>(() =>
    initialSecurity
      ? {
          security: initialSecurity,
          fit: scoreSecurity(initialSecurity, thesis),
          thesis,
        }
      : null,
  )
  const intelligenceController = useRef<AbortController | null>(null)
  const intelligenceGeneration = useRef(0)
  const lastExternalResearch = useRef<string | null>(null)
  const hydrationReported = useRef(false)

  const fit = useMemo(
    () => (security ? scoreSecurity(security, thesis) : null),
    [security, thesis],
  )
  const isRefreshing =
    security?.symbol === symbol.trim().toUpperCase() && status !== 'loading'
  const isWatched = security ? watchedSymbols.has(security.symbol) : false
  const intelligenceRequest = useMemo(
    () =>
      intelligenceInput
        ? createResearchIntelligenceRequest(
            intelligenceInput.security,
            intelligenceInput.fit,
            intelligenceInput.thesis,
          )
        : null,
    [intelligenceInput],
  )
  const intelligenceKey = intelligenceRequest
    ? researchIntelligenceCacheKey(intelligenceRequest)
    : null
  const currentIntelligence =
    intelligence?.key === intelligenceKey ? intelligence : null
  const fitExplanation = fit ? explainFit(fit) : ''

  useEffect(() => {
    if (!intelligenceRequest || !intelligenceKey) {
      return
    }

    const controller = new AbortController()
    const generation = ++intelligenceGeneration.current
    intelligenceController.current = controller
    setIntelligence({ key: intelligenceKey, status: 'loading' })

    void requestResearchIntelligence(intelligenceRequest)
      .then((result) => {
        if (
          !controller.signal.aborted &&
          intelligenceGeneration.current === generation
        ) {
          setIntelligence({ key: intelligenceKey, status: 'success', result })
        }
      })
      .catch((caughtError) => {
        if (
          !controller.signal.aborted &&
          intelligenceGeneration.current === generation
        ) {
          setIntelligence({
            key: intelligenceKey,
            status: 'unavailable',
            error:
              caughtError instanceof IntelligenceApiError
                ? caughtError
                : new IntelligenceApiError(
                    'Intelligence is temporarily unavailable.',
                    503,
                    'INVALID_ERROR_RESPONSE',
                    true,
                  ),
          })
        }
      })

    return () => {
      controller.abort()
    }
  }, [intelligenceKey, intelligenceRequest])

  useEffect(() => {
    if (
      initialSecurity &&
      !hydrationReported.current &&
      onSecurityResearched
    ) {
      hydrationReported.current = true
      onSecurityResearched(initialSecurity)
    }
  }, [initialSecurity, onSecurityResearched])

  const runResearch = useCallback(async (requestedValue: string) => {
    const normalizedRequest = requestedValue.trim().toUpperCase()
    intelligenceGeneration.current += 1
    intelligenceController.current?.abort()
    setIntelligence(null)
    setIntelligenceInput(null)
    setStatus('loading')
    setError(null)

    const personalKey = apiKey.trim()

    if (!personalKey && normalizedRequest !== 'IBM') {
      setStatus('error')
      setDataAccessOpen(true)
      setError(
        'The free demo supports IBM only. Open Data access to use another company.',
      )
      return
    }

    try {
      const providerResult = personalKey
        ? await fetchFinnhubSecurity(normalizedRequest, personalKey)
        : await fetchAlphaVantageSecurity('IBM', demoKey)
      const result = await enrichWithSecFallback(providerResult)

      setSecurity(result)
      setSymbol(result.symbol)
      cacheSecurity(result)
      const researchedFit = scoreSecurity(result, thesis)
      setIntelligenceInput({
        security: result,
        fit: researchedFit,
        thesis,
      })
      onSecurityResearched?.(result)
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

  }, [apiKey, onSecurityResearched, thesis])

  useEffect(() => {
    if (!requestedSymbol) {
      lastExternalResearch.current = null
      return
    }

    const normalized = requestedSymbol.trim().toUpperCase()
    if (!normalized || lastExternalResearch.current === normalized) {
      return
    }

    lastExternalResearch.current = normalized
    setSymbol(normalized)
    void runResearch(normalized)
  }, [requestedSymbol, runResearch])

  const handleResearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await runResearch(symbol)
  }

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    saveFinnhubKey(value)
  }

  const retryIntelligence = () => {
    if (!security || !fit) {
      return
    }
    setIntelligence(null)
    setIntelligenceInput({
      security,
      fit,
      thesis,
    })
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

      <details
        className="data-access"
        onToggle={(event) => setDataAccessOpen(event.currentTarget.open)}
        open={dataAccessOpen}
      >
        <summary>Data access</summary>
        <label>
          <span>Free Finnhub key</span>
          <input
            autoComplete="off"
            onChange={(event) => handleApiKeyChange(event.target.value)}
            placeholder="Optional for IBM; needed for other stocks"
            type="text"
            value={apiKey}
          />
        </label>
        <p>
          Recommended for personal research. Kept for this browser session and
          sent directly to Finnhub, never to us.{' '}
          <a
            href="https://finnhub.io/register"
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
                <p>{fitExplanation}</p>
                <small>
                  This deterministic Fit compares the available data with your
                  preferences. It does not forecast returns.
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
                  <strong>{formatPeRatio(security)}</strong>
                </summary>
                <p>
                  {security.eps != null && security.eps <= 0
                    ? 'The company currently reports a loss, so a price-to-earnings ratio would not be meaningful.'
                    : security.peRatio != null && security.peRatio > 500
                      ? 'Earnings are very small relative to the share price, so this P/E is extremely high and is not useful by itself.'
                    : metricDefinitions.peRatio.definition}
                </p>
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
              <summary>How this Fit was calculated</summary>
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

            <section
              className="research-intelligence"
              aria-labelledby="research-intelligence-title"
            >
              <div className="research-intelligence-heading">
                <div>
                  <span>Model opinion</span>
                  <h4 id="research-intelligence-title">
                    What the evidence suggests
                  </h4>
                </div>
                <p>
                  A concise opinion based on the same company facts and your
                  thesis. It does not predict returns.
                </p>
              </div>

              {!currentIntelligence ||
                currentIntelligence.status === 'loading' ? (
                <div className="research-intelligence-status" role="status">
                  <strong>Reviewing the supplied evidence…</strong>
                  <span>
                    Your company data and deterministic Fit are ready while the
                    model opinion loads.
                  </span>
                </div>
              ) : currentIntelligence.status === 'unavailable' ? (
                <div className="research-intelligence-status" role="status">
                  <strong>
                    {currentIntelligence.error?.code ===
                    'INTELLIGENCE_LIMIT_REACHED'
                      ? 'Model opinion limit reached'
                      : 'Model opinion could not load'}
                  </strong>
                  <span>
                    {currentIntelligence.error?.code === 'INVALID_REQUEST'
                      ? 'The request was not accepted. The company data and deterministic Fit above remain available.'
                      : 'The company data and deterministic Fit above remain available. No model opinion is shown.'}
                  </span>
                  {currentIntelligence.error?.retryable ? (
                    <button
                      className="text-action"
                      onClick={retryIntelligence}
                      type="button"
                    >
                      Try model opinion again
                    </button>
                  ) : null}
                </div>
              ) : currentIntelligence.result ? (
                <>
                  <div className="research-intelligence-summary">
                    <div>
                      <div className="opinion-heading">
                        <span>Opinion</span>
                        <strong>{currentIntelligence.result.opinion}</strong>
                        <span>
                          {currentIntelligence.result.confidence} confidence
                        </span>
                      </div>
                      <h5>{currentIntelligence.result.headline}</h5>
                      <p>{currentIntelligence.result.reasoningSummary.text}</p>
                      <IntelligenceCitations
                        citations={
                          currentIntelligence.result.reasoningSummary.citations
                        }
                      />
                    </div>
                  </div>
                  <div className="research-opinion-grid">
                    <div>
                      <h5>Why it fits</h5>
                      <ClaimList
                        claims={currentIntelligence.result.whyItFits}
                        emptyMessage="No verified supporting point was identified."
                      />
                    </div>
                    <div>
                      <h5>Concerns</h5>
                      <ClaimList
                        claims={currentIntelligence.result.concerns}
                        emptyMessage="No verified concern was identified."
                      />
                    </div>
                    <div>
                      <h5>What to watch next</h5>
                      <ClaimList
                        claims={currentIntelligence.result.whatToWatchNext}
                        emptyMessage="No next research item was identified."
                      />
                    </div>
                  </div>
                  <div className="research-uncertainty">
                    <h5>Uncertainty</h5>
                    <p>{currentIntelligence.result.uncertainty.text}</p>
                    <IntelligenceCitations
                      citations={currentIntelligence.result.uncertainty.citations}
                    />
                  </div>
                  <p className="research-intelligence-disclosure">
                    Model: Azure AI Foundry grounded opinion · Freshness:{' '}
                    <time
                      dateTime={new Date(
                        currentIntelligence.result.fetchedAt,
                      ).toISOString()}
                    >
                      {formatTimestamp(currentIntelligence.result.fetchedAt)}
                    </time>
                    {currentIntelligence.result.source === 'cache'
                      ? ' · Loaded from the six-hour local cache'
                      : ' · Cached locally for up to six hours'}
                  </p>
                </>
              ) : null}
            </section>

            <div className="result-actions">
              <button
                className={isWatched ? 'watch-action watched' : 'watch-action'}
                disabled={watchlistLocked}
                onClick={() => onToggleWatch(security, fit)}
                type="button"
              >
                {watchlistLocked
                  ? 'Watchlist review in progress'
                  : isWatched
                    ? 'Remove from watchlist'
                    : 'Add to watchlist'}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}
