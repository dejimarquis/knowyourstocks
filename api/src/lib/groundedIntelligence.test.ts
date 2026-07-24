import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  callGroundedModel,
  createEvidenceCatalog,
  intelligenceErrorStatus,
  normalizeConfidence,
  normalizeOpinion,
  normalizeScore,
  resetGroundedIntelligenceStateForTests,
} from './groundedIntelligence'

const response = (content: string, status = 200) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status },
  )

const options = (
  operation: 'research' | 'recommendations' | 'watchlist',
  request: unknown,
) => ({
  operation,
  request,
  clientId: 'shared-client',
  systemPrompt: 'Use evidence.',
  userPrompt: 'Evidence: e1.',
  maxTokens: 50,
  normalize: (value: unknown) => value,
})

describe('callGroundedModel', () => {
  beforeEach(() => {
    resetGroundedIntelligenceStateForTests()
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'deployment-a'
    delete process.env.WEBSITE_SITE_NAME
    delete process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS
  })

  describe('Phi response normalization', () => {
    it('normalizes fractional and ten-point scores', () => {
      expect(normalizeScore(0.82)).toBe(82)
      expect(normalizeScore(8)).toBe(80)
      expect(normalizeScore(82)).toBe(82)
    })

    it('normalizes numeric confidence and derives bounded opinions', () => {
      expect(normalizeConfidence(0.9)).toBe('high')
      expect(normalizeConfidence(65)).toBe('medium')
      expect(normalizeConfidence('very high confidence')).toBe('high')
      expect(normalizeConfidence('moderate')).toBe('medium')
      expect(normalizeConfidence(undefined)).toBe('medium')
      expect(normalizeOpinion('stable fundamentals', 72)).toBe(
        'Promising but mixed',
      )
      expect(normalizeOpinion('contradicts the thesis', 65)).toBe(
        'Promising but mixed',
      )
    })

    it('resolves nested and numeric evidence identifiers', () => {
      const catalog = createEvidenceCatalog([
        { id: 'margin', symbol: 'TEST', text: 'Margin is positive.' },
        { id: 'growth', symbol: 'TEST', text: 'Growth is positive.' },
      ])

      expect(
        catalog
          .resolveIds({ EvidenceIds: [1, '2'] }, { min: 2 })
          .map((item) => item.id),
      ).toEqual(['margin', 'growth'])
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.WEBSITE_SITE_NAME
    delete process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS
  })

  it('separates the six-hour cache by deployment and operation', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(response('{"result":"ok"}')),
      )
    vi.stubGlobal('fetch', fetchMock)

    await callGroundedModel(options('research', { packet: 1 }))
    await callGroundedModel(options('research', { packet: 1 }))
    process.env.FOUNDRY_DEPLOYMENT = 'deployment-b'
    await callGroundedModel(options('research', { packet: 1 }))
    await callGroundedModel(options('watchlist', { packet: 1 }))

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toContain('deployment-a')
    expect(fetchMock.mock.calls[1][0]).toContain('deployment-b')
  })

  it('retries one transient server error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(response('{"result":"recovered"}'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callGroundedModel(options('research', { retry: 1 })),
    ).resolves.toEqual({ result: 'recovered' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries one timeout and then succeeds', async () => {
    const timeout = new Error('timed out')
    timeout.name = 'AbortError'
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(response('{"result":"recovered"}'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callGroundedModel(options('watchlist', { timeout: 1 })),
    ).resolves.toEqual({ result: 'recovered' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces invalid model JSON for deterministic fallback handling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response('not json'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callGroundedModel(options('research', { invalid: 1 })),
    ).rejects.toThrow('invalid JSON')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('regenerates once after invalid model output', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response('not json'))
      .mockResolvedValueOnce(response('{"result":"recovered"}'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callGroundedModel(options('research', { regenerate: 1 })),
    ).resolves.toEqual({ result: 'recovered' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('enforces the per-process client daily limit', async () => {
    process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS = '1'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response('{"result":"ok"}')),
    )

    await callGroundedModel(options('research', { packet: 1 }))
    await expect(
      callGroundedModel(options('research', { packet: 2 })),
    ).rejects.toThrow('daily intelligence limit')
  })

  it('runs in production without durable quota storage', async () => {
    process.env.WEBSITE_SITE_NAME = 'production-app'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response('{"result":"ok"}')),
    )

    await expect(
      callGroundedModel(options('research', { production: true })),
    ).resolves.toEqual({ result: 'ok' })
  })

  it('maps upstream Foundry throttling to HTTP 429', () => {
    expect(intelligenceErrorStatus(new Error('Foundry returned HTTP 429.'))).toBe(
      429,
    )
  })
})
