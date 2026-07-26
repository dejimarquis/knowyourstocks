import { beforeEach, describe, expect, it } from 'vitest'
import { defaultThesis } from '../domain/thesis'
import type { DiscoverResult } from '../discover/recommendations'
import {
  createDiscoverFingerprint,
  getDiscoverCooldownRemaining,
  loadDiscoverResult,
  saveDiscoverResult,
  startDiscoverCooldown,
} from './discoverStorage'

const result: DiscoverResult = {
  version: 2,
  universeVersion: 1,
  generatedAt: '2026-07-23T20:00:00.000Z',
  modelStatus: 'fallback',
  recommendations: [],
  providerErrors: 0,
}

describe('discover storage', () => {
  beforeEach(() => window.localStorage.clear())

  it('reuses matching local results for six hours only', () => {
    const fingerprint = createDiscoverFingerprint(defaultThesis, [], [], null)
    const generatedAt = Date.parse(result.generatedAt)
    saveDiscoverResult(fingerprint, result)

    expect(
      loadDiscoverResult(fingerprint, generatedAt + 6 * 60 * 60 * 1000 - 1),
    ).toEqual(result)
    expect(
      loadDiscoverResult(fingerprint, generatedAt + 6 * 60 * 60 * 1000),
    ).toBeNull()
  })

  it('enforces a local one-minute refresh cooldown', () => {
    startDiscoverCooldown(1_000)

    expect(getDiscoverCooldownRemaining(31_000)).toBe(30_000)
    expect(getDiscoverCooldownRemaining(61_000)).toBe(0)
  })

  it('discards legacy score-bearing cached recommendations', () => {
    const fingerprint = createDiscoverFingerprint(defaultThesis, [], [], null)
    window.localStorage.setItem(
      'knowyourstocks.discoverCache',
      JSON.stringify({
        fingerprint,
        result: {
          version: 1,
          universeVersion: 1,
          generatedAt: result.generatedAt,
          modelStatus: 'generated',
          providerErrors: 0,
          recommendations: [{ aiScore: 88 }],
        },
      }),
    )

    expect(loadDiscoverResult(fingerprint, Date.parse(result.generatedAt))).toBeNull()
    expect(
      window.localStorage.getItem('knowyourstocks.discoverCache'),
    ).toBeNull()
  })
})
