# Know Your Stocks

A beginner-first stock research tool that turns an investment thesis into transparent, evidence-based stock and ETF matches.

## Live app

https://witty-river-08fb2d010.7.azurestaticapps.net/

Try IBM immediately with Alpha Vantage's public demo data. To research other US stocks, open **Data access** and add a free personal Alpha Vantage key.

Tap any visible metric to learn what it means and why it helps explain the business. Open **Why this score** for the full thesis-fit breakdown.

## Local development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm test
npm run build
```

See `REQUIREMENTS.md` for the product and technical specification and `DESIGN_SYSTEM.md` for interface rules.

The friend beta uses real Alpha Vantage end-of-day data with a free, session-only personal API key. A future shared recommendation universe still requires a market-data display license; `REQUIREMENTS.md` records that provider gate.

Visible financial metrics can be expanded for plain-language definitions and an explanation of why each measure matters. See `SECURITY.md` for the exact browser-storage and API-key security model.

## Deployment

The application runs on Azure Static Web Apps Free. Every successful push to `main` is verified and deployed through `.github/workflows/azure-static-web-apps.yml`.
