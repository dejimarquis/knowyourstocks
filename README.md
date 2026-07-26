# Know Your Stocks

A beginner-first stock research tool that separates transparent, deterministic thesis Fit from optional, grounded AI opinion intelligence.

## Live app

https://witty-river-08fb2d010.7.azurestaticapps.net/

The live URL reflects the deployed `main` branch. The final opinion-intelligence routing described below is the production target after direct testing; documentation and test counts do not prove that routing is deployed until live verification is complete.

Try IBM with Alpha Vantage's public demo data. To research other supported US common stocks, add a free personal Finnhub key under **Data access**. The key stays in browser `sessionStorage` and is sent directly to Finnhub.

## What the product returns

- **Deterministic Fit:** The separate, authoritative 0–100 thesis Fit calculated from normalized provider and filing evidence.
- **Research opinion:** An opinion label, concise reasoning summary, why it fits, concerns, what to watch next, uncertainty, confidence, and citations mapped to supplied evidence.
- **Discover opinions:** A model ordering of only the supplied candidates, with thesis rationale, concern, next research step, confidence, and citations. Deterministic Fit ordering remains the fallback.
- **Watchlist opinions:** An overall summary and one cited assessment for every supplied stock, including stable stocks, plus optional validated cross-stock patterns.

There is no AI numeric score. Opinion intelligence does not predict returns, alter deterministic Fit, or expose hidden chain-of-thought. The interface displays concise cited summaries only.

## Grounding and model routing

Every operation uses strict JSON Schema whose citation and symbol enums are built from that request. The server then validates grounding, symbol attachment, numeric narrative, and prohibited advice. Invalid optional Watchlist patterns may be dropped without discarding an otherwise valid review. Transient failures receive one bounded retry; validated responses are cached for six hours; all failure paths preserve deterministic output.

Selected routing:

- Research: `gpt-5-mini-intelligence`
- Discover: `gpt-5-mini-intelligence`
- Watchlist: `gpt-oss-120b-intelligence`

GPT-5-mini remains the quality-first choice for Research and Discover. Under the final concurrent evaluation it generated 24/24 Research and 20/20 Discover responses with strict grounding. Observed use was about $0.0021 and $0.0019 per call respectively.

The Watchlist contract was shortened to one concise fit, concern, and watch item per stock. With that bounded strict schema, gpt-oss-120b generated 20/20 grounded reviews, scored 4.725/5, reached an 11.732-second p95, and cost about $0.000487 per call. GPT-5-mini timed out on the multi-stock case, while both Phi-4-mini variants rejected strict JSON Schema and were unreliable in JSON mode. GPT-4.1-mini was not selectable because Azure rejected a new deployment as deprecating in April 2027. After live verification, retain GPT-5-mini and gpt-oss-120b; remove all Phi deployments and the legacy fallback setting.

See `MODEL_EVALUATION.md` for production-derived evaluation results and the GPT-5 versus GPT-4.1 versus open-source rationale.

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

The current suite contains 66 frontend tests, 47 API tests, and 30 Playwright Research, Discover, Watchlist, resilience, storage-recovery, accessibility, and mobile journeys. These counts describe the current suite; they are not proof of deployment or live model routing.

Before deployment, complete the automated suite, hands-on local browser testing, configuration validation, deployment, and live verification of each routed model and deterministic fallback.

See `REQUIREMENTS.md`, `INTELLIGENCE.md`, `SECURITY.md`, `DECISIONS.md`, and `.azure/deployment-plan.md` for the product, grounding, privacy, decision, and rollout contracts.
