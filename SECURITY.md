# Security and privacy

## Finnhub API key

Know Your Stocks does not receive or store a user's Finnhub key.

- The key is kept in the browser's `sessionStorage`.
- It is saved as soon as it is entered, so it survives page refreshes in the same browser session.
- It is sent directly from the browser to Finnhub.
- It is normally cleared when the browser session closes, although browser session-restore behavior can preserve a session after a crash or restart.
- It is never committed to this repository, included in the JavaScript bundle, sent to Azure, or placed in application logs.

`sessionStorage` reduces persistence but is not an encrypted secret vault. JavaScript running on this site's origin, a browser extension with page access, or malware on the device could potentially read it. To reduce that risk:

- the app loads no analytics, advertisements, remote scripts, or third-party UI packages;
- Azure serves a restrictive Content Security Policy;
- each user supplies a personal, non-commercial Finnhub key rather than sharing the owner's key;
- the public IBM demo uses Alpha Vantage's non-secret `demo` key.

If a personal key may have been exposed, replace it through Finnhub and close the affected browser session.

Normalized stock results are cached in browser `localStorage` for up to six hours to avoid unnecessary API calls. The cache contains market data, not the API key.

## Personal investment thesis

The thesis is stored in browser `localStorage` so it survives reloads. It is not sent to Azure, Alpha Vantage, or an AI service. Other browser profiles cannot normally access it, but anyone with access to the same unlocked browser profile or device may be able to view it.

Do not enter account numbers, holdings, passwords, or other sensitive financial information in the thesis note.
