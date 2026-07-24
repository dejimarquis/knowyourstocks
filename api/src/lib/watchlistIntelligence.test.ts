import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetGroundedIntelligenceStateForTests } from './groundedIntelligence'
import {
  generateWatchlistIntelligence,
  parseIntelligenceRequest,
} from './watchlistIntelligence'

const request = parseIntelligenceRequest({
  version: 2,
  thesis: {
    sectors: ['technology'],
    horizon: 'long-term',
    risk: 'balanced',
    style: 'quality',
  },
  stocks: [
    {
      symbol: 'MSFT',
      name: 'Microsoft',
      currentSnapshot: {
        earningsGrowth: 0.12,
        operatingMargin: 0.44,
        freeCashFlow: 74_000_000_000,
        debtToEquity: 0.4,
        currentRatio: 1.3,
        metricProvenance: {
          earningsGrowth: {
            source: 'Finnhub',
            asOf: '2026-06-30',
            period: 'TTM',
          },
        },
      },
      evidence: [
        {
          id: 'msft-stable',
          symbol: 'MSFT',
          text: 'Margins, growth, cash flow, and thesis fit are materially unchanged.',
        },
      ],
    },
    {
      symbol: 'GOOGL',
      name: 'Alphabet',
      evidence: [
        {
          id: 'googl-stable',
          symbol: 'GOOGL',
          text: 'Business evidence and thesis fit are materially unchanged.',
        },
      ],
    },
  ],
  deterministicSignals: [],
})

const response = (content: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status },
  )

const stableOutput = {
  summary: 'Both companies remain supported by stable business evidence.',
  priorityEvidenceIds: [],
  assessments: [
    {
      symbol: 'msft',
      score: 8,
      opinion: 'promising BUT mixed',
      summary: 'Business evidence remains stable.',
      strengthEvidenceIds: [1],
      riskEvidenceIds: ['e1'],
      confidence: 'HIGH',
    },
    {
      symbol: 'googl',
      score: 75,
      opinion: 'Compelling',
      summary: 'Thesis fit remains stable.',
      strengthEvidenceIds: ['2'],
      riskEvidenceIds: ['e2'],
      confidence: 'medium',
    },
  ],
  crossStockPatterns: [],
  uncertainties: [],
}

describe('generateWatchlistIntelligence', () => {
  beforeEach(() => {
    resetGroundedIntelligenceStateForTests()
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'phi-test'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(stableOutput)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('assesses every supplied stock in a stable watchlist', async () => {
    const output = await generateWatchlistIntelligence(request, 'stable-client')

    expect(fetch).toHaveBeenCalledOnce()
    expect(output.prioritizedEvidenceIds).toEqual([])
    expect(output.assessments.map((item) => item.symbol)).toEqual([
      'MSFT',
      'GOOGL',
    ])
    expect(output.assessments[0]).toMatchObject({
      score: 80,
      opinion: 'Compelling',
      confidence: 'high',
    })
    expect(output.assessments[0].strengths[0].text).toContain('unchanged')
  })

  it('normalizes the live top-level stock map variant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          MSFT: {
            symbol: 'MSFT',
            score: 3,
            opinion: 'Watch closely',
            strengthEvidenceIds: ['e1'],
            riskEvidenceIds: ['e1'],
            confidence: 0.7,
          },
          GOOGL: {
            symbol: 'GOOGL',
            score: 3,
            opinion: 'Watch closely',
            strengthEvidenceIds: ['e2'],
            riskEvidenceIds: ['e2'],
            confidence: 0.7,
          },
        }),
      ),
    )

    const output = await generateWatchlistIntelligence(
      request,
      'symbol-map-client',
    )

    expect(output.assessments).toHaveLength(2)
    expect(output.assessments[0]).toMatchObject({
      symbol: 'MSFT',
      score: 30,
      confidence: 'medium',
    })
  })

  it('validates all assessment evidence before limiting display to three', async () => {
    const denseRequest = parseIntelligenceRequest({
      version: 2,
      thesis: request.thesis,
      stocks: [
        {
          symbol: 'MSFT',
          name: 'Microsoft',
          evidence: [1, 2, 3, 4].map((index) => ({
            id: `msft-${index}`,
            symbol: 'MSFT',
            text: `Verified Microsoft evidence ${index}.`,
          })),
        },
      ],
      deterministicSignals: [],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          MSFT: {
            symbol: 'MSFT',
            score: 70,
            opinion: 'Promising but mixed',
            strengthEvidenceIds: [1, 2, 3, 4],
            riskEvidenceIds: [1, 2, 3, 4],
            confidence: 'medium',
          },
        }),
      ),
    )

    const output = await generateWatchlistIntelligence(
      denseRequest,
      'dense-evidence-client',
    )

    expect(output.assessments[0].strengths).toHaveLength(3)
    expect(output.assessments[0].risks).toHaveLength(3)
  })

  it('rejects unknown prioritized evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ ...stableOutput, priorityEvidenceIds: ['e99'] }),
      ),
    )

    await expect(
      generateWatchlistIntelligence(request, 'unknown-evidence-client'),
    ).rejects.toThrow('unknown evidence ID')
  })

  it('rejects evidence attached to another stock assessment', async () => {
    const invalid = structuredClone(stableOutput)
    invalid.assessments[0].strengthEvidenceIds = [2]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))

    await expect(
      generateWatchlistIntelligence(request, 'misattached-client'),
    ).rejects.toThrow('misattached evidence')
  })

  it('rejects out-of-set assessment symbols', async () => {
    const invalid = structuredClone(stableOutput)
    invalid.assessments[1].symbol = 'NVDA'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))

    await expect(
      generateWatchlistIntelligence(request, 'out-of-set-client'),
    ).rejects.toThrow('out-of-set symbol')
  })

  it('rejects duplicate relationship evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          ...stableOutput,
          crossStockPatterns: [
            {
              title: 'Shared stability',
              explanation: 'Both businesses show stable evidence.',
              evidenceIds: ['e1', 'e1'],
              confidence: 'medium',
              thesisRelationship: 'The pattern is relevant to quality.',
            },
          ],
        }),
      ),
    )

    await expect(
      generateWatchlistIntelligence(request, 'duplicate-pattern-client'),
    ).rejects.toThrow('duplicate relationship evidence')
  })

  it('rejects direct trade instructions in stock narratives', async () => {
    const invalid = structuredClone(stableOutput)
    invalid.assessments[0].summary = 'Buy because business evidence is stable.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))

    await expect(
      generateWatchlistIntelligence(request, 'advice-client'),
    ).rejects.toThrow('prohibited investment advice')
  })

  it('keeps the legacy empty-signal response compatible without a model call', async () => {
    const legacy = parseIntelligenceRequest({
      version: 1,
      thesis: request.thesis,
      deterministicSignals: [],
    })

    const output = await generateWatchlistIntelligence(legacy, 'legacy-client')

    expect(fetch).not.toHaveBeenCalled()
    expect(output.prioritizedSignalIds).toEqual([])
    expect(output.experimentalPatterns).toEqual([])
  })

  it('preserves legacy watchlist-level signals', async () => {
    const legacy = parseIntelligenceRequest({
      version: 1,
      thesis: request.thesis,
      deterministicSignals: [
        {
          id: 'concentration:watchlist:0',
          symbol: null,
          type: 'concentration',
          severity: 'watch',
          title: 'Watchlist concentration',
          summary: 'Several stocks share one classification.',
          evidence: [
            {
              label: 'Concentration',
              current: 'high',
              previous: null,
            },
          ],
        },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          summary: 'Concentration deserves review.',
          priorityEvidenceIds: [1],
          assessments: [],
          crossStockPatterns: [],
          uncertainties: [],
        }),
      ),
    )

    const output = await generateWatchlistIntelligence(
      legacy,
      'legacy-concentration-client',
    )

    expect(fetch).toHaveBeenCalledOnce()
    expect(output.prioritizedSignalIds).toEqual([
      'concentration:watchlist:0',
    ])
  })
})
