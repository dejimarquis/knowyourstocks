import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  evaluateSelectedRouting,
  selectedOpinionRouting,
  summarizeSelectedRouting,
  type EvaluationRepetitions,
} from '../modelEvaluation'
import { modelEvalDataset } from './modelEvalFixtures'

const runLive = process.env.FOUNDRY_EVAL_RUN === '1'

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const selectedOperations = () => {
  const requested = new Set(
    (process.env.FOUNDRY_EVAL_OPERATIONS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  return requested.size === 0
    ? new Set(['research', 'recommendations', 'watchlist'])
    : requested
}

describe.skipIf(!runLive)('selected opinion intelligence routing', () => {
  it(
    'evaluates each production route with stable operation samples',
    async () => {
      const endpoint = process.env.FOUNDRY_OPENAI_ENDPOINT
      const key = process.env.FOUNDRY_API_KEY
      const reportPath = process.env.FOUNDRY_EVAL_REPORT_PATH
      const repetitions: EvaluationRepetitions = {
        research: positiveInteger(
          process.env.FOUNDRY_EVAL_RESEARCH_REPETITIONS,
          4,
        ),
        recommendations: positiveInteger(
          process.env.FOUNDRY_EVAL_DISCOVER_REPETITIONS,
          20,
        ),
        watchlist: positiveInteger(
          process.env.FOUNDRY_EVAL_WATCHLIST_REPETITIONS,
          10,
        ),
      }
      const concurrency = positiveInteger(
        process.env.FOUNDRY_EVAL_CONCURRENCY,
        1,
      )
      const delayMs = Number(process.env.FOUNDRY_EVAL_DELAY_MS ?? 2_000)
      const operations = selectedOperations()
      const fixtureIds = new Set(
        modelEvalDataset.fixtures
          .filter((fixture) => operations.has(fixture.operation))
          .map((fixture) => fixture.id),
      )

      expect(endpoint).toBeTruthy()
      expect(key).toBeTruthy()
      expect(reportPath).toBeTruthy()
      expect(fixtureIds.size).toBeGreaterThan(0)

      const results = await evaluateSelectedRouting(endpoint!, key!, {
        fixtureIds,
        repetitions,
        concurrency,
        delayMs:
          Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 2_000,
      })
      const summary = summarizeSelectedRouting(results)
      const report = {
        dataset: {
          version: modelEvalDataset.version,
          fixtures: modelEvalDataset.fixtures.map((fixture) => ({
            id: fixture.id,
            operation: fixture.operation,
            source: fixture.source,
            citationIds: fixture.evidence.map((item) => item.id),
          })),
        },
        configuration: {
          routing: selectedOpinionRouting,
          operations: [...operations],
          repetitions,
          concurrency,
          delayMs,
        },
        summary,
        results,
      }

      writeFileSync(reportPath!, `${JSON.stringify(report, null, 2)}\n`, {
        mode: 0o600,
      })
      console.log(JSON.stringify({ reportPath, summary }))

      const counts = modelEvalDataset.fixtures
        .filter((fixture) => fixtureIds.has(fixture.id))
        .reduce(
        (values, fixture) => ({
          ...values,
          [fixture.operation]: values[fixture.operation] + 1,
        }),
        { research: 0, recommendations: 0, watchlist: 0 },
        )
      expect(results).toHaveLength(
        counts.research * repetitions.research +
          counts.recommendations * repetitions.recommendations +
          counts.watchlist * repetitions.watchlist,
      )
      if (operations.has('research')) {
        expect(summary.operations.research.sampleSize).toBeGreaterThanOrEqual(20)
      }
      if (operations.has('recommendations')) {
        expect(summary.operations.discover.sampleSize).toBeGreaterThanOrEqual(20)
      }
      if (operations.has('watchlist')) {
        expect(summary.operations.watchlist.sampleSize).toBeGreaterThanOrEqual(20)
      }
    },
    60 * 60 * 1000,
  )
})
