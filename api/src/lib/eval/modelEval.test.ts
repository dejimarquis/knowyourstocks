import { describe, expect, it } from 'vitest'
import {
  evaluateDeployment,
  summarizeEvaluation,
} from '../modelEvaluation'

const runLive = process.env.FOUNDRY_EVAL_RUN === '1'

describe.skipIf(!runLive)('Foundry mini model evaluation', () => {
  it(
    'compares instruct and reasoning on the frozen intelligence dataset',
    async () => {
      const endpoint = process.env.FOUNDRY_OPENAI_ENDPOINT
      const key = process.env.FOUNDRY_API_KEY
      const deployments = (
        process.env.FOUNDRY_EVAL_DEPLOYMENTS ??
        'phi-4-mini-watchlist,phi-4-mini-reasoning-watchlist'
      )
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      const fixtureIds = new Set(
        (process.env.FOUNDRY_EVAL_FIXTURE_IDS ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      )
      const delayMs = Number(process.env.FOUNDRY_EVAL_DELAY_MS ?? 20_000)

      expect(endpoint).toBeTruthy()
      expect(key).toBeTruthy()
      expect(deployments.length).toBeGreaterThan(0)

      const results = []

      for (const deployment of deployments) {
        results.push(
          ...(await evaluateDeployment(
            endpoint!,
            key!,
            deployment,
            fixtureIds.size > 0 ? fixtureIds : undefined,
            Number.isFinite(delayMs) && delayMs >= 0
              ? delayMs
              : 20_000,
          )),
        )
      }
      const summary = summarizeEvaluation(results)

      console.log(
        JSON.stringify(
          {
            dataset: 'foundry-mini-eval.v1.2026-07-23',
            summary,
            results,
          },
          null,
          2,
        ),
      )

      expect(results).toHaveLength(
        deployments.length *
          (fixtureIds.size > 0 ? fixtureIds.size : 12),
      )
    },
    12 * 60 * 1000,
  )
})
