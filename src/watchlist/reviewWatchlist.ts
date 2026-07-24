import {
  fetchFinnhubEarningsCalendar,
  fetchFinnhubSentiment,
  refreshFinnhubSecurity,
} from '../data/finnhub'
import { enrichWithSecFallback } from '../data/sec'
import type { InvestmentThesis } from '../domain/thesis'
import type { Watchlist, WatchlistItem } from '../domain/watchlist'
import { scoreSecurity } from '../scoring/scoreSecurity'

const reviewConcurrency = 3
const sentimentLimit = 3
const reviewCooldownMs = 60_000

const dateOnly = (date: Date) => date.toISOString().slice(0, 10)

const addDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

const mapWithConcurrency = async <Input, Output>(
  values: Input[],
  concurrency: number,
  worker: (value: Input) => Promise<Output>,
): Promise<Output[]> => {
  const results = new Array<Output>(values.length)
  let nextIndex = 0

  const run = async () => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(values[currentIndex])
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => run(),
    ),
  )
  return results
}

const refreshItem = async (
  item: WatchlistItem,
  thesis: InvestmentThesis,
  token: string,
  reviewedAt: string,
): Promise<WatchlistItem> => {
  try {
    const providerSnapshot = await refreshFinnhubSecurity(
      item.currentSnapshot,
      token,
    )
    const snapshot = await enrichWithSecFallback(providerSnapshot)

    return {
      ...item,
      previousSnapshot: item.currentSnapshot,
      currentSnapshot: snapshot,
      previousFit: item.currentFit,
      currentFit: scoreSecurity(snapshot, thesis),
      lastReviewedAt: reviewedAt,
      reviewError: null,
    }
  } catch (error) {
    return {
      ...item,
      lastReviewedAt: reviewedAt,
      reviewError:
        error instanceof Error ? error.message : 'Refresh failed.',
    }
  }
}

export const reviewWatchlist = async (
  watchlist: Watchlist,
  thesis: InvestmentThesis,
  token: string,
  now = new Date(),
): Promise<Watchlist> => {
  const key = token.trim()

  if (!key) {
    throw new Error('Add your Finnhub key before reviewing the watchlist.')
  }

  if (watchlist.items.length === 0) {
    return watchlist
  }

  if (
    watchlist.lastReviewAt &&
    now.getTime() - new Date(watchlist.lastReviewAt).getTime() < reviewCooldownMs
  ) {
    throw new Error(
      'Finnhub limits free requests. Wait one minute between full watchlist reviews.',
    )
  }

  const reviewedAt = now.toISOString()
  const refreshedItems = await mapWithConcurrency(
    watchlist.items,
    reviewConcurrency,
    (item) => refreshItem(item, thesis, key, reviewedAt),
  )
  const symbols = refreshedItems.map((item) => item.symbol)
  const earnings = await fetchFinnhubEarningsCalendar(
    symbols,
    key,
    dateOnly(now),
    dateOnly(addDays(now, 14)),
  ).catch(() => new Map<string, string>())
  const sentimentCandidates = [...refreshedItems]
    .filter((item) => item.reviewError == null)
    .sort(
      (left, right) =>
        Math.abs(right.currentSnapshot.changePercent ?? 0) -
        Math.abs(left.currentSnapshot.changePercent ?? 0),
    )
    .slice(0, sentimentLimit)
  const sentiments = new Map(
    await mapWithConcurrency(sentimentCandidates, 2, async (item) => [
      item.symbol,
      await fetchFinnhubSentiment(item.symbol, key),
    ] as const),
  )

  return {
    ...watchlist,
    lastReviewAt: reviewedAt,
    items: refreshedItems.map((item) => {
      const sentiment = sentiments.get(item.symbol)
      return {
        ...item,
        earningsDate: earnings.get(item.symbol) ?? null,
        previousSentiment: item.sentiment,
        sentiment: sentiment
          ? { ...sentiment, asOf: reviewedAt }
          : item.sentiment,
      }
    }),
  }
}
