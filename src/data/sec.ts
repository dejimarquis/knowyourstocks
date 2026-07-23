import { z } from 'zod'
import type { SecuritySnapshot } from './alphaVantage'

const secFundamentalsSchema = z.object({
  symbol: z.string(),
  cik: z.string(),
  companyName: z.string(),
  filingDate: z.string().nullable(),
  revenue: z.number().nullable(),
  revenueGrowth: z.number().nullable(),
  netIncome: z.number().nullable(),
  profitMargin: z.number().nullable(),
  epsAnnualized: z.number().nullable(),
  earningsGrowth: z.number().nullable(),
  stockholdersEquity: z.number().nullable(),
  returnOnEquity: z.number().nullable(),
  source: z.literal('SEC EDGAR'),
})

type SecFundamentals = z.infer<typeof secFundamentalsSchema>

const needsSecFallback = (security: SecuritySnapshot) =>
  security.peRatio == null ||
  security.profitMargin == null ||
  security.revenueGrowth == null ||
  security.eps == null ||
  security.returnOnEquity == null

export const fetchSecFallback = async (
  symbol: string,
): Promise<SecFundamentals> => {
  const response = await fetch(`/api/sec-fundamentals/${encodeURIComponent(symbol)}`)

  if (!response.ok) {
    const value = (await response.json().catch(() => null)) as
      | { error?: string }
      | null
    throw new Error(
      value?.error ?? `SEC fundamentals returned HTTP ${response.status}.`,
    )
  }

  return secFundamentalsSchema.parse(await response.json())
}

export const enrichWithSecFallback = async (
  security: SecuritySnapshot,
): Promise<SecuritySnapshot> => {
  if (!needsSecFallback(security)) {
    return security
  }

  try {
    const sec = await fetchSecFallback(security.symbol)
    const eps = security.eps ?? sec.epsAnnualized
    const peRatio =
      security.peRatio ?? (eps != null && eps > 0 ? security.price / eps : null)
    const usedSec = [
      security.peRatio == null && peRatio != null,
      security.profitMargin == null && sec.profitMargin != null,
      security.revenueGrowth == null && sec.revenueGrowth != null,
      security.eps == null && eps != null,
      security.returnOnEquity == null && sec.returnOnEquity != null,
    ].some(Boolean)

    return {
      ...security,
      peRatio,
      eps,
      profitMargin: security.profitMargin ?? sec.profitMargin,
      returnOnEquity: security.returnOnEquity ?? sec.returnOnEquity,
      revenueGrowth: security.revenueGrowth ?? sec.revenueGrowth,
      earningsGrowth: security.earningsGrowth ?? sec.earningsGrowth,
      source: usedSec ? `${security.source} + SEC EDGAR` : security.source,
    }
  } catch {
    return security
  }
}
