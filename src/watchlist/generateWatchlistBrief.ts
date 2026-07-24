import type {
  Watchlist,
  WatchlistBrief,
  WatchlistInsight,
  WatchlistItem,
} from '../domain/watchlist'

const fitChangeThreshold = 10
const priceMoveThreshold = 5
const growthChangeThreshold = 0.1
const marginChangeThreshold = 0.05
const staleDays = 5

const formatPercent = (value: number | null) =>
  value == null
    ? 'unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value)

const formatPoints = (value: number) => `${value > 0 ? '+' : ''}${value} points`

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

  const dailyMove = item.currentSnapshot.changePercent

  if (dailyMove != null && Math.abs(dailyMove) >= priceMoveThreshold) {
    results.push({
      symbol: item.symbol,
      type: 'price_move',
      severity: Math.abs(dailyMove) >= 10 ? 'attention' : 'watch',
      title: `${item.symbol} moved ${dailyMove > 0 ? 'up' : 'down'} sharply`,
      summary: `The latest daily move was ${dailyMove.toFixed(1)}%. Price movement alone does not change the business thesis.`,
      evidence: [
        {
          label: 'Daily price change',
          current: `${dailyMove > 0 ? '+' : ''}${dailyMove.toFixed(1)}%`,
          previous: null,
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
      },
      {
        label: 'Profit margin',
        current: item.currentSnapshot.profitMargin,
        previous: previousSnapshot.profitMargin,
        threshold: marginChangeThreshold,
      },
      {
        label: 'Earnings per share',
        current: item.currentSnapshot.eps,
        previous: previousSnapshot.eps,
        threshold: 0.25,
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
        evidence: changes.map((change) => ({
          label: change.label,
          current:
            change.label === 'Earnings per share'
              ? String(change.current)
              : formatPercent(change.current),
          previous:
            change.label === 'Earnings per share'
              ? String(change.previous)
              : formatPercent(change.previous),
        })),
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
        ],
      })
    }
  }

  if (
    item.reviewError ||
    daysBetween(
      new Date(`${item.currentSnapshot.latestTradingDay}T00:00:00Z`),
      now,
    ) > staleDays
  ) {
    results.push({
      symbol: item.symbol,
      type: 'stale_data',
      severity: 'watch',
      title: `${item.symbol} data needs attention`,
      summary:
        item.reviewError ??
        `The latest market date is ${item.currentSnapshot.latestTradingDay}.`,
      evidence: [
        {
          label: 'Data freshness',
          current: item.currentSnapshot.latestTradingDay,
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
    aiSummary: null,
    aiUncertainties: [],
    modelStatus: 'not_requested',
  }
}
