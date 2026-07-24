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

  let watchlist: Watchlist

  try {
    watchlist = watchlistSchema.parse(JSON.parse(storedValue))
  } catch {
    return { watchlist: emptyWatchlist, recoveryRequired: true }
  }

  const migratedValue = JSON.stringify(watchlist)
  if (migratedValue !== storedValue) {
    try {
      window.localStorage.setItem(storageKey, migratedValue)
    } catch {
      // A valid watchlist remains usable even if migration persistence fails.
    }
  }

  return {
    watchlist,
    recoveryRequired: false,
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
