import {
  emptyWatchlist,
  watchlistLimit,
  watchlistSchema,
  type Watchlist,
  type WatchlistItem,
} from '../domain/watchlist'

const storageKey = 'knowyourstocks.watchlist'

export type LoadWatchlistResult = {
  watchlist: Watchlist
  recoveryRequired: boolean
}

export const loadWatchlist = (): LoadWatchlistResult => {
  const storedValue = window.localStorage.getItem(storageKey)

  if (!storedValue) {
    return { watchlist: emptyWatchlist, recoveryRequired: false }
  }

  try {
    return {
      watchlist: watchlistSchema.parse(JSON.parse(storedValue)),
      recoveryRequired: false,
    }
  } catch {
    return { watchlist: emptyWatchlist, recoveryRequired: true }
  }
}

export const saveWatchlist = (watchlist: Watchlist): void => {
  window.localStorage.setItem(storageKey, JSON.stringify(watchlist))
}

export const addWatchlistItem = (
  watchlist: Watchlist,
  item: WatchlistItem,
): Watchlist => {
  if (watchlist.items.some((current) => current.symbol === item.symbol)) {
    return watchlist
  }

  if (watchlist.items.length >= watchlistLimit) {
    throw new Error(`Watchlists are limited to ${watchlistLimit} securities.`)
  }

  return {
    ...watchlist,
    items: [...watchlist.items, item],
  }
}

export const removeWatchlistItem = (
  watchlist: Watchlist,
  symbol: string,
): Watchlist => ({
  ...watchlist,
  items: watchlist.items.filter((item) => item.symbol !== symbol),
})
