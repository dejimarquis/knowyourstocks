# Decision log

This file records choices that are important, non-obvious, or worth revisiting after the friend beta.

## Local-first, no accounts

The thesis, watchlist, snapshots, briefs, and feedback stay in browser storage. This removes account, database, and privacy overhead for the POC, but there is no cross-device sync and clearing browser data loses the saved state.

## Finnhub is bring-your-own-key

Each user supplies a Finnhub key that is stored in `sessionStorage` and sent directly to Finnhub. This avoids centrally redistributing licensed market data and owner-funded quota, but users must obtain a key and browser storage is not an encrypted vault.

The review pipeline reserves a margin below Finnhub's free 60-request-per-minute allowance, limits sentiment checks to the three largest movers, and blocks repeated full reviews for one minute. These controls favor reliability over instant repeated refreshes.

## SEC EDGAR is a fundamentals fallback, not a quote provider

SEC company facts fill missing growth, margin, EPS, equity, and ROE evidence. Calculations align reporting frames where a ratio requires compatible periods. Quarterly EPS may be annualized for scoring context, but it is not converted into or presented as trailing P/E.

The managed API identifies itself to the SEC, spaces upstream requests below the fair-access threshold, retries bounded transient failures, deduplicates concurrent company requests, and limits its in-memory cache.

## Deterministic logic has authority over Phi

Rules calculate metrics, fit, severity, freshness, and evidence. Phi can only reorder verified signals and identify relationships supported by at least two distinct evidence IDs. User-facing pattern titles and explanations are built from allowlisted relationships and deterministic evidence rather than free model prose.

This intentionally makes the AI less expressive than a chat assistant. The tradeoff is lower hallucination and investment-advice risk.

## Phi-4-mini-instruct, not a reasoning model

Live benchmarks favored Phi-4-mini-instruct for latency, token use, and constrained-output compatibility. Phi-4-mini-reasoning consumed more tokens and was slower at the same pricing tier; larger Phi deployments timed out at the tested low capacity.

The unused benchmark deployments remain in Azure because deleting resources is destructive. They have no idle token cost but consume quota and should be removed after review.

## AI enhancement defaults on with an explicit opt-out

The structured Phi enhancement is enabled by default to keep the POC low-friction, and users can disable it before a review. The free-text thesis note remains excluded unless separately opted in.

The model packet contains structured thesis preferences and deterministic signals only. It no longer includes the watchlist inventory, provider payloads, browser history, or Finnhub key.

## Durable model-spend stop uses Azure Table Storage

Process-local counters reset during cold starts and scale-out, so they cannot enforce a cost ceiling. A small zone-redundant Storage account now holds monthly global and daily anonymous-browser reservations in one atomic transaction. The random browser identifier is converted into a keyed hash that rotates daily; IP addresses are not stored.

Production fails closed if durable quota storage is unavailable. The default global ceiling is 1,000 model calls per month, far below the existing $25 Azure budget. The Azure budget remains an alert; the Table counter is the application-level hard stop.

Static Web Apps managed Functions on the Free plan do not provide a practical managed-identity path for this architecture. The POC therefore uses a storage connection string and Foundry key in encrypted Static Web Apps application settings. This is a deliberate compromise; a later authenticated API should use managed identity and RBAC.

## Azure deployment remains intentionally small

The app uses one Free Azure Static Web App with managed Functions, one serverless Foundry deployment, and one tiny ZRS Storage account for quota counters. It is single-region and has no background worker, database of user data, email, push notifications, or brokerage connection.

Accounts, cloud sync, true background alerts, centrally licensed market data, and multi-region failover are deferred until usage proves they justify their cost and complexity.
