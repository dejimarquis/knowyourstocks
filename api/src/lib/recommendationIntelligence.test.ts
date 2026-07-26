import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetGroundedIntelligenceStateForTests } from './groundedIntelligence'
import {
  generateRecommendationIntelligence,
  parseRecommendationIntelligenceRequest,
} from './recommendationIntelligence'

const symbols = ['MSFT', 'GOOGL', 'NVDA', 'TSM', 'IBM', 'XOM']
const request = parseRecommendationIntelligenceRequest({
  version: 1,
  thesis: {
    sectors: ['technology'],
    horizon: 'long-term',
    risk: 'balanced',
    style: 'quality',
  },
  candidates: symbols.map((symbol, index) => ({
    symbol,
    name: symbol,
    deterministicFit: 80 - index,
    evidence: [
      {
        id: `${symbol}-evidence`,
        symbol,
        text: `${symbol} has supplied quality and uncertainty evidence.`,
      },
    ],
  })),
})

const response = (content: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200 },
  )

const validOutput = {
  rankings: symbols.map((symbol) => ({
    symbol,
    opinion: symbol === 'XOM' ? 'Weak fit' : 'Mixed',
    thesisRationale: 'The supplied evidence describes the thesis fit.',
    mainConcern: 'The supplied evidence also identifies uncertainty.',
    whatToResearchNext: 'Research the identified uncertainty further.',
    confidence: 'medium',
    citationIds: [`${symbol}-evidence`],
  })),
}

describe('generateRecommendationIntelligence', () => {
  beforeEach(() => {
    resetGroundedIntelligenceStateForTests()
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'gpt-5-mini-intelligence'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validOutput)))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('returns every supplied candidate once, in model order, without scores', async () => {
    const output = await generateRecommendationIntelligence(
      request,
      'recommendation-client',
    )

    expect(output.rankings.map((item) => item.symbol)).toEqual(symbols)
    expect(output.rankings.every((item) => !('score' in item))).toBe(true)
    expect(output.rankings[0].citationIds).toEqual(['MSFT-evidence'])
    expect(output.rankings[0].citations[0]).toMatchObject({
      evidenceId: 'MSFT-evidence',
      symbol: 'MSFT',
    })
  })

  it('sends a strict score-free ranking schema', async () => {
    await generateRecommendationIntelligence(request, 'recommendation-schema')
    const body = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    )
    const item = body.response_format.json_schema.schema.properties.rankings.items
    expect(body.messages[0].content).toContain(
      'must contain no digits or numeric values',
    )
    expect(item.additionalProperties).toBe(false)
    expect(item.required).toEqual(
      expect.arrayContaining([
        'symbol',
        'opinion',
        'thesisRationale',
        'mainConcern',
        'whatToResearchNext',
        'confidence',
        'citationIds',
      ]),
    )
    expect(item.properties.score).toBeUndefined()
    expect(item.properties.symbol.enum).toEqual(symbols)
    expect(item.properties.citationIds.items.enum).toEqual(
      symbols.map((symbol) => `${symbol}-evidence`),
    )
    expect(item.properties.citationIds.items.enum).not.toContain('unknown')
  })

  it('rejects an out-of-set symbol', async () => {
    const invalid = structuredClone(validOutput)
    invalid.rankings[0].symbol = 'AAPL'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))

    await expect(
      generateRecommendationIntelligence(request, 'recommendation-symbol'),
    ).rejects.toThrow('out-of-set symbol')
  })

  it('rejects omitted and duplicate candidates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ rankings: validOutput.rankings.slice(0, -1) }),
      ),
    )
    await expect(
      generateRecommendationIntelligence(request, 'recommendation-omitted'),
    ).rejects.toThrow('rank exactly')

    resetGroundedIntelligenceStateForTests()
    const duplicate = structuredClone(validOutput)
    duplicate.rankings[1] = {
      ...duplicate.rankings[1],
      symbol: 'MSFT',
      citationIds: ['MSFT-evidence'],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(duplicate)))
    await expect(
      generateRecommendationIntelligence(request, 'recommendation-duplicate'),
    ).rejects.toThrow('duplicate recommendation symbols')
  })

  it('rejects unknown or misattached evidence', async () => {
    const unknown = structuredClone(validOutput)
    unknown.rankings[0].citationIds = ['unknown']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(unknown)))
    await expect(
      generateRecommendationIntelligence(request, 'recommendation-unknown'),
    ).rejects.toThrow('unknown evidence ID')

    resetGroundedIntelligenceStateForTests()
    const misattached = structuredClone(validOutput)
    misattached.rankings[0].citationIds = ['GOOGL-evidence']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(misattached)))
    await expect(
      generateRecommendationIntelligence(request, 'recommendation-evidence'),
    ).rejects.toThrow('misattached evidence')
  })

  it('rejects direct trade instructions and score fields', async () => {
    const advice = structuredClone(validOutput)
    advice.rankings[0].thesisRationale = 'Buy because the evidence is supportive.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(advice)))
    await expect(
      generateRecommendationIntelligence(request, 'recommendation-advice'),
    ).rejects.toThrow('prohibited investment advice')

    resetGroundedIntelligenceStateForTests()
    const scored = {
      rankings: validOutput.rankings.map((item) => ({ ...item, score: 80 })),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(scored)))
    await expect(
      generateRecommendationIntelligence(request, 'recommendation-score'),
    ).rejects.toThrow()
  })
})
