# Security and privacy

## Finnhub API key

Know Your Stocks does not receive or store a user's Finnhub key.

- The key is stored in browser `sessionStorage`.
- It is sent directly from the browser to Finnhub.
- It is not committed, bundled, sent to Azure, or intentionally logged.
- Session restore behavior can preserve it after a crash or restart.

`sessionStorage` is not an encrypted vault. Same-origin JavaScript, a privileged extension, or compromised device software could read it. The app therefore avoids ads, analytics, and remote scripts and uses a restrictive Content Security Policy.

## Browser-local data

The structured thesis, optional note, watchlist, snapshots, deterministic Fits, briefs, cached opinions, model statuses, and feedback remain in browser storage. Clearing browser data or changing devices loses them.

Do not enter account numbers, holdings, passwords, or other sensitive financial information in the optional thesis note.

## Opinion request privacy

When an opinion request runs, the packet may include:

- structured thesis fields;
- any non-empty optional thesis note;
- supplied symbols and company classifications;
- deterministic Fit context;
- compact normalized evidence with source/period provenance;
- current and previous Watchlist evidence when applicable.

The note is included because it is part of the thesis being assessed. Packets exclude the Finnhub key and raw provider responses.

Discover sends only the supplied candidate set. Watchlist sends the supplied inventory because every requested review must assess every stock, including stable stocks.

The application does not intentionally persist raw prompts or packets server-side. A validated normalized response may remain in the six-hour in-process cache keyed by a request hash. Logs should contain only coarse status/error information.

## Citations and model reasoning

Every returned citation is resolved server-side to evidence included in the request. The browser receives the mapped evidence ID, symbol, and supplied evidence text; it does not receive a free-form external citation invented by the model.

The API parses only visible `message.content`. Provider `reasoning_content`, hidden chain-of-thought, and similar internal reasoning fields are ignored and are never stored or displayed. The product shows only concise cited reasoning summaries.

## Untrusted-model controls

Foundry output is never authoritative market data. For each operation, the shared API:

- validates a strict request schema;
- builds strict JSON Schema with request-specific citation and symbol enums;
- rejects unknown properties and missing required fields;
- resolves citations only to supplied evidence;
- rejects unknown, duplicate, insufficient, excessive, or misattached evidence;
- requires every supplied Discover candidate and Watchlist stock exactly once;
- rejects generated digits and quantitative magnitude words, invented numeric claims, direct trade language, price targets, and guarantees;
- requires cross-stock evidence from at least two distinct supplied symbols;
- may drop an invalid optional cross-stock pattern while retaining valid core output;
- retries one transient first-attempt timeout, HTTP 429, or server error;
- falls back to deterministic output after any final failure.

There is no AI numeric score. Deterministic Fit remains separate and cannot be changed by model output.

## Credentials, routing, and rate limits

Foundry endpoint and API key settings are held in Azure Static Web Apps application settings and are not returned to the browser or committed to the repository.

Operation-specific deployments are also server settings:

- `FOUNDRY_RESEARCH_DEPLOYMENT=gpt-5-mini-intelligence`
- `FOUNDRY_RECOMMENDATION_DEPLOYMENT=gpt-5-mini-intelligence`
- `FOUNDRY_WATCHLIST_DEPLOYMENT=gpt-oss-120b-intelligence`

Operation-specific settings take precedence. The legacy `FOUNDRY_DEPLOYMENT` fallback may remain only through rollback verification and must then be removed.

A random intelligence client identifier in browser `localStorage` supports process-local per-browser limits. It is not an account identifier and is not derived from an IP address. Process-local global and browser windows can reset during cold start or scale-out, so they reduce bursts but do not provide a durable spend ceiling.

## Failure and cleanup boundary

Validated responses are cached for six hours. Attempts are bounded, transient failures receive one retry, and every final failure preserves deterministic output.

After live and rollback verification, retain `gpt-5-mini-intelligence` and `gpt-oss-120b-intelligence`. Remove all Phi deployments and the legacy `FOUNDRY_DEPLOYMENT` setting after dependency verification and explicit destructive approval. See `.azure/deployment-plan.md` and `DECISIONS.md`.
