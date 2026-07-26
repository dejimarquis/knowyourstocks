import { watchlistLimit, type Watchlist } from '../domain/watchlist'
import { isWeeklyReviewDue } from '../watchlist/generateWatchlistBrief'
import { IntelligenceCitations } from './IntelligenceCitations'

type WatchlistPanelProps = {
  watchlist: Watchlist
  onRemove: (symbol: string) => void
  onResearch: () => void
  onReview: () => void
  reviewStatus: 'idle' | 'reviewing' | 'error'
  reviewError: string | null
  onEnablePhiChange: (enabled: boolean) => void
  onInsightFeedback: (
    insightId: string,
    value: 'useful' | 'not_useful',
  ) => void
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

const modelStatusMessage = {
  not_requested:
    'No compatible model opinion is stored for this review. Run Review to request one.',
  loading:
    'The deterministic brief is ready. The AI model is reviewing the verified evidence now.',
  fallback:
    'The deterministic brief is shown. The model was unavailable or its response did not pass evidence checks, so no opinion was added.',
  disabled:
    'AI opinion was disabled for this review. Only the deterministic brief was generated.',
  rate_limited:
    'The AI review limit was reached. Only the deterministic brief was generated.',
} as const

export function WatchlistPanel({
  watchlist,
  onRemove,
  onResearch,
  onReview,
  reviewStatus,
  reviewError,
  onEnablePhiChange,
  onInsightFeedback,
}: WatchlistPanelProps) {
  const brief = watchlist.latestBrief
  const attentionInsights =
    brief?.deterministicInsights.filter(
      (insight) =>
        insight.severity === 'attention' || insight.severity === 'watch',
    ) ?? []
  const informationalInsights =
    brief?.deterministicInsights.filter(
      (insight) => insight.severity === 'informational',
    ) ?? []
  const opinionsBySymbol = new Map(
    brief?.stockOpinions.map((opinion) => [
      opinion.symbol.toUpperCase(),
      opinion,
    ]) ?? [],
  )
  const weeklyDue = isWeeklyReviewDue(watchlist)

  return (
    <section className="watchlist-view" aria-labelledby="watchlist-title">
      <div className="watchlist-heading">
        <div>
          <p>Watchlist</p>
          <h1 id="watchlist-title">What deserves your attention?</h1>
        </div>
        <span>
          {watchlist.items.length} of {watchlistLimit}
        </span>
      </div>

      {watchlist.items.length === 0 ? (
        <div className="watchlist-empty">
          <strong>Your watchlist is empty.</strong>
          <p>
            Research a stock, review its thesis fit, then add it here for future
            comparisons.
          </p>
          <button className="primary-action" onClick={onResearch} type="button">
            Research a stock
          </button>
        </div>
      ) : (
        <>
          <div className="watchlist-review">
            <div>
              <strong>Review watchlist</strong>
              <p>
                Compare the latest data with the snapshots saved on this device.
              </p>
            </div>
            {weeklyDue ? (
              <p className="watchlist-weekly-due" role="status">
                A new week started. Review the watchlist when you are ready to use
                current data and model quota.
              </p>
            ) : null}
            <button
              className="primary-action"
              disabled={reviewStatus === 'reviewing'}
              onClick={onReview}
              type="button"
            >
              {reviewStatus === 'reviewing' ? 'Reviewing' : 'Review'}
            </button>
          </div>
          {reviewError ? (
            <p className="watchlist-review-error" role="alert">
              {reviewError}
            </p>
          ) : null}
          <p className="watchlist-freshness">
            {watchlist.lastReviewAt
              ? `Last reviewed ${formatDate(watchlist.lastReviewAt)}`
              : 'Not reviewed yet'}
            {' · '}Prices are end of day
          </p>
          <label className="model-note-option">
            <input
              checked={watchlist.modelPreferences.enablePhi}
              disabled={reviewStatus === 'reviewing'}
              onChange={(event) => onEnablePhiChange(event.target.checked)}
              type="checkbox"
            />
            <span>Add AI opinion to each watchlist review</span>
          </label>
          <section className="watchlist-brief" aria-label="Watchlist brief">
            {brief ? (
              <>
                <div className="brief-heading">
                  <div>
                    <span>
                      {brief.reviewType === 'weekly'
                        ? 'Weekly brief'
                        : 'Latest brief'}
                    </span>
                    <strong>
                      {attentionInsights.length > 0
                        ? `${attentionInsights.length} item${attentionInsights.length === 1 ? ' needs' : 's need'} attention`
                        : 'Nothing urgent changed'}
                    </strong>
                  </div>

                  <time dateTime={brief.generatedAt}>
                    {formatDate(brief.generatedAt)}
                  </time>
                </div>

                {attentionInsights.length > 0 ? (
                  <ol className="brief-list">
                    {attentionInsights.map((insight) => (
                      <li key={insight.id}>
                        <details>
                          <summary>
                            <span>{insight.title}</span>
                            <strong>{insight.symbol ?? 'Watchlist'}</strong>
                          </summary>
                          <p>{insight.summary}</p>
                          <dl>
                            {insight.evidence.map((evidence) => (
                              <div key={evidence.label}>
                                <dt>{evidence.label}</dt>
                                <dd>
                                  {evidence.current}
                                  {evidence.previous
                                    ? ` · previously ${evidence.previous}`
                                    : ''}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="brief-placeholder">
                    No deterministic signal currently needs attention.
                  </p>
                )}

                {informationalInsights.length > 0 ? (
                  <details className="brief-secondary">
                    <summary>
                      Other changes ({informationalInsights.length})
                    </summary>
                    <ul>
                      {informationalInsights.map((insight) => (
                        <li key={insight.id}>
                          <strong>{insight.title}</strong>
                          <span>{insight.summary}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {brief.modelStatus === 'generated' &&
                (brief.prioritizedSignalIds.length > 0 ||
                  brief.prioritizedEvidence.length > 0) ? (
                  <section className="verified-priorities">
                    <span>What to review first</span>
                    <strong>Most relevant verified evidence</strong>
                    {brief.prioritizedSignalIds.length > 0 ? (
                      <ol>
                        {brief.prioritizedSignalIds.map((signalId) => {
                          const signal = brief.deterministicInsights.find(
                            (insight) => insight.id === signalId,
                          )
                          return signal ? (
                            <li key={signal.id}>
                              <strong>{signal.title}</strong>
                              <span>{signal.summary}</span>
                            </li>
                          ) : null
                        })}
                      </ol>
                    ) : null}
                    <IntelligenceCitations
                      citations={brief.prioritizedEvidence}
                      label="Priority sources"
                    />
                  </section>
                ) : null}

                {brief.modelStatus === 'generated' &&
                brief.modelOverallOpinion &&
                brief.modelOverallSummary ? (
                  <section
                    className="model-opinion-summary"
                    aria-label="Watchlist model opinion"
                  >
                    <div className="opinion-heading">
                      <span>Model opinion</span>
                      <strong>{brief.modelOverallOpinion}</strong>
                    </div>
                    <p>{brief.modelOverallSummary.text}</p>
                    <IntelligenceCitations
                      citations={brief.modelOverallSummary.citations}
                    />
                    <small>
                      Research context only. This is not a trade recommendation.
                    </small>
                  </section>
                ) : brief.modelStatus !== 'generated' ? (
                  <p
                    className={`model-status model-status-${brief.modelStatus}`}
                    role={brief.modelStatus === 'loading' ? 'status' : undefined}
                  >
                    {modelStatusMessage[brief.modelStatus]}
                  </p>
                ) : null}

                {brief.modelStatus === 'generated' &&
                brief.crossStockPatterns.length > 0 ? (
                  <section className="cross-stock-patterns">
                    <div>
                      <span>Cross-stock patterns</span>
                      <strong>Connections across verified evidence</strong>
                    </div>
                    {brief.crossStockPatterns.map((pattern, index) => {
                      const insightId = `experimental_pattern:watchlist:${index}`
                      return (
                        <details key={`${pattern.title}:${index}`}>
                          <summary>{pattern.title}</summary>
                          <p>{pattern.summary}</p>
                          <IntelligenceCitations citations={pattern.citations} />
                          <small>Confidence: {pattern.confidence}</small>
                          <div className="insight-feedback">
                            <span>Was this useful?</span>
                            <button
                              aria-pressed={
                                watchlist.insightFeedback[insightId] ===
                                'useful'
                              }
                              onClick={() =>
                                onInsightFeedback(insightId, 'useful')
                              }
                              type="button"
                            >
                              Useful
                            </button>
                            <button
                              aria-pressed={
                                watchlist.insightFeedback[insightId] ===
                                'not_useful'
                              }
                              onClick={() =>
                                onInsightFeedback(insightId, 'not_useful')
                              }
                              type="button"
                            >
                              Not useful
                            </button>
                          </div>
                        </details>
                      )
                    })}
                    <p>
                      Cross-stock patterns connect verified evidence but may
                      still be incomplete. They do not change deterministic
                      signal severity.
                    </p>
                  </section>
                ) : null}

                {brief.stableSymbols.length > 0 ? (
                  <details className="brief-secondary">
                    <summary>
                      Stable ({brief.stableSymbols.length})
                    </summary>
                    <p>{brief.stableSymbols.join(', ')}</p>
                  </details>
                ) : null}
              </>
            ) : (
              <p className="brief-placeholder">
                Your brief will appear here after the first review. It will show
                what changed, what needs attention, and the evidence behind each
                point.
              </p>
            )}
          </section>

          <div className="watchlist-table" role="list">
            {watchlist.items.map((item) => (
              <article className="watchlist-row" key={item.symbol} role="listitem">
                <div className="watchlist-security">
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </div>
                <div>
                  <span>Price</span>
                  <strong>{formatCurrency(item.currentSnapshot.price)}</strong>
                </div>
                <div>
                  <span>Fit</span>
                  <strong>
                    {item.currentFit.total ?? '—'} · {item.currentFit.label}
                  </strong>
                </div>
                <div>
                  <span>Saved</span>
                  <strong>{formatDate(item.addedAt)}</strong>
                </div>
                {opinionsBySymbol.get(item.symbol.toUpperCase()) ? (
                  <details className="watchlist-opinion">
                    <summary>
                      <span>Model opinion</span>
                      <strong>
                        {
                          opinionsBySymbol.get(item.symbol.toUpperCase())
                            ?.opinion
                        }
                      </strong>
                    </summary>
                    <small>
                      Confidence:{' '}
                      {
                        opinionsBySymbol.get(item.symbol.toUpperCase())
                          ?.confidence
                      }
                      . Research context only.
                    </small>
                    <div className="stock-opinion-change">
                      <span>What changed</span>
                      <p>
                        {
                          opinionsBySymbol.get(item.symbol.toUpperCase())
                            ?.whatChanged.text
                        }
                      </p>
                      <IntelligenceCitations
                        citations={
                          opinionsBySymbol.get(item.symbol.toUpperCase())
                            ?.whatChanged.citations ?? []
                        }
                      />
                    </div>
                    <div className="stock-opinion-columns">
                      <div>
                        <span>Why it fits</span>
                        {opinionsBySymbol.get(item.symbol.toUpperCase())!
                          .whyItFits.length > 0 ? (
                          <ul>
                            {opinionsBySymbol
                            .get(item.symbol.toUpperCase())
                             ?.whyItFits.map((claim) => (
                             <li key={claim.citationIds.join(':')}>
                               <p>{claim.text}</p>
                               <IntelligenceCitations citations={claim.citations} />
                             </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No verified supporting point was identified.</p>
                        )}
                      </div>
                      <div>
                        <span>Concerns</span>
                        {opinionsBySymbol.get(item.symbol.toUpperCase())!.concerns
                          .length > 0 ? (
                          <ul>
                            {opinionsBySymbol
                            .get(item.symbol.toUpperCase())
                             ?.concerns.map((claim) => (
                             <li key={claim.citationIds.join(':')}>
                               <p>{claim.text}</p>
                               <IntelligenceCitations citations={claim.citations} />
                             </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No verified concern was identified.</p>
                        )}
                      </div>
                      <div>
                        <span>What to watch next</span>
                        {opinionsBySymbol.get(item.symbol.toUpperCase())!
                          .whatToWatchNext.length > 0 ? (
                          <ul>
                            {opinionsBySymbol
                             .get(item.symbol.toUpperCase())
                             ?.whatToWatchNext.map((claim) => (
                             <li key={claim.citationIds.join(':')}>
                               <p>{claim.text}</p>
                               <IntelligenceCitations citations={claim.citations} />
                             </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No next research item was identified.</p>
                        )}
                      </div>
                    </div>
                  </details>
                ) : null}
                {item.reviewError ? (
                  <span className="watchlist-item-error" role="status">
                    Data unavailable
                  </span>
                ) : null}
                <button
                  className="watchlist-remove"
                  disabled={reviewStatus === 'reviewing'}
                  onClick={() => onRemove(item.symbol)}
                  type="button"
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
