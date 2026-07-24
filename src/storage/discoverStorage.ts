import type { InvestmentThesis } from '../domain/thesis'
import type { DiscoverResult } from '../discover/recommendations'
import { discoverUniverseVersion } from '../discover/universe'

const cacheStorageKey = 'knowyourstocks.discoverCache'
const cooldownStorageKey = 'knowyourstocks.discoverCooldown'
const cacheLifetimeMs = 6 * 60 * 60 * 1000
const cooldownMs = 60 * 1000

export const createDiscoverFingerprint = (
  thesis: InvestmentThesis,
  watchedSymbols: Iterable<string>,
  recentSymbols: string[] = [],
  currentSymbol?: string | null,
) =>
  JSON.stringify({
    universeVersion: discoverUniverseVersion,
    thesis,
    watchedSymbols: [...watchedSymbols]
      .map((symbol) => symbol.trim().toUpperCase())
      .sort(),
    recentSymbols: recentSymbols
      .map((symbol) => symbol.trim().toUpperCase())
      .slice(0, 2),
    currentSymbol: currentSymbol?.trim().toUpperCase() ?? null,
  })

type StoredDiscoverResult = {
  fingerprint: string
  result: DiscoverResult
}

export const loadDiscoverResult = (
  fingerprint: string,
  now = Date.now(),
): DiscoverResult | null => {
  try {
    const raw = window.localStorage.getItem(cacheStorageKey)
    if (!raw) {
      return null
    }
    const stored = JSON.parse(raw) as StoredDiscoverResult
    const generatedAt = Date.parse(stored.result?.generatedAt)
    if (
      stored.fingerprint !== fingerprint ||
      stored.result?.version !== 1 ||
      stored.result?.universeVersion !== discoverUniverseVersion ||
      !Array.isArray(stored.result?.recommendations) ||
      !Number.isFinite(generatedAt) ||
      now - generatedAt >= cacheLifetimeMs
    ) {
      return null
    }
    return stored.result
  } catch {
    return null
  }
}

export const saveDiscoverResult = (
  fingerprint: string,
  result: DiscoverResult,
) => {
  try {
    window.localStorage.setItem(
      cacheStorageKey,
      JSON.stringify({ fingerprint, result }),
    )
  } catch {
    // Discover still works when browser storage is unavailable.
  }
}

export const getDiscoverCooldownRemaining = (now = Date.now()) => {
  try {
    const startedAt = Number(window.localStorage.getItem(cooldownStorageKey))
    if (!Number.isFinite(startedAt)) {
      return 0
    }
    return Math.max(0, cooldownMs - (now - startedAt))
  } catch {
    return 0
  }
}

export const startDiscoverCooldown = (now = Date.now()) => {
  try {
    window.localStorage.setItem(cooldownStorageKey, String(now))
  } catch {
    // Provider-side rate limits remain the final safeguard.
  }
}
