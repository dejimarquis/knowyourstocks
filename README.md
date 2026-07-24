# Know Your Stocks

A beginner-first stock research tool that separates transparent, deterministic thesis Fit from optional, grounded AI evidence assessment.

## Live app

https://witty-river-08fb2d010.7.azurestaticapps.net/

The live URL reflects the currently deployed `main` branch. Local intelligence-v2 changes must complete hands-on browser testing and validation before they are pushed or deployed.

Try IBM with Alpha Vantage's public demo data. To research other supported US common stocks, add a free personal Finnhub key under **Data access**. The key stays in browser `sessionStorage` and is sent directly to Finnhub.

## What v2 does

- **Research:** Calculates deterministic Fit locally from normalized market data. An explicit **Search** or **Refresh** can also request a separate AI thesis-evidence score, opinion, strengths, risks, and confidence. Loading a cached research page does not call AI, and neither score predicts returns.
- **Discover:** On manual refresh, combines a curated liquid-US common-stock universe with Finnhub peer context. It excludes the current and watched symbols, fetches at most eight candidates, shows at most five, and falls back to deterministic ranking when AI is unavailable or invalid. ETFs are not included initially.
- **Watchlist:** Reviews business evidence first—growth, margins, cash flow, leverage, liquidity, valuation, filings, earnings, thesis drift, concentration, freshness, and supported context. There is no standalone daily-price-move alert. When Phi is enabled, every requested review asks for one assessment per watched stock, including stable stocks.

Finnhub now maps `epsGrowthTTMYoy` correctly and normalizes operating margin, free cash flow, debt-to-equity, and current ratio. Metric-level provenance identifies Finnhub, Alpha Vantage, or SEC EDGAR evidence and its reported period or filing date when available.

## Local development

Use Node.js 22 and Azure Functions Core Tools v4:

```bash
nvm use
brew tap azure/functions
brew install azure-functions-core-tools@4
npm install
npm --prefix api install
npm run dev
```

`npm run dev` starts Vite, Azurite, and the local Azure Functions API. `/api/*` is proxied to Functions on port 7072.

## Quality checks

```bash
npm run lint
npm test
npm run test:api
npm run test:e2e
npm run build
npm run build:api
```

Before any push or deployment of intelligence v2, also complete a hands-on local browser walkthrough of Research, Discover, stable-stock Watchlist review, model failure fallback, and responsive behavior.

See `REQUIREMENTS.md`, `INTELLIGENCE.md`, `SECURITY.md`, and `DECISIONS.md` for the current product, grounding, privacy, and architecture contracts.

## Deployment and cost

The application uses Azure Static Web Apps managed Functions and one low-capacity Azure Foundry serverless deployment, `phi-4-mini-watchlist`. The $25 Azure budget is an alert, not a hard inference stop. Runtime protection therefore relies on bounded tokens, six-hour caches, process-local daily limits, short timeouts, a bounded retry, and deterministic fallback.

Azure Table quota code and IaC have been removed. Existing live cleanup candidates are documented in `DECISIONS.md` and `.azure/deployment-plan.md`; deletion requires dependency verification and explicit destructive confirmation.
