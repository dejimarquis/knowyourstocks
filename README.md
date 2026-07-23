# Know Your Stocks

A beginner-first stock research tool that turns an investment thesis into transparent, evidence-based stock and ETF matches.

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

The current foundation includes the local thesis flow and intentionally displays no market values until a real provider is approved and connected.

See `REQUIREMENTS.md` for the product and technical specification and `DESIGN_SYSTEM.md` for interface rules.

The current implementation blocker is market-data display licensing. `REQUIREMENTS.md` records the provider gate and the written confirmation needed before production integration.

For local development and personal testing, the app supports real Alpha Vantage end-of-day data with a free browser-local API key. The development server can load Alpha Vantage's real IBM demo data without a key.

Visible financial metrics can be expanded for plain-language definitions and an explanation of why each measure matters. See `SECURITY.md` for the exact browser-storage and API-key security model.
