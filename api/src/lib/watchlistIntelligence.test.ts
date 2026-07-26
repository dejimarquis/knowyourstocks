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

const response = (content: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200 },
  )

const claim = (text: string, citationId: string) => ({
  text,
  citationIds: [citationId],
})

const stableOutput = {
  overallOpinion: 'Fits thesis',
  overallSummary: claim(
    'Both companies remain supported by stable business evidence.',
    'msft-stable',
  ),
  prioritizedEvidenceIds: [],
  stocks: [
    {
      symbol: 'MSFT',
      opinion: 'Fits thesis',
      whatChanged: claim('No material change', 'msft-stable'),
      whyItFits: [
        claim('Margins and cash flow remain aligned with the thesis.', 'msft-stable'),
      ],
      concerns: [
        claim('The supplied evidence is limited to the stable update.', 'msft-stable'),
      ],
      whatToWatchNext: [
        claim('Watch for a verified change in business evidence.', 'msft-stable'),
      ],
      confidence: 'high',
    },
    {
      symbol: 'GOOGL',
      opinion: 'Fits thesis',
      whatChanged: claim('No material change', 'googl-stable'),
      whyItFits: [
        claim('Business evidence remains aligned with the thesis.', 'googl-stable'),
      ],
      concerns: [
        claim('The supplied evidence is limited to the stable update.', 'googl-stable'),
      ],
      whatToWatchNext: [
        claim('Watch for a verified change in business evidence.', 'googl-stable'),
      ],
      confidence: 'medium',
    },
  ],
  crossStockPatterns: [],
}

describe('generateWatchlistIntelligence', () => {
  beforeEach(() => {
    resetGroundedIntelligenceStateForTests()
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'gpt-5-mini-intelligence'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(stableOutput)))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('returns a stable, cited opinion for every supplied stock without scores', async () => {
    const output = await generateWatchlistIntelligence(request, 'stable-client')

    expect(output.prioritizedEvidenceIds).toEqual([])
    expect(output.stocks.map((item) => item.symbol)).toEqual(['MSFT', 'GOOGL'])
    expect(output.stocks[0]).toMatchObject({
      opinion: 'Fits thesis',
      confidence: 'high',
      whatChanged: { text: 'No material change' },
    })
    expect(output.stocks.every((stock) => !('score' in stock))).toBe(true)
    expect(output.stocks[0].whyItFits[0].citations[0].text).toContain(
      'materially unchanged',
    )
  })

  it('limits every strict citation field to supplied evidence IDs', async () => {
    await generateWatchlistIntelligence(request, 'watchlist-schema-client')
    const body = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    )
    const schema = body.response_format.json_schema.schema
    const allowed = ['msft-stable', 'googl-stable']

    expect(body.messages[0].content).toContain(
      'must contain no digits or numeric values',
    )
    expect(schema.$defs.claim.properties.citationIds.items.enum).toEqual(allowed)
    expect(
      schema.properties.crossStockPatterns.items.properties.citationIds.items
        .enum,
    ).toEqual(allowed)
    expect(schema.properties.prioritizedEvidenceIds.items.enum).toEqual(allowed)
    expect(schema.properties.stocks.items.properties.symbol.enum).toEqual([
      'MSFT',
      'GOOGL',
    ])
    expect(schema.$defs.claim.properties.citationIds.items.enum).not.toContain(
      'invented-id',
    )
  })

  it('rejects unknown prioritized evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ ...stableOutput, prioritizedEvidenceIds: ['e99'] }),
      ),
    )
    await expect(
      generateWatchlistIntelligence(request, 'unknown-evidence-client'),
    ).rejects.toThrow('unknown evidence ID')
  })

  it('rejects evidence attached to another stock', async () => {
    const invalid = structuredClone(stableOutput)
    invalid.stocks[0].whyItFits[0].citationIds = ['googl-stable']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))
    await expect(
      generateWatchlistIntelligence(request, 'misattached-client'),
    ).rejects.toThrow('misattached evidence')
  })

  it('rejects out-of-set or omitted stock symbols', async () => {
    const outOfSet = structuredClone(stableOutput)
    outOfSet.stocks[1].symbol = 'NVDA'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(outOfSet)))
    await expect(
      generateWatchlistIntelligence(request, 'out-of-set-client'),
    ).rejects.toThrow('out-of-set symbol')

    resetGroundedIntelligenceStateForTests()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ ...stableOutput, stocks: stableOutput.stocks.slice(0, 1) }),
      ),
    )
    await expect(
      generateWatchlistIntelligence(request, 'omitted-client'),
    ).rejects.toThrow('assess every supplied')
  })

  it('dedupes valid pattern citations and drops invalid optional patterns', async () => {
    const validPattern = {
      title: 'Shared stable evidence',
      summary: 'Both businesses have stable evidence relevant to the thesis.',
      citationIds: ['msft-stable', 'msft-stable', 'googl-stable'],
      confidence: 'medium',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ ...stableOutput, crossStockPatterns: [validPattern] }),
      ),
    )
    const output = await generateWatchlistIntelligence(
      request,
      'valid-pattern-client',
    )
    expect(output.crossStockPatterns[0].citations).toHaveLength(2)
    expect(output.crossStockPatterns[0].citationIds).toEqual([
      'msft-stable',
      'googl-stable',
    ])

    resetGroundedIntelligenceStateForTests()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          ...stableOutput,
          crossStockPatterns: [
            {
              ...validPattern,
              citationIds: ['msft-stable', 'msft-stable'],
            },
            {
              ...validPattern,
              title: 'Buy both companies',
              citationIds: ['msft-stable', 'googl-stable'],
            },
            {
              title: 'Malformed optional pattern',
              citationIds: ['msft-stable', 'googl-stable'],
              confidence: 'medium',
            },
          ],
        }),
      ),
    )
    const dropped = await generateWatchlistIntelligence(
      request,
      'invalid-pattern-client',
    )
    expect(dropped.stocks).toHaveLength(2)
    expect(dropped.crossStockPatterns).toEqual([])
  })

  it('drops patterns with evidence misattached to a non-watchlist symbol', async () => {
    const requestWithMisattachedEvidence = parseIntelligenceRequest({
      ...request,
      stocks: request.stocks.map((stock) =>
        stock.symbol === 'MSFT'
          ? {
              ...stock,
              evidence: [
                ...stock.evidence,
                {
                  id: 'other-symbol',
                  symbol: 'NVDA',
                  text: 'Evidence belongs to another symbol.',
                },
              ],
            }
          : stock,
      ),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          ...stableOutput,
          crossStockPatterns: [
            {
              title: 'Misattached relationship',
              summary: 'The relationship uses evidence from another symbol.',
              citationIds: ['other-symbol', 'googl-stable'],
              confidence: 'medium',
            },
          ],
        }),
      ),
    )

    const output = await generateWatchlistIntelligence(
      requestWithMisattachedEvidence,
      'misattached-pattern-client',
    )
    expect(output.stocks).toHaveLength(2)
    expect(output.crossStockPatterns).toEqual([])
  })

  it('rejects trade commands and score fields', async () => {
    const advice = structuredClone(stableOutput)
    advice.stocks[0].whatChanged.text = 'Buy because evidence is stable.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(advice)))
    await expect(
      generateWatchlistIntelligence(request, 'advice-client'),
    ).rejects.toThrow('prohibited investment advice')

    resetGroundedIntelligenceStateForTests()
    const scored = structuredClone(stableOutput) as typeof stableOutput & {
      score: number
    }
    scored.score = 75
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(scored)))
    await expect(
      generateWatchlistIntelligence(request, 'score-client'),
    ).rejects.toThrow()
  })

  it('returns a truthful fallback for an empty legacy request', async () => {
    const legacy = parseIntelligenceRequest({
      version: 1,
      thesis: request.thesis,
      deterministicSignals: [],
    })
    const output = await generateWatchlistIntelligence(legacy, 'legacy-client')

    expect(fetch).not.toHaveBeenCalled()
    expect(output).toMatchObject({
      overallOpinion: 'Insufficient evidence',
      prioritizedSignalIds: [],
      prioritizedEvidenceIds: [],
      stocks: [],
    })
  })

  it('maps prioritized deterministic signals to trusted evidence text', async () => {
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
          overallOpinion: 'Mixed',
          overallSummary: claim(
            'Watchlist concentration is the main verified concern.',
            'concentration:watchlist:0',
          ),
          prioritizedEvidenceIds: ['concentration:watchlist:0'],
          stocks: [],
          crossStockPatterns: [],
        }),
      ),
    )
    const output = await generateWatchlistIntelligence(
      legacy,
      'legacy-signal-client',
    )

    expect(output.prioritizedSignalIds).toEqual([
      'concentration:watchlist:0',
    ])
    expect(output.prioritizedEvidence[0].text).toContain(
      'Watchlist concentration',
    )
  })
})
