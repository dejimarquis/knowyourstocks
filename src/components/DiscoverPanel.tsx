import { useEffect, useState } from 'react'
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

export type DiscoverPanelProps = {
  thesis: InvestmentThesis
  watchedSymbols: Iterable<string>
  finnhubKey?: string
  loadFinnhubKey?: () => string
  recentSymbols?: string[]
  currentSymbol?: string | null
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
  const locked = !resolveKey(finnhubKey, loadFinnhubKey)

  useEffect(() => {
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
    try {
      const nextResult = await discoverRecommendations({
        thesis,
        watchedSymbols: watched,
        finnhubKey: key,
        recentSymbols,
        currentSymbol,
      })
      saveDiscoverResult(fingerprint, nextResult)
      setResult(nextResult)
      setMessage(
        nextResult.providerErrors > 0
          ? `Showing partial results; ${nextResult.providerErrors} provider request${nextResult.providerErrors === 1 ? '' : 's'} could not be completed.`
          : null,
      )
      setStatus('idle')
    } catch (error) {
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
        Finnhub, SEC, and Azure Phi quota.
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
                ? 'Phi-ranked'
                : result.modelStatus === 'fallback'
                  ? 'Deterministic fallback'
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
                  <div className="discover-scores">
                    <span>Fit</span>
                    <strong>
                      {recommendation.fit.total == null
                        ? '—'
                        : recommendation.fit.total}
                    </strong>
                    {recommendation.aiScore != null ? (
                      <small>
                        AI evidence {recommendation.aiScore}
                        {recommendation.aiOpinion
                          ? ` · ${recommendation.aiOpinion}`
                          : ''}
                        {recommendation.aiConfidence
                          ? ` · ${recommendation.aiConfidence} confidence`
                          : ''}
                      </small>
                    ) : null}
                  </div>
                </div>
                <dl className="discover-rationale">
                  <div>
                    <dt>Why it fits</dt>
                    <dd>{recommendation.reason}</dd>
                  </div>
                  <div>
                    <dt>Main risk or gap</dt>
                    <dd>{recommendation.risk}</dd>
                  </div>
                </dl>
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
                    onClick={() =>
                      onAddToWatchlist(
                        recommendation.snapshot,
                        recommendation.fit,
                      )
                    }
                    type="button"
                  >
                    Add to watchlist
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
