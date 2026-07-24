# Know Your Stocks

A beginner-first stock research tool that turns an investment thesis into transparent, evidence-based stock and ETF matches.

## Live app

https://witty-river-08fb2d010.7.azurestaticapps.net/

Try IBM immediately with Alpha Vantage's public demo data. To research other US stocks, open **Data access** and add a free personal Finnhub key.

Tap any visible metric to learn what it means and why it helps explain the business. Open **Why this score** for the full thesis-fit breakdown.

Add researched stocks to the local watchlist, then select **Review** to compare snapshots and generate a prioritized brief. The brief works from deterministic rules first; Azure Foundry Phi may add separately labeled, evidence-backed experimental patterns.

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

`npm run dev` starts Vite and the local Azure Functions API together. The browser opens on Vite's URL, while `/api/*` is proxied to Functions on port 7072. Running `npm run dev:web` alone does not provide SEC fundamentals.

The command also starts Azurite for the Functions runtime and places Homebrew's Node 22 first in `PATH`, avoiding unsupported-Node and `AzureWebJobsStorage` health warnings.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

See `REQUIREMENTS.md` for the product and technical specification and `DESIGN_SYSTEM.md` for interface rules.

The friend beta uses Finnhub for personal-key research and Alpha Vantage only for the public IBM demo. When Finnhub lacks fundamentals, a same-origin Azure API derives the missing figures from official SEC EDGAR filings. Results are cached locally for six hours to reduce API use. A future shared recommendation universe still requires a market-data display license; `REQUIREMENTS.md` records that provider gate.

Visible financial metrics can be expanded for plain-language definitions and an explanation of why each measure matters. See `SECURITY.md` for the exact browser-storage and API-key security model.

## Deployment

The application runs on Azure Static Web Apps Free. Every successful push to `main` is verified and deployed through `.github/workflows/azure-static-web-apps.yml`.
