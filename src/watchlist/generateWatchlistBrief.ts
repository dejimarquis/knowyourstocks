import type {
  Watchlist,
  WatchlistBrief,
  WatchlistInsight,
  WatchlistItem,
} from '../domain/watchlist'

const fitChangeThreshold = 10
const growthChangeThreshold = 0.1
const marginChangeThreshold = 0.05
const valuationChangeThreshold = 0.25
const staleDays = 5
const staleFundamentalsDays = 180

const formatPercent = (value: number | null) =>
  value == null
    ? 'unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value)

const formatPoints = (value: number) => `${value > 0 ? '+' : ''}${value} points`

const formatNumber = (value: number | null) =>
  value == null
    ? 'unavailable'
    : new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
      }).format(value)

const formatCurrency = (value: number | null) =>
  value == null
    ? 'unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value)

const daysBetween = (left: Date, right: Date) =>
  Math.floor(
    Math.abs(right.getTime() - left.getTime()) / (24 * 60 * 60 * 1000),
  )

const insight = (
  value: Omit<WatchlistInsight, 'id' | 'generatedAt'>,
  generatedAt: string,
  index: number,
): WatchlistInsight => ({
  ...value,
  id: `${value.type}:${value.symbol ?? 'watchlist'}:${index}`,
  generatedAt,
})

const securityInsights = (
  item: WatchlistItem,
  now: Date,
): Omit<WatchlistInsight, 'id' | 'generatedAt'>[] => {
  const results: Omit<WatchlistInsight, 'id' | 'generatedAt'>[] = []
  const previousFit = item.previousFit?.total
  const currentFit = item.currentFit.total

  if (previousFit != null && currentFit != null) {
    const change = currentFit - previousFit

    if (
      Math.abs(change) >= fitChangeThreshold ||
      item.previousFit?.label !== item.currentFit.label
    ) {
      results.push({
        symbol: item.symbol,
        type: 'fit_change',
        severity: change < 0 ? 'attention' : 'informational',
        title:
          change < 0
            ? `${item.symbol} fit weakened`
            : `${item.symbol} fit improved`,
        summary: `The thesis-fit score changed ${formatPoints(change)} to ${currentFit}.`,
        evidence: [
          {
            label: 'Thesis fit',
            current: `${currentFit} · ${item.currentFit.label}`,
            previous: `${previousFit} · ${item.previousFit?.label ?? 'Unknown'}`,
          },
        ],
      })
    }
  } else if (
    item.previousFit &&
    item.previousFit.label !== item.currentFit.label
  ) {
    const coverageLost = currentFit == null
    results.push({
      symbol: item.symbol,
      type: 'fit_change',
      severity: coverageLost ? 'watch' : 'informational',
      title: coverageLost
        ? `${item.symbol} fit coverage weakened`
        : `${item.symbol} fit coverage improved`,
      summary: coverageLost
        ? 'The current data no longer supports a complete thesis-fit score.'
        : `New data now supports a ${currentFit}-point thesis-fit score.`,
      evidence: [
        {
          label: 'Thesis fit',
          current:
            currentFit == null
              ? item.currentFit.label
              : `${currentFit} · ${item.currentFit.label}`,
          previous:
            previousFit == null
              ? item.previousFit.label
              : `${previousFit} · ${item.previousFit.label}`,
        },
      ],
    })
  }

  if (currentFit != null && currentFit < 55) {
    results.push({
      symbol: item.symbol,
      type: 'thesis_drift',
      severity: 'attention',
      title: `${item.symbol} may be drifting from your thesis`,
      summary: `Its current fit is ${currentFit}, with conflicts in ${item.currentFit.factors
        .filter((factor) => factor.available && factor.earned / factor.maximum < 0.5)
        .map((factor) => factor.label.toLowerCase())
        .slice(0, 2)
        .join(' and ') || 'the current evidence'}.`,
      evidence: [
        {
          label: 'Current fit',
          current: `${currentFit} · ${item.currentFit.label}`,
          previous: previousFit == null ? null : String(previousFit),
        },
      ],
    })
  }

  const previousSnapshot = item.previousSnapshot

  if (previousSnapshot) {
    const changes = [
      {
        label: 'Revenue growth',
        current: item.currentSnapshot.revenueGrowth,
        previous: previousSnapshot.revenueGrowth,
        threshold: growthChangeThreshold,
        format: formatPercent,
      },
      {
        label: 'Earnings growth',
        current: item.currentSnapshot.earningsGrowth,
        previous: previousSnapshot.earningsGrowth,
        threshold: growthChangeThreshold,
        format: formatPercent,
      },
      {
        label: 'Profit margin',
        current: item.currentSnapshot.profitMargin,
        previous: previousSnapshot.profitMargin,
        threshold: marginChangeThreshold,
        format: formatPercent,
      },
      {
        label: 'Operating margin',
        current: item.currentSnapshot.operatingMargin ?? null,
        previous: previousSnapshot.operatingMargin ?? null,
        threshold: marginChangeThreshold,
        format: formatPercent,
      },
      {
        label: 'Earnings per share',
        current: item.currentSnapshot.eps,
        previous: previousSnapshot.eps,
        threshold: 0.25,
        format: formatNumber,
      },
      {
        label: 'Free cash flow',
        current: item.currentSnapshot.freeCashFlow ?? null,
        previous: previousSnapshot.freeCashFlow ?? null,
        threshold: Math.max(
          50_000_000,
          Math.abs(previousSnapshot.freeCashFlow ?? 0) * 0.2,
        ),
        format: formatCurrency,
      },
      {
        label: 'Debt to equity',
        current: item.currentSnapshot.debtToEquity ?? null,
        previous: previousSnapshot.debtToEquity ?? null,
        threshold: 0.5,
        format: formatNumber,
      },
      {
        label: 'Current ratio',
        current: item.currentSnapshot.currentRatio ?? null,
        previous: previousSnapshot.currentRatio ?? null,
        threshold: 0.3,
        format: formatNumber,
      },
    ].filter(
      (change) =>
        change.current != null &&
        change.previous != null &&
        Math.abs(change.current - change.previous) >= change.threshold,
    )

    if (changes.length > 0) {
      results.push({
        symbol: item.symbol,
        type: 'fundamental_change',
        severity: 'watch',
        title: `${item.symbol} fundamentals changed`,
        summary: `${changes.map((change) => change.label).join(', ')} changed materially since the previous review.`,
        evidence: [
          ...changes.map((change) => ({
            label: change.label,
            current: change.format(change.current),
            previous: change.format(change.previous),
          })),
          ...(item.currentSnapshot.changePercent != null &&
          Math.abs(item.currentSnapshot.changePercent) >= 5
            ? [
                {
                  label: 'Price context',
                  current: `${item.currentSnapshot.changePercent > 0 ? '+' : ''}${item.currentSnapshot.changePercent.toFixed(1)}% on the latest market day`,
                  previous: null,
                },
              ]
            : []),
        ],
      })
    }

    const previousPe = previousSnapshot.peRatio
    const currentPe = item.currentSnapshot.peRatio

    if (
      previousPe != null &&
      previousPe > 0 &&
      currentPe != null &&
      currentPe > 0 &&
      Math.abs(currentPe - previousPe) / previousPe >=
        valuationChangeThreshold
    ) {
      const becameMoreExpensive = currentPe > previousPe
      results.push({
        symbol: item.symbol,
        type: 'valuation_change',
        severity: becameMoreExpensive ? 'watch' : 'informational',
        title: `${item.symbol} valuation changed materially`,
        summary: `Trailing P/E ${becameMoreExpensive ? 'expanded' : 'contracted'} while the underlying thesis evidence should be reviewed separately.`,
        evidence: [
          {
            label: 'Trailing P/E',
            current: currentPe.toFixed(1),
            previous: previousPe.toFixed(1),
          },
        ],
      })
    }

    if (
      item.currentSnapshot.fundamentalsAsOf &&
      item.currentSnapshot.fundamentalsAsOf !==
        previousSnapshot.fundamentalsAsOf
    ) {
      results.push({
        symbol: item.symbol,
        type: 'filing',
        severity: 'informational',
        title: `${item.symbol} has newer fundamental data`,
        summary:
          'A newer reporting period or filing is now reflected in the available fundamentals.',
        evidence: [
          {
            label: 'Fundamentals as of',
            current: item.currentSnapshot.fundamentalsAsOf,
            previous: previousSnapshot.fundamentalsAsOf ?? 'Unavailable',
          },
        ],
      })
    }
  }

  if (item.earningsDate) {
    const earningsDate = new Date(`${item.earningsDate}T00:00:00Z`)
    const days = Math.ceil(
      (earningsDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    )

    if (days >= 0 && days <= 14) {
      results.push({
        symbol: item.symbol,
        type: 'earnings',
        severity: days <= 3 ? 'watch' : 'informational',
        title: `${item.symbol} earnings are approaching`,
        summary: `Earnings are expected in ${days === 0 ? 'less than a day' : `${days} days`}. Review the weakest fit factors before the report.`,
        evidence: [
          {
            label: 'Expected earnings date',
            current: item.earningsDate,
            previous: null,
          },
          ...(item.currentSnapshot.changePercent != null &&
          Math.abs(item.currentSnapshot.changePercent) >= 5
            ? [
                {
                  label: 'Price context',
                  current: `${item.currentSnapshot.changePercent > 0 ? '+' : ''}${item.currentSnapshot.changePercent.toFixed(1)}% on the latest market day`,
                  previous: null,
                },
              ]
            : []),
        ],
      })
    }
  }

  if (
    item.reviewError ||
    daysBetween(
      new Date(`${item.currentSnapshot.latestTradingDay}T00:00:00Z`),
      now,
    ) > staleDays ||
    (item.currentSnapshot.fundamentalsAsOf != null &&
      daysBetween(
        new Date(`${item.currentSnapshot.fundamentalsAsOf}T00:00:00Z`),
        now,
      ) > staleFundamentalsDays)
  ) {
    const staleFundamentals =
      item.currentSnapshot.fundamentalsAsOf != null &&
      daysBetween(
        new Date(`${item.currentSnapshot.fundamentalsAsOf}T00:00:00Z`),
        now,
      ) > staleFundamentalsDays
    results.push({
      symbol: item.symbol,
      type: 'stale_data',
      severity: 'watch',
      title: `${item.symbol} data needs attention`,
      summary:
        item.reviewError ??
        (staleFundamentals
          ? `The latest known fundamentals are from ${item.currentSnapshot.fundamentalsAsOf}.`
          : `The latest market date is ${item.currentSnapshot.latestTradingDay}.`),
      evidence: [
        {
          label: 'Data freshness',
          current: staleFundamentals
            ? `Fundamentals ${item.currentSnapshot.fundamentalsAsOf}`
            : `Market ${item.currentSnapshot.latestTradingDay}`,
          previous: null,
        },
      ],
    })
  }

  if (item.sentiment && item.previousSentiment) {
    const change = item.sentiment.score - item.previousSentiment.score

    if (Math.abs(change) >= 0.3) {
      results.push({
        symbol: item.symbol,
        type: 'sentiment',
        severity: 'informational',
        title: `${item.symbol} news tone shifted`,
        summary: `Recent headline sentiment moved ${change > 0 ? 'more positive' : 'more negative'}. Treat this as context, not a fundamental signal.`,
        evidence: [
          {
            label: 'Headline sentiment',
            current: item.sentiment.score.toFixed(2),
            previous: item.previousSentiment.score.toFixed(2),
          },
        ],
      })
    }
  }

  return results
}

const concentrationInsight = (
  watchlist: Watchlist,
): Omit<WatchlistInsight, 'id' | 'generatedAt'> | null => {
  if (watchlist.items.length < 3) {
    return null
  }

  const counts = new Map<string, number>()

  watchlist.items.forEach((item) => {
    const sector =
      item.currentSnapshot.sector ??
      item.currentSnapshot.industry ??
      'Unclassified'
    counts.set(sector, (counts.get(sector) ?? 0) + 1)
  })
  const [sector, count] = [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]
  const share = count / watchlist.items.length

  if (share < 0.6) {
    return null
  }

  return {
    symbol: null,
    type: 'concentration',
    severity: share >= 0.8 ? 'attention' : 'watch',
    title: `Your watchlist is concentrated in ${sector}`,
    summary: `${count} of ${watchlist.items.length} watched stocks share this classification. One industry shift could affect much of the list.`,
    evidence: [
      {
        label: 'Watchlist concentration',
        current: formatPercent(share),
        previous: null,
      },
    ],
  }
}

const severityRank: Record<WatchlistInsight['severity'], number> = {
  attention: 0,
  watch: 1,
  informational: 2,
  stable: 3,
}

export const getWeeklyReviewKey = (date = new Date()) => {
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const day = monday.getUTCDay()
  monday.setUTCDate(monday.getUTCDate() - ((day + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

export const isWeeklyReviewDue = (
  watchlist: Watchlist,
  date = new Date(),
) => watchlist.lastWeeklyReviewKey !== getWeeklyReviewKey(date)

export const generateWatchlistBrief = (
  watchlist: Watchlist,
  now = new Date(),
  reviewType: WatchlistBrief['reviewType'] = 'manual',
): WatchlistBrief => {
  const generatedAt = now.toISOString()
  const rawInsights = watchlist.items.flatMap((item) =>
    securityInsights(item, now),
  )
  const concentration = concentrationInsight(watchlist)

  if (concentration) {
    rawInsights.push(concentration)
  }

  const deterministicInsights = rawInsights
    .map((value, index) => insight(value, generatedAt, index))
    .sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity],
    )
  const symbolsWithInsights = new Set(
    deterministicInsights
      .map((current) => current.symbol)
      .filter((symbol): symbol is string => symbol != null),
  )

  return {
    generatedAt,
    reviewType,
    deterministicInsights,
    experimentalInsights: [],
    stableSymbols: watchlist.items
      .map((item) => item.symbol)
      .filter((symbol) => !symbolsWithInsights.has(symbol)),
    errors: watchlist.items
      .filter((item) => item.reviewError)
      .map((item) => `${item.symbol}: ${item.reviewError}`),
    prioritizedSignalIds: [],
    prioritizedEvidenceIds: [],
    aiSummary: null,
    aiAssessments: [],
    crossStockPatterns: [],
    aiUncertainties: [],
    modelStatus: watchlist.modelPreferences.enablePhi ? 'loading' : 'disabled',
  }
}
