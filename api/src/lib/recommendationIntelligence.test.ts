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
        text: `${symbol} has supplied quality and risk evidence.`,
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
  Rankings: symbols.slice(0, 5).map((symbol, index) => ({
    Symbol: symbol.toLowerCase(),
    Score: 8 - index * 0.5,
    Opinion: index < 2 ? 'Compelling' : 'Promising but mixed',
    Confidence: index < 2 ? 0.9 : 0.7,
    Rationale: 'The supplied evidence supports thesis fit.',
    Risk: 'The supplied evidence also identifies uncertainty.',
    RationaleEvidenceIds: [index + 1],
    RiskEvidenceIds: [`e${index + 1}`],
  })),
}

describe('generateRecommendationIntelligence', () => {
  beforeEach(() => {
    resetGroundedIntelligenceStateForTests()
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'phi-test'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validOutput)))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('returns exactly five normalized supplied candidates', async () => {
    const output = await generateRecommendationIntelligence(
      request,
      'recommendation-client',
    )

    expect(output.rankings).toHaveLength(5)
    expect(output.rankings.map((item) => item.symbol)).toEqual(
      symbols.slice(0, 5),
    )
    expect(output.rankings[0].rationaleEvidence[0].evidenceId).toBe(
      'MSFT-evidence',
    )
    expect(output.rankings[0].score).toBe(80)
    expect(output.rankings[0].confidence).toBe('high')
  })

  it('normalizes the live top-level symbol map variant', async () => {
    const symbolMap = Object.fromEntries(
      symbols.slice(0, 5).map((symbol, index) => [
        symbol,
        {
          symbol,
          score: 80 - index * 5,
          opinion: 'Promising but mixed',
          confidence: 'medium',
          evidenceIds: [`${symbol}-evidence`],
          riskEvidenceIds: [`${symbol}-evidence`],
        },
      ]),
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(symbolMap)))

    const output = await generateRecommendationIntelligence(
      request,
      'recommendation-symbol-map',
    )

    expect(output.rankings.map((item) => item.symbol)).toEqual(
      symbols.slice(0, 5),
    )
    expect(output.rankings[0]).toMatchObject({
      score: 80,
      confidence: 'medium',
    })
  })

  it('rejects an out-of-set symbol', async () => {
    const invalid = structuredClone(validOutput)
    invalid.Rankings[0].Symbol = 'AAPL'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))

    await expect(
      generateRecommendationIntelligence(request, 'recommendation-symbol'),
    ).rejects.toThrow('out-of-set symbol')
  })

  it('rejects evidence attached to a different candidate', async () => {
    const invalid = structuredClone(validOutput)
    invalid.Rankings[0].RationaleEvidenceIds = [2]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))

    await expect(
      generateRecommendationIntelligence(request, 'recommendation-evidence'),
    ).rejects.toThrow('misattached evidence')
  })

  it('rejects direct trade instructions', async () => {
    const invalid = structuredClone(validOutput)
    invalid.Rankings[0].Rationale = 'Buy because the evidence is supportive.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))

    await expect(
      generateRecommendationIntelligence(request, 'recommendation-advice'),
    ).rejects.toThrow('prohibited investment advice')
  })

  it('rejects duplicate ranked symbols', async () => {
    const invalid = structuredClone(validOutput)
    invalid.Rankings[1].Symbol = 'MSFT'
    invalid.Rankings[1].RationaleEvidenceIds = [1]
    invalid.Rankings[1].RiskEvidenceIds = ['e1']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)))

    await expect(
      generateRecommendationIntelligence(request, 'recommendation-duplicate'),
    ).rejects.toThrow('duplicate recommendation symbols')
  })
})
