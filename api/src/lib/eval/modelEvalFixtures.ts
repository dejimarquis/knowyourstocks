export type EvalEvidence = {
  id: string
  symbol: string
  fact: string
}

type BaseFixture = {
  id: string
  operation: 'research' | 'recommendations' | 'watchlist'
  thesis: string
  source: string
  evidence: EvalEvidence[]
}

export type ResearchEvalFixture = BaseFixture & {
  operation: 'research'
  symbol: string
  expected: {
    opinions: Array<'Fits thesis' | 'Mixed' | 'Weak fit' | 'Insufficient evidence'>
    requiredEvidenceIds: string[]
  }
}

export type RecommendationEvalFixture = BaseFixture & {
  operation: 'recommendations'
  candidates: string[]
  expected: {
    topSymbols: string[]
    bottomSymbols: string[]
  }
}

export type WatchlistEvalFixture = BaseFixture & {
  operation: 'watchlist'
  symbols: string[]
  expected: {
    priorityEvidenceIds: string[]
    opinions: Record<
      string,
      Array<'Fits thesis' | 'Mixed' | 'Weak fit' | 'Insufficient evidence'>
    >
    stableSymbols: string[]
  }
}

export type ModelEvalFixture =
  | ResearchEvalFixture
  | RecommendationEvalFixture
  | WatchlistEvalFixture

const longTermAggressiveNote =
  "Concentrate where you have conviction, diversify where you don't. Index + blue chip core; small, high-conviction bets on the periphery (quantum, rare earth, AI infra). Position sizing is the risk control, not avoidance.\n\nHigh risk tolerance, but only when the bet makes sense. Asymmetric upside, never gambling. Everything ladders to the 10-year thesis: inference to agentic to AI-for-science to robotics."

const pltrEvidence: EvalEvidence[] = [
  {
    id: 'pltr:pe',
    symbol: 'PLTR',
    fact: 'Trailing price-to-earnings ratio: 129.16. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
  },
  {
    id: 'pltr:profit-margin',
    symbol: 'PLTR',
    fact: 'Profit margin: 43.7%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
  },
  {
    id: 'pltr:revenue-growth',
    symbol: 'PLTR',
    fact: 'Revenue growth: 67.7%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
  },
  {
    id: 'pltr:earnings-growth',
    symbol: 'PLTR',
    fact: 'Earnings growth: 287.8%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
  },
  {
    id: 'pltr:operating-margin',
    symbol: 'PLTR',
    fact: 'Operating margin: 38.1%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
  },
  {
    id: 'pltr:debt-equity',
    symbol: 'PLTR',
    fact: 'Debt-to-equity ratio: 0. Source: Finnhub; as-of date unavailable; period: quarterly.',
  },
  {
    id: 'pltr:current-ratio',
    symbol: 'PLTR',
    fact: 'Current ratio: 6.91. Source: Finnhub; as-of date unavailable; period: quarterly.',
  },
  {
    id: 'pltr:theme',
    symbol: 'PLTR',
    fact: 'Technology aligns with the selected AI infrastructure and technology themes.',
  },
  {
    id: 'pltr:quality',
    symbol: 'PLTR',
    fact: 'Profitability supports the thesis: profit margin is 43.7% and return on equity is 32.2%.',
  },
  {
    id: 'pltr:risk',
    symbol: 'PLTR',
    fact: 'Risk fit is mixed: beta is 1.57 compared with the market baseline of 1.00.',
  },
  {
    id: 'pltr:valuation',
    symbol: 'PLTR',
    fact: 'Valuation weakens thesis fit: trailing price-to-earnings ratio is 129.2.',
  },
]

const aggressiveThesis = `Growth; seven-plus-year horizon; aggressive risk; AI and technology. Optional thesis note: ${longTermAggressiveNote}`

export const modelEvalDataset: {
  version: string
  fixtures: ModelEvalFixture[]
} = {
  version: 'opinion-intelligence-production-traces.v3.2026-07-26',
  fixtures: [
    {
      id: 'research-pltr-balanced-quality',
      operation: 'research',
      symbol: 'PLTR',
      thesis:
        'Quality; seven-plus-year horizon; balanced risk; AI and technology.',
      source:
        'Production Research request captured 2026-07-26; numeric evidence is preserved from the request packet.',
      evidence: pltrEvidence,
      expected: {
        opinions: ['Fits thesis', 'Mixed'],
        requiredEvidenceIds: [
          'pltr:quality',
          'pltr:revenue-growth',
          'pltr:risk',
          'pltr:valuation',
        ],
      },
    },
    {
      id: 'research-pltr-aggressive-growth-note',
      operation: 'research',
      symbol: 'PLTR',
      thesis: aggressiveThesis,
      source:
        'Production Research request captured 2026-07-26 with the supplied long-term thesis note.',
      evidence: pltrEvidence.filter((item) => item.id !== 'pltr:risk'),
      expected: {
        opinions: ['Fits thesis', 'Mixed'],
        requiredEvidenceIds: [
          'pltr:revenue-growth',
          'pltr:earnings-growth',
          'pltr:profit-margin',
          'pltr:pe',
        ],
      },
    },
    {
      id: 'research-crwv-aggressive-growth-note',
      operation: 'research',
      symbol: 'CRWV',
      thesis: aggressiveThesis,
      source:
        'Production Research request captured 2026-07-26; the production call returned HTTP 503 after 13.0 seconds.',
      evidence: [
        {
          id: 'crwv:profit-margin',
          symbol: 'CRWV',
          fact: 'Profit margin: -25.6%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'crwv:revenue-growth',
          symbol: 'CRWV',
          fact: 'Revenue growth: 111.6%. Source: SEC EDGAR; as of 2026-05-08; period: latest-comparable-filing.',
        },
        {
          id: 'crwv:operating-margin',
          symbol: 'CRWV',
          fact: 'Operating margin: -2.6%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'crwv:debt-equity',
          symbol: 'CRWV',
          fact: 'Debt-to-equity ratio: 0.05. Source: Finnhub; as-of date unavailable; period: quarterly.',
        },
        {
          id: 'crwv:current-ratio',
          symbol: 'CRWV',
          fact: 'Current ratio: 0.31. Source: Finnhub; as-of date unavailable; period: quarterly.',
        },
        {
          id: 'crwv:theme',
          symbol: 'CRWV',
          fact: 'Technology aligns with the selected AI infrastructure and technology themes.',
        },
        {
          id: 'crwv:growth',
          symbol: 'CRWV',
          fact: 'Revenue growth is 111.6%, while earnings growth is unavailable.',
        },
        {
          id: 'crwv:quality',
          symbol: 'CRWV',
          fact: 'Profitability weakens thesis fit: profit margin is -25.6% and return on equity is -40.3%.',
        },
      ],
      expected: {
        opinions: ['Mixed', 'Weak fit'],
        requiredEvidenceIds: [
          'crwv:revenue-growth',
          'crwv:growth',
          'crwv:profit-margin',
          'crwv:current-ratio',
        ],
      },
    },
    {
      id: 'research-msft-aggressive-growth-note',
      operation: 'research',
      symbol: 'MSFT',
      thesis: aggressiveThesis,
      source:
        'Production Research request captured 2026-07-26; the production call returned HTTP 503 after 14.6 seconds.',
      evidence: [
        {
          id: 'msft:pe',
          symbol: 'MSFT',
          fact: 'Trailing price-to-earnings ratio: 22.64. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'msft:profit-margin',
          symbol: 'MSFT',
          fact: 'Profit margin: 39.3%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'msft:revenue-growth',
          symbol: 'MSFT',
          fact: 'Revenue growth: 17.9%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'msft:earnings-growth',
          symbol: 'MSFT',
          fact: 'Earnings growth: 29.8%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'msft:operating-margin',
          symbol: 'MSFT',
          fact: 'Operating margin: 46.8%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'msft:debt-equity',
          symbol: 'MSFT',
          fact: 'Debt-to-equity ratio: 0. Source: Finnhub; as-of date unavailable; period: quarterly.',
        },
        {
          id: 'msft:current-ratio',
          symbol: 'MSFT',
          fact: 'Current ratio: 1.28. Source: Finnhub; as-of date unavailable; period: quarterly.',
        },
        {
          id: 'msft:theme',
          symbol: 'MSFT',
          fact: 'Technology aligns with the selected AI infrastructure and technology themes.',
        },
        {
          id: 'msft:quality',
          symbol: 'MSFT',
          fact: 'Profitability supports the thesis: profit margin is 39.3% and return on equity is 33.1%.',
        },
      ],
      expected: {
        opinions: ['Fits thesis'],
        requiredEvidenceIds: [
          'msft:theme',
          'msft:quality',
          'msft:revenue-growth',
          'msft:earnings-growth',
        ],
      },
    },
    {
      id: 'research-bloom-energy-balanced-quality',
      operation: 'research',
      symbol: 'BE',
      thesis:
        'Quality; seven-plus-year horizon; balanced risk; AI and technology.',
      source:
        'Production Bloom Energy Research packet captured 2026-07-24 after repeated model timeouts.',
      evidence: [
        {
          id: 'be:pe',
          symbol: 'BE',
          fact: 'Trailing price-to-earnings ratio: over 500. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'be:profit-margin',
          symbol: 'BE',
          fact: 'Profit margin: 0.3%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'be:revenue-growth',
          symbol: 'BE',
          fact: 'Revenue growth: 56.5%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'be:operating-margin',
          symbol: 'BE',
          fact: 'Operating margin: 2.7%. Source: Finnhub; as-of date unavailable; period: trailing-twelve-months.',
        },
        {
          id: 'be:debt-equity',
          symbol: 'BE',
          fact: 'Debt-to-equity ratio: 0.03. Source: Finnhub; as-of date unavailable; period: quarterly.',
        },
        {
          id: 'be:current-ratio',
          symbol: 'BE',
          fact: 'Current ratio: 5.03. Source: Finnhub; as-of date unavailable; period: quarterly.',
        },
        {
          id: 'be:resilience',
          symbol: 'BE',
          fact: 'Market capitalization is $62 billion and profit margin is 0.3%.',
        },
        {
          id: 'be:growth',
          symbol: 'BE',
          fact: 'Revenue growth is 56.5%, while earnings growth is unavailable.',
        },
        {
          id: 'be:theme',
          symbol: 'BE',
          fact: 'Electrical Equipment is outside the selected AI and technology themes.',
        },
        {
          id: 'be:quality',
          symbol: 'BE',
          fact: 'Profitability weakens thesis fit: profit margin is 0.3% and return on equity is 0.8%.',
        },
        {
          id: 'be:risk',
          symbol: 'BE',
          fact: 'Risk fit weakens the thesis: beta is 3.93 compared with the market baseline of 1.00.',
        },
      ],
      expected: {
        opinions: ['Mixed', 'Weak fit'],
        requiredEvidenceIds: [
          'be:growth',
          'be:theme',
          'be:quality',
          'be:risk',
        ],
      },
    },
    {
      id: 'research-ibm-negative-earnings',
      operation: 'research',
      symbol: 'IBM',
      thesis:
        'Quality growth; seven-plus-year horizon; balanced risk; AI and technology.',
      source:
        'Production SEC fallback response captured 2026-07-24 from IBM filing data dated 2026-07-23.',
      evidence: [
        {
          id: 'ibm:revenue',
          symbol: 'IBM',
          fact: 'Quarterly revenue: $17.162 billion. Source: SEC EDGAR; filing date: 2026-07-23.',
        },
        {
          id: 'ibm:revenue-growth',
          symbol: 'IBM',
          fact: 'Comparable revenue growth: 1.09%. Source: SEC EDGAR; filing date: 2026-07-23.',
        },
        {
          id: 'ibm:profit',
          symbol: 'IBM',
          fact: 'Net income: $2.165 billion and profit margin: 12.62%. Source: SEC EDGAR; filing date: 2026-07-23.',
        },
        {
          id: 'ibm:earnings-growth',
          symbol: 'IBM',
          fact: 'Comparable earnings growth: -1.32%. Source: SEC EDGAR; filing date: 2026-07-23.',
        },
        {
          id: 'ibm:roe',
          symbol: 'IBM',
          fact: 'Return on equity: 25.14%. Source: SEC EDGAR; filing date: 2026-07-23.',
        },
        {
          id: 'ibm:coverage',
          symbol: 'IBM',
          fact: 'The captured SEC fallback did not provide current valuation, cash-flow, liquidity, or beta evidence.',
        },
      ],
      expected: {
        opinions: ['Mixed', 'Insufficient evidence'],
        requiredEvidenceIds: [
          'ibm:earnings-growth',
          'ibm:revenue-growth',
          'ibm:profit',
          'ibm:coverage',
        ],
      },
    },
    {
      id: 'discover-ai-infrastructure-ranking',
      operation: 'recommendations',
      thesis: aggressiveThesis,
      source:
        'Production Discover run captured 2026-07-24 with candidate set NVDA, CRM, AVGO, ORCL, and ADBE.',
      candidates: ['NVDA', 'CRM', 'AVGO', 'ORCL', 'ADBE'],
      evidence: [
        {
          id: 'nvda:fit',
          symbol: 'NVDA',
          fact: 'NVIDIA has direct AI accelerator and AI infrastructure exposure with strong growth and margins.',
        },
        {
          id: 'nvda:risk',
          symbol: 'NVDA',
          fact: 'NVIDIA carries valuation, volatility, and semiconductor concentration risk.',
        },
        {
          id: 'crm:fit',
          symbol: 'CRM',
          fact: 'Salesforce has enterprise software AI exposure and positive cash flow.',
        },
        {
          id: 'crm:risk',
          symbol: 'CRM',
          fact: 'Salesforce is less directly exposed to AI infrastructure than the infrastructure candidates.',
        },
        {
          id: 'avgo:fit',
          symbol: 'AVGO',
          fact: 'Broadcom has AI networking and semiconductor infrastructure exposure with positive cash flow.',
        },
        {
          id: 'avgo:risk',
          symbol: 'AVGO',
          fact: 'Broadcom carries semiconductor concentration and integration risk.',
        },
        {
          id: 'orcl:fit',
          symbol: 'ORCL',
          fact: 'Oracle has cloud infrastructure exposure that aligns with long-term AI compute demand.',
        },
        {
          id: 'orcl:risk',
          symbol: 'ORCL',
          fact: 'Oracle has execution and leverage uncertainty while expanding cloud infrastructure.',
        },
        {
          id: 'adbe:fit',
          symbol: 'ADBE',
          fact: 'Adobe has profitable AI-enabled creative software and durable cash generation.',
        },
        {
          id: 'adbe:risk',
          symbol: 'ADBE',
          fact: 'Adobe is application software rather than direct AI infrastructure and faces competitive uncertainty.',
        },
      ],
      expected: {
        topSymbols: ['NVDA', 'AVGO', 'ORCL'],
        bottomSymbols: ['CRM', 'ADBE'],
      },
    },
    {
      id: 'watchlist-stable-production',
      operation: 'watchlist',
      thesis:
        'Quality growth; seven-plus-year horizon; balanced risk; AI and technology.',
      source:
        'Stable Watchlist case derived from the captured PLTR and MSFT production Research packets.',
      symbols: ['PLTR', 'MSFT'],
      evidence: [
        {
          id: 'stable:pltr',
          symbol: 'PLTR',
          fact: 'No verified material change is present versus the prior PLTR review; growth, profitability, liquidity, and valuation evidence are unchanged.',
        },
        {
          id: 'stable:msft',
          symbol: 'MSFT',
          fact: 'No verified material change is present versus the prior MSFT review; growth, profitability, liquidity, and valuation evidence are unchanged.',
        },
      ],
      expected: {
        priorityEvidenceIds: [],
        opinions: {
          PLTR: ['Fits thesis', 'Mixed', 'Insufficient evidence'],
          MSFT: ['Fits thesis', 'Mixed', 'Insufficient evidence'],
        },
        stableSymbols: ['PLTR', 'MSFT'],
      },
    },
    {
      id: 'watchlist-changing-production',
      operation: 'watchlist',
      thesis: aggressiveThesis,
      source:
        'Changing Watchlist case combines captured CRWV, Bloom Energy, and MSFT production evidence.',
      symbols: ['CRWV', 'BE', 'MSFT'],
      evidence: [
        {
          id: 'change:crwv-liquidity',
          symbol: 'CRWV',
          fact: 'CRWV current ratio is 0.31, indicating weak captured liquidity.',
        },
        {
          id: 'change:crwv-profit',
          symbol: 'CRWV',
          fact: 'CRWV profit margin is -25.6% and operating margin is -2.6%.',
        },
        {
          id: 'change:crwv-growth',
          symbol: 'CRWV',
          fact: 'CRWV revenue growth is 111.6%, while earnings growth is unavailable.',
        },
        {
          id: 'change:be-quality',
          symbol: 'BE',
          fact: 'Bloom Energy profit margin is 0.3% and return on equity is 0.8%.',
        },
        {
          id: 'change:be-risk',
          symbol: 'BE',
          fact: 'Bloom Energy beta is 3.93 compared with the market baseline of 1.00.',
        },
        {
          id: 'change:be-growth',
          symbol: 'BE',
          fact: 'Bloom Energy revenue growth is 56.5%, while earnings growth is unavailable.',
        },
        {
          id: 'change:msft-stable',
          symbol: 'MSFT',
          fact: 'No verified material change is present for MSFT; profitability and growth evidence remain supportive.',
        },
      ],
      expected: {
        priorityEvidenceIds: [
          'change:crwv-liquidity',
          'change:crwv-profit',
          'change:be-quality',
          'change:be-risk',
        ],
        opinions: {
          CRWV: ['Mixed', 'Weak fit'],
          BE: ['Mixed', 'Weak fit'],
          MSFT: ['Fits thesis'],
        },
        stableSymbols: ['MSFT'],
      },
    },
  ],
}
