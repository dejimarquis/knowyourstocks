import { describe, expect, it } from 'vitest'
import { deriveSecFundamentals } from './sec'

const fact = (
  start: string | undefined,
  end: string,
  val: number,
  frame: string,
) => ({
  ...(start ? { start } : {}),
  end,
  val,
  accn: 'test',
  fy: 2026,
  fp: 'Q1',
  form: '10-Q',
  filed: '2026-06-24',
  frame,
})

describe('deriveSecFundamentals', () => {
  it('derives CBRS-style quarterly fundamentals from SEC facts', () => {
    const result = deriveSecFundamentals('CBRS', '0002021728', {
      entityName: 'Cerebras Systems Inc.',
      facts: {
        'us-gaap': {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                fact('2025-01-01', '2025-03-31', 99_512_000, 'CY2025Q1'),
                fact('2026-01-01', '2026-03-31', 193_406_000, 'CY2026Q1'),
              ],
            },
          },
          NetIncomeLoss: {
            units: {
              USD: [
                fact('2025-01-01', '2025-03-31', -23_867_000, 'CY2025Q1'),
                fact('2026-01-01', '2026-03-31', -14_006_000, 'CY2026Q1'),
              ],
            },
          },
          EarningsPerShareDiluted: {
            units: {
              'USD/shares': [
                fact('2025-01-01', '2025-03-31', -0.46, 'CY2025Q1'),
                fact('2026-01-01', '2026-03-31', -0.22, 'CY2026Q1'),
              ],
            },
          },
          StockholdersEquity: {
            units: {
              USD: [
                fact(undefined, '2026-03-31', -194_682_000, 'CY2026Q1I'),
              ],
            },
          },
        },
      },
    })

    expect(result.revenueGrowth).toBeCloseTo(0.9435, 3)
    expect(result.profitMargin).toBeCloseTo(-0.0724, 3)
    expect(result.epsAnnualized).toBeCloseTo(-0.88, 2)
    expect(result.returnOnEquity).toBeNull()
    expect(result.filingDate).toBe('2026-06-24')
  })
})
