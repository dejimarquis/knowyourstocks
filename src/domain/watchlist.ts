import { z } from 'zod'
import type { SecuritySnapshot } from '../data/alphaVantage'
import type { FitScore } from '../scoring/scoreSecurity'

export const watchlistLimit = 25

const nullableNumber = z.number().nullable()

const securitySnapshotSchema: z.ZodType<SecuritySnapshot> = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string().nullable(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  price: z.number(),
  previousClose: nullableNumber,
  changePercent: nullableNumber,
  latestTradingDay: z.string(),
  marketCap: nullableNumber,
  peRatio: nullableNumber,
  priceToBook: nullableNumber,
  dividendYield: nullableNumber,
  eps: nullableNumber,
  profitMargin: nullableNumber,
  returnOnEquity: nullableNumber,
  revenueGrowth: nullableNumber,
  earningsGrowth: nullableNumber,
  beta: nullableNumber,
  week52High: nullableNumber,
  week52Low: nullableNumber,
  source: z.string(),
})

const fitFactorSchema = z.object({
  key: z.string(),
  label: z.string(),
  earned: z.number(),
  maximum: z.number(),
  evidence: z.string(),
  available: z.boolean(),
})

const fitScoreSchema: z.ZodType<FitScore> = z.object({
  total: z.number().nullable(),
  label: z.enum([
    'Strong match',
    'Moderate match',
    'Limited match',
    'Insufficient data',
  ]),
  factors: z.array(fitFactorSchema),
  missing: z.array(z.string()),
})

export const watchlistItemSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  addedAt: z.string(),
  lastReviewedAt: z.string(),
  currentSnapshot: securitySnapshotSchema,
  previousSnapshot: securitySnapshotSchema.nullable(),
  currentFit: fitScoreSchema,
  previousFit: fitScoreSchema.nullable(),
  earningsDate: z.string().nullable().default(null),
  sentiment: z
    .object({
      score: z.number(),
      articleCount: z.number().nullable(),
      source: z.string(),
      asOf: z.string(),
    })
    .nullable()
    .default(null),
  previousSentiment: z
    .object({
      score: z.number(),
      articleCount: z.number().nullable(),
      source: z.string(),
      asOf: z.string(),
    })
    .nullable()
    .default(null),
  reviewError: z.string().nullable().default(null),
})

export const watchlistInsightSchema = z.object({
  id: z.string(),
  symbol: z.string().nullable(),
  type: z.enum([
    'fit_change',
    'thesis_drift',
    'price_move',
    'fundamental_change',
    'earnings',
    'stale_data',
    'concentration',
    'sentiment',
    'experimental_pattern',
  ]),
  severity: z.enum(['attention', 'watch', 'informational', 'stable']),
  title: z.string(),
  summary: z.string(),
  evidence: z.array(
    z.object({
      label: z.string(),
      current: z.string(),
      previous: z.string().nullable(),
    }),
  ),
  generatedAt: z.string(),
})

export const watchlistBriefSchema = z.object({
  generatedAt: z.string(),
  reviewType: z.enum(['manual', 'weekly']),
  deterministicInsights: z.array(watchlistInsightSchema),
  experimentalInsights: z.array(watchlistInsightSchema),
  stableSymbols: z.array(z.string()),
  errors: z.array(z.string()),
  aiSummary: z.string().nullable().default(null),
  aiUncertainties: z.array(z.string()).default([]),
  modelStatus: z
    .enum(['not_requested', 'generated', 'fallback'])
    .default('not_requested'),
})

export const watchlistSchema = z.object({
  version: z.literal(1),
  items: z.array(watchlistItemSchema).max(watchlistLimit),
  lastReviewAt: z.string().nullable(),
  lastWeeklyReviewKey: z.string().nullable(),
  latestBrief: watchlistBriefSchema.nullable().default(null),
  modelPreferences: z
    .object({
      includeThesisNote: z.boolean(),
    })
    .default({ includeThesisNote: false }),
  insightFeedback: z
    .record(z.string(), z.enum(['useful', 'not_useful']))
    .default({}),
})

export type WatchlistItem = z.infer<typeof watchlistItemSchema>
export type Watchlist = z.infer<typeof watchlistSchema>
export type WatchlistInsight = z.infer<typeof watchlistInsightSchema>
export type WatchlistBrief = z.infer<typeof watchlistBriefSchema>

export const emptyWatchlist: Watchlist = {
  version: 1,
  items: [],
  lastReviewAt: null,
  lastWeeklyReviewKey: null,
  latestBrief: null,
  modelPreferences: {
    includeThesisNote: false,
  },
  insightFeedback: {},
}

export const createWatchlistItem = (
  snapshot: SecuritySnapshot,
  fit: FitScore,
  now = new Date(),
): WatchlistItem => ({
  symbol: snapshot.symbol,
  name: snapshot.name,
  addedAt: now.toISOString(),
  lastReviewedAt: now.toISOString(),
  currentSnapshot: snapshot,
  previousSnapshot: null,
  currentFit: fit,
  previousFit: null,
  earningsDate: null,
  sentiment: null,
  previousSentiment: null,
  reviewError: null,
})
