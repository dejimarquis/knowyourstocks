import { describe, expect, it } from 'vitest'
import {
  evaluateModelOutput,
  jsonSchemaForFixture,
  summarizeEvaluation,
  type ModelEvalResult,
} from '../modelEvaluation'
import { modelEvalDataset } from './modelEvalFixtures'

const researchFixture = modelEvalDataset.fixtures.find(
  (fixture) => fixture.id === 'research-pltr-balanced-quality',
)
const changingWatchlistFixture = modelEvalDataset.fixtures.find(
  (fixture) => fixture.id === 'watchlist-changing-production',
)

describe('opinion evaluation hard gates', () => {
  it('accepts a fully cited strict Research opinion', () => {
    expect(researchFixture?.operation).toBe('research')
    if (!researchFixture || researchFixture.operation !== 'research') return

    const result = evaluateModelOutput(researchFixture, {
      opinion: 'Mixed',
      headline: 'Strong operations with valuation and risk tension',
      reasoningSummary: {
        text: 'Profitability and revenue growth support the thesis, while valuation and beta weaken the fit.',
        citationIds: [
          'pltr:quality',
          'pltr:revenue-growth',
          'pltr:valuation',
          'pltr:risk',
        ],
      },
      whyItFits: [
        {
          text: 'Profitability supports the quality thesis.',
          citationIds: ['pltr:quality'],
        },
      ],
      concerns: [
        {
          text: 'Valuation and beta weaken a balanced-risk fit.',
          citationIds: ['pltr:valuation', 'pltr:risk'],
        },
      ],
      whatToWatchNext: [
        {
          text: 'Track whether revenue growth remains supportive.',
          citationIds: ['pltr:revenue-growth'],
        },
      ],
      confidence: 'high',
      uncertainty: {
        text: 'The evidence does not establish future performance.',
        citationIds: ['pltr:revenue-growth'],
      },
    })

    expect(result.hardFailures).toEqual([])
    expect(result.hardGates).toEqual({
      strictSchema: true,
      citations: true,
      symbols: true,
      safety: true,
      digitFreeNarrative: true,
      narrativeCitations: true,
      inclusion: true,
    })
    expect(result.averageRubric).toBe(5)
  })

  it('rejects extra keys and numeric narrative text', () => {
    expect(researchFixture?.operation).toBe('research')
    if (!researchFixture || researchFixture.operation !== 'research') return

    const extraKey = evaluateModelOutput(researchFixture, {
      opinion: 'Mixed',
      headline: 'Assessment',
      reasoningSummary: {
        text: 'Supported.',
        citationIds: ['pltr:quality'],
      },
      whyItFits: [
        { text: 'Supported.', citationIds: ['pltr:quality'] },
      ],
      concerns: [
        { text: 'Concern.', citationIds: ['pltr:valuation'] },
      ],
      whatToWatchNext: [
        { text: 'Watch.', citationIds: ['pltr:revenue-growth'] },
      ],
      confidence: 'medium',
      uncertainty: {
        text: 'Uncertain.',
        citationIds: ['pltr:risk'],
      },
      score: 80,
    })
    expect(extraKey.hardGates.strictSchema).toBe(false)

    const numericNarrative = evaluateModelOutput(researchFixture, {
      opinion: 'Mixed',
      headline: 'Assessment',
      reasoningSummary: {
        text: 'Revenue could rise 999%.',
        citationIds: ['pltr:revenue-growth'],
      },
      whyItFits: [
        {
          text: 'Profitability supports the thesis.',
          citationIds: ['pltr:quality'],
        },
      ],
      concerns: [
        {
          text: 'Valuation weakens the fit.',
          citationIds: ['pltr:valuation'],
        },
      ],
      whatToWatchNext: [
        {
          text: 'Track revenue growth.',
          citationIds: ['pltr:revenue-growth'],
        },
      ],
      confidence: 'medium',
      uncertainty: {
        text: 'Future performance is uncertain.',
        citationIds: ['pltr:risk'],
      },
    })
    expect(numericNarrative.hardGates.digitFreeNarrative).toBe(false)
    expect(numericNarrative.hardFailures).toContain(
      'numeric value in narrative text',
    )
  })

  it('enumerates exact fixture citation IDs in strict decoding schemas', () => {
    expect(researchFixture?.operation).toBe('research')
    if (!researchFixture || researchFixture.operation !== 'research') return

    const schema = jsonSchemaForFixture(researchFixture) as {
      $defs: {
        claim: {
          properties: {
            citationIds: { items: { enum: string[] } }
          }
        }
      }
    }
    expect(schema.$defs.claim.properties.citationIds.items.enum).toEqual(
      researchFixture.evidence.map((item) => item.id),
    )
    expect(
      schema.$defs.claim.properties.citationIds.items.enum,
    ).not.toContain('msft:return-on-equity')
  })

  it('drops an invalid optional cross-stock pattern without failing core gates', () => {
    expect(changingWatchlistFixture?.operation).toBe('watchlist')
    if (
      !changingWatchlistFixture ||
      changingWatchlistFixture.operation !== 'watchlist'
    ) {
      return
    }

    const result = evaluateModelOutput(changingWatchlistFixture, {
      overallOpinion: 'Mixed',
      overallSummary: {
        text: 'Growth is offset by profitability and liquidity concerns.',
        citationIds: ['change:crwv-growth', 'change:be-quality'],
      },
      prioritizedEvidenceIds: [
        'change:crwv-liquidity',
        'change:crwv-profit',
        'change:be-quality',
        'change:be-risk',
      ],
      stocks: [
        {
          symbol: 'CRWV',
          opinion: 'Weak fit',
          whatChanged: {
            text: 'Liquidity and profitability remain the main concerns.',
            citationIds: [
              'change:crwv-liquidity',
              'change:crwv-profit',
            ],
          },
          whyItFits: [
            {
              text: 'Revenue growth supports the aggressive thesis.',
              citationIds: ['change:crwv-growth'],
            },
          ],
          concerns: [
            {
              text: 'Liquidity and profitability are weak.',
              citationIds: [
                'change:crwv-liquidity',
                'change:crwv-profit',
              ],
            },
          ],
          whatToWatchNext: [
            {
              text: 'Watch for improving liquidity and profitability.',
              citationIds: [
                'change:crwv-liquidity',
                'change:crwv-profit',
              ],
            },
          ],
          confidence: 'high',
        },
        {
          symbol: 'BE',
          opinion: 'Weak fit',
          whatChanged: {
            text: 'Profitability and volatility remain concerns.',
            citationIds: ['change:be-quality', 'change:be-risk'],
          },
          whyItFits: [
            {
              text: 'Revenue growth supports the aggressive thesis.',
              citationIds: ['change:be-growth'],
            },
          ],
          concerns: [
            {
              text: 'Profitability and volatility weaken the fit.',
              citationIds: ['change:be-quality', 'change:be-risk'],
            },
          ],
          whatToWatchNext: [
            {
              text: 'Watch for stronger profitability.',
              citationIds: ['change:be-quality'],
            },
          ],
          confidence: 'high',
        },
        {
          symbol: 'MSFT',
          opinion: 'Fits thesis',
          whatChanged: {
            text: 'No material change',
            citationIds: ['change:msft-stable'],
          },
          whyItFits: [
            {
              text: 'The evidence remains supportive.',
              citationIds: ['change:msft-stable'],
            },
          ],
          concerns: [
            {
              text: 'No new concern is verified.',
              citationIds: ['change:msft-stable'],
            },
          ],
          whatToWatchNext: [
            {
              text: 'Watch for a material business change.',
              citationIds: ['change:msft-stable'],
            },
          ],
          confidence: 'high',
        },
      ],
      crossStockPatterns: [
        {
          title: 'Single-stock pattern',
          summary: 'This pattern does not span distinct symbols.',
          citationIds: ['change:crwv-growth', 'change:crwv-profit'],
          confidence: 'medium',
        },
      ],
    })

    expect(result.hardFailures).toEqual([])
    expect(Object.values(result.hardGates).every(Boolean)).toBe(true)
    expect(result.droppedOptionalPatterns).toBe(1)
    expect(result.qualityIssues).toHaveLength(1)
    expect(result.rubric.usefulness).toBe(4)
  })

  it('reports small-sample p95 as insufficient rather than passing', () => {
    const passingResult: ModelEvalResult = {
      sampleId: 'gpt-5-mini-intelligence:one:1',
      fixtureId: 'one',
      repetition: 1,
      operation: 'research',
      deployment: 'gpt-5-mini-intelligence',
      outcome: 'success',
      latencyMs: 1_000,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        outputTokens: 15,
        reasoningTokens: 5,
        totalTokens: 30,
      },
      rubric: {
        groundedness: 5,
        relevance: 5,
        completeness: 5,
        usefulness: 5,
      },
      averageRubric: 5,
      hardGates: {
        strictSchema: true,
        citations: true,
        symbols: true,
        safety: true,
        digitFreeNarrative: true,
        narrativeCitations: true,
        inclusion: true,
      },
      hardFailures: [],
      qualityIssues: [],
      droppedOptionalPatterns: 0,
    }

    const summary = summarizeEvaluation([passingResult])
    expect(
      summary.models['gpt-5-mini-intelligence']?.operations.research.latency
        .gate,
    ).toBe(
      'insufficient-sample',
    )
    expect(
      summary.models['gpt-5-mini-intelligence']?.recommendation,
    ).toBe('collect-more-latency-samples')
  })
})
