import { useEffect, useRef, useState } from 'react'
import type { SecuritySnapshot } from '../data/alphaVantage'
import {
  discoverRecommendations,
  type DiscoverResult,
} from '../discover/recommendations'
import type { InvestmentThesis } from '../domain/thesis'
import type { FitScore } from '../scoring/scoreSecurity'
import {
  createDiscoverFingerprint,
  getDiscoverCooldownRemaining,
  loadDiscoverResult,
  saveDiscoverResult,
  startDiscoverCooldown,
} from '../storage/discoverStorage'
import { IntelligenceCitations } from './IntelligenceCitations'

export type DiscoverPanelProps = {
  thesis: InvestmentThesis
  watchedSymbols: Iterable<string>
  finnhubKey?: string
  loadFinnhubKey?: () => string
  recentSymbols?: string[]
  currentSymbol?: string | null
  watchlistLocked?: boolean
  onResearch: (symbol: string) => void
  onAddToWatchlist: (snapshot: SecuritySnapshot, fit: FitScore) => void
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const resolveKey = (
  finnhubKey: string | undefined,
  loadFinnhubKey: (() => string) | undefined,
) => finnhubKey?.trim() || loadFinnhubKey?.().trim() || ''

export function DiscoverPanel({
  thesis,
  watchedSymbols,
  finnhubKey,
  loadFinnhubKey,
  recentSymbols = [],
  currentSymbol = null,
  watchlistLocked = false,
  onResearch,
  onAddToWatchlist,
}: DiscoverPanelProps) {
  const watched = [...watchedSymbols]
  const fingerprint = createDiscoverFingerprint(
    thesis,
    watched,
    recentSymbols,
    currentSymbol,
  )
  const [result, setResult] = useState<DiscoverResult | null>(() =>
    loadDiscoverResult(fingerprint),
  )
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const requestGeneration = useRef(0)
  const locked = !resolveKey(finnhubKey, loadFinnhubKey)

  useEffect(() => {
    requestGeneration.current += 1
    setResult(loadDiscoverResult(fingerprint))
    setMessage(null)
    setStatus('idle')
  }, [fingerprint])

  const refresh = async () => {
    const key = resolveKey(finnhubKey, loadFinnhubKey)
    if (!key) {
      setStatus('error')
      setMessage('Add a Finnhub key in Data access before discovering stocks.')
      return
    }

    const cooldown = getDiscoverCooldownRemaining()
    if (cooldown > 0) {
      setMessage(
        `Refresh is cooling down. Try again in ${Math.ceil(cooldown / 1000)} seconds.`,
      )
      return
    }

    setStatus('loading')
    setMessage(null)
    startDiscoverCooldown()
    const generation = ++requestGeneration.current
    const requestFingerprint = fingerprint
    try {
      const nextResult = await discoverRecommendations({
        thesis,
        watchedSymbols: watched,
        finnhubKey: key,
        recentSymbols,
        currentSymbol,
      })
      saveDiscoverResult(requestFingerprint, nextResult)
      if (requestGeneration.current !== generation) {
        return
      }
      setResult(nextResult)
      setMessage(
        nextResult.providerErrors > 0
          ? `Showing partial results; ${nextResult.providerErrors} provider request${nextResult.providerErrors === 1 ? '' : 's'} could not be completed.`
          : null,
      )
      setStatus('idle')
    } catch (error) {
      if (requestGeneration.current !== generation) {
        return
      }
      setStatus('error')
      setMessage(
        error instanceof Error
          ? error.message
          : 'Discover could not refresh right now.',
      )
    }
  }

  return (
    <section className="discover-view" aria-labelledby="discover-title">
      <div className="discover-heading">
        <div>
          <p>Discover</p>
          <h1 id="discover-title">Find the next company to research.</h1>
        </div>
        <button
          className="primary-action"
          disabled={locked || status === 'loading'}
          onClick={() => void refresh()}
          type="button"
        >
          {status === 'loading' ? 'Refreshing' : 'Refresh ideas'}
        </button>
      </div>

      <p className="discover-intro">
        A bounded universe of liquid US common stocks is filtered through your
        thesis, nearby companies, and current fundamentals. Refreshing may use
        Finnhub, SEC, and Azure AI model usage.
      </p>

      {locked ? (
        <div className="discover-locked" role="status">
          <strong>Discover is locked.</strong>
          <p>Add a Finnhub key in Data access to enable a manual refresh.</p>
        </div>
      ) : null}

      {message ? (
        <p
          className={status === 'error' ? 'discover-error' : 'discover-message'}
          role={status === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}

      {!result && !locked && status !== 'loading' ? (
        <div className="discover-empty">
          <strong>No recommendation spend happens on page load.</strong>
          <p>Choose Refresh ideas when you want a new five-company shortlist.</p>
        </div>
      ) : null}

      {status === 'loading' ? (
        <p className="discover-loading" role="status">
          Comparing up to eight thesis-aligned candidates…
        </p>
      ) : null}

      {result ? (
        <>
          <div className="discover-meta">
            <span>
              Updated {formatDate(result.generatedAt)} · universe v
              {result.universeVersion}
            </span>
            <span>
              {result.modelStatus === 'generated'
                ? 'Model opinions available'
                : result.modelStatus === 'rate_limited'
                  ? 'Model limit reached · deterministic fallback'
                : result.modelStatus === 'fallback'
                  ? 'Model unavailable · deterministic fallback'
                  : 'Deterministic partial result'}
            </span>
          </div>
          <ol className="discover-grid" aria-label="Recommended companies">
            {result.recommendations.map((recommendation) => (
              <li
                className="discover-card"
                key={recommendation.snapshot.symbol}
              >
                <div className="discover-card-heading">
                  <div>
                    <span>{recommendation.snapshot.symbol}</span>
                    <h2>{recommendation.snapshot.name}</h2>
                  </div>
                  <div className="discover-fit">
                    <span>Fit</span>
                    <strong>
                      {recommendation.fit.total == null
                        ? '—'
                        : recommendation.fit.total}
                    </strong>
                  </div>
                </div>
                <div className="discover-opinion">
                  <strong>
                    {recommendation.opinion ?? 'Deterministic comparison'}
                  </strong>
                  <span>
                    {recommendation.confidence
                      ? `${recommendation.confidence} confidence`
                      : 'Model opinion unavailable'}
                  </span>
                </div>
                <dl className="discover-rationale">
                  <div>
                    <dt>Thesis rationale</dt>
                    <dd>{recommendation.thesisRationale}</dd>
                  </div>
                  <div>
                    <dt>Main concern</dt>
                    <dd>{recommendation.mainConcern}</dd>
                  </div>
                  <div>
                    <dt>What to research next</dt>
                    <dd>{recommendation.whatToResearchNext}</dd>
                  </div>
                </dl>
                <IntelligenceCitations citations={recommendation.citations} />
                <p className="discover-source">
                  {recommendation.snapshot.source} · market data as of{' '}
                  {recommendation.snapshot.latestTradingDay}
                </p>
                <div className="discover-actions">
                  <button
                    className="text-action"
                    onClick={() => onResearch(recommendation.snapshot.symbol)}
                    type="button"
                  >
                    Research
                  </button>
                  <button
                    className="watch-action"
                    disabled={watchlistLocked}
                    onClick={() =>
                      onAddToWatchlist(
                        recommendation.snapshot,
                        recommendation.fit,
                      )
                    }
                    type="button"
                  >
                    {watchlistLocked
                      ? 'Review in progress'
                      : 'Add to watchlist'}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  )
}
