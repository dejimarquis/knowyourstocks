import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateWatchlistIntelligence,
  parseIntelligenceRequest,
} from './watchlistIntelligence'

const request = parseIntelligenceRequest({
  version: 1,
  thesis: {
    sectors: ['ai'],
    horizon: 'seven-plus',
    risk: 'balanced',
    style: 'quality',
  },
  watchlist: [
    {
      symbol: 'CBRS',
      name: 'Cerebras Systems Inc.',
      sector: 'Semiconductors',
      industry: 'Semiconductors',
      fit: 49,
      fitLabel: 'Limited match',
    },
  ],
  deterministicSignals: [
    {
      id: 'fundamental_change:CBRS:0',
      symbol: 'CBRS',
      type: 'fundamental_change',
      severity: 'watch',
      title: 'CBRS fundamentals changed',
      summary: 'Revenue growth improved while profit margin remains negative.',
      evidence: [
        {
          label: 'Profit margin',
          current: 'negative',
          previous: null,
        },
      ],
    },
    {
      id: 'thesis_drift:CBRS:1',
      symbol: 'CBRS',
      type: 'thesis_drift',
      severity: 'attention',
      title: 'CBRS may be drifting',
      summary: 'Profitability conflicts with the quality preference.',
      evidence: [
        {
          label: 'Thesis fit',
          current: 'limited',
          previous: null,
        },
      ],
    },
  ],
})

describe('generateWatchlistIntelligence', () => {
  beforeEach(() => {
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'phi-test'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    order: ['s2', 's1'],
                    patterns: [
                      {
                        evidenceIds: ['s1', 's2'],
                        label: 'Growth and quality are in tension',
                        confidence: 'high',
                      },
                    ],
                    uncertainties: ['Only recent evidence is available.'],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not call Foundry when there are no verified signals', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const stableRequest = parseIntelligenceRequest({
      version: 1,
      thesis: request.thesis,
      deterministicSignals: [],
    })

    const output = await generateWatchlistIntelligence(
      stableRequest,
      'stable-client',
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(output.experimentalPatterns).toEqual([])
  })

  it('maps compact aliases back to verified signal IDs', async () => {
    const output = await generateWatchlistIntelligence(
      request,
      'test-client-alias-map',
    )

    expect(output.prioritizedSignalIds).toEqual([
      'thesis_drift:CBRS:1',
      'fundamental_change:CBRS:0',
    ])
    expect(output.experimentalPatterns[0].evidenceIds).toEqual([
      'fundamental_change:CBRS:0',
      'thesis_drift:CBRS:1',
    ])
    expect(output.experimentalPatterns[0].explanation).toContain(
      'Revenue growth improved',
    )
  })

  it('rejects prohibited investment-advice language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    order: ['s1', 's2'],
                    patterns: [
                      {
                        evidenceIds: ['s1', 's2'],
                        label: 'Buy before momentum returns',
                        confidence: 'high',
                      },
                    ],
                    uncertainties: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )

    const uniqueRequest = parseIntelligenceRequest({
      ...request,
      thesis: { ...request.thesis, note: 'advice-language-test' },
    })

    await expect(
      generateWatchlistIntelligence(uniqueRequest, 'test-client-prohibited'),
    ).rejects.toThrow('prohibited investment advice')
  })

  it('normalizes Phi simplified relationship output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    relationship: 'quality tension',
                    value: 's2',
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )
    const uniqueRequest = parseIntelligenceRequest({
      ...request,
      thesis: { ...request.thesis, note: 'simplified-output-test' },
    })

    const output = await generateWatchlistIntelligence(
      uniqueRequest,
      'test-client-simplified',
    )

    expect(output.prioritizedSignalIds).toEqual(['thesis_drift:CBRS:1'])
    expect(output.experimentalPatterns).toEqual([])
    expect(output.uncertainties).toContain(
      'Phi returned only one relationship signal, so no cross-signal pattern was shown.',
    )
  })

  it('rejects duplicate aliases as cross-signal evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    order: ['s1'],
                    patterns: [
                      {
                        evidenceIds: ['s1', 's1'],
                        label: 'Repeated evidence',
                        confidence: 'high',
                      },
                    ],
                    uncertainties: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )
    const uniqueRequest = parseIntelligenceRequest({
      ...request,
      thesis: { ...request.thesis, note: 'duplicate-evidence-test' },
    })

    const output = await generateWatchlistIntelligence(
      uniqueRequest,
      'test-client-duplicate',
    )

    expect(output.experimentalPatterns).toEqual([])
  })

  it('normalizes Phi compact priority output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    priority_order: ['s2', 's1'],
                    cross_signals: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )
    const uniqueRequest = parseIntelligenceRequest({
      ...request,
      thesis: { ...request.thesis, note: 'compact-output-test' },
    })

    const output = await generateWatchlistIntelligence(
      uniqueRequest,
      'test-client-compact',
    )

    expect(output.prioritizedSignalIds).toEqual([
      'thesis_drift:CBRS:1',
      'fundamental_change:CBRS:0',
    ])
    expect(output.experimentalPatterns).toEqual([])
  })
})
