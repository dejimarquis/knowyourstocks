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

The same-origin SEC fallback receives only a public ticker symbol. It does not receive the user's Finnhub key, thesis, watchlist, or other personal data.

## Personal investment thesis

The thesis is stored in browser `localStorage` so it survives reloads. It is not sent to Azure, Alpha Vantage, or an AI service. Other browser profiles cannot normally access it, but anyone with access to the same unlocked browser profile or device may be able to view it.

Do not enter account numbers, holdings, passwords, or other sensitive financial information in the thesis note.

## Watchlist intelligence

The watchlist, snapshots, brief, and feedback remain in browser `localStorage`.

When a review completes, the managed API may send a compact evidence packet to Azure Foundry Phi. It contains:

- structured thesis preferences;
- watched symbols and classifications;
- current fit labels;
- deterministic signal titles, summaries, and evidence;
- the free-text thesis note only when the user explicitly opts in.

It does not contain the Finnhub key. The server does not persist watchlist packets or prompts. It logs only coarse status and error information.

Phi output is treated as untrusted:

- only known evidence aliases are accepted;
- model patterns must cite verified deterministic signals;
- unknown evidence and prohibited trade-advice language are rejected;
- model failures fall back to the deterministic brief;
- model calls time out and cannot block the initial watchlist result.
