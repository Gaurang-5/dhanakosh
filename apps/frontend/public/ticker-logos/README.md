# Ticker logos

This directory contains the curated 96×96 PNG ticker logos bundled with
Wealthfolio.

- US listings use a bare ticker, such as `AAPL.png`.
- Other listings use `TICKER-MIC`, such as `SHOP-XTSE.png`.
- `manifest.csv` records each asset's identity, market, and review
  date.
- `index.html` is a searchable visual catalog.

The Wealthfolio code license does not grant rights to third-party names, logos,
or trademarks in this directory. They remain the property of their respective
owners and are included only to identify securities in the application. See the
repository's `TRADEMARKS.md` for details.

## Indian listing additions (2026-10-25)

- `RELIANCE-XNSE.png`: Reliance Industries, from the logo on https://www.ril.com
  (https://rilstaticasset.akamaized.net/sites/default/files/2022-09/logo-scroll.png).
- `TCS-XNSE.png`: Tata Consultancy Services, via
  https://commons.wikimedia.org/wiki/File:TCS_Logo.jpg (TATA CONSULTANCY SERVICES;
  CC BY 4.0, https://creativecommons.org/licenses/by/4.0/; thumbnail converted to PNG).
- `HDFCBANK-XNSE`, `ICICIBANK-XNSE`, `INFY-XNSE`, `WIPRO-XNSE` reuse the bundled
  issuer logos HDB, IBN, INFY and WIT respectively. They identify the company,
  not an equivalence of ADR holdings and Indian shares.

These additions retain source dimensions. They are served locally, like the rest
of the pack. NSE/BSE identifiers resolve to these company logos; user-uploaded
logos retain priority. The pack is curated and does not cover every Indian issuer.

## General Indian-company fallback (2026-10-26)

The app and shared ticker avatars try uploaded logos and bundled market-specific
logos first. Missing NSE/BSE images use the public
[India API](https://api.dharun.dev/docs/logos), with an explicit exchange and
URL-encoded ticker. This covers its general company catalogue, not a portfolio
allowlist. No API key is required. Only the public security identifier is sent;
images use `no-referrer`. API failures fall back to initials, without affecting
quotes or transactions. Listings without a published logo may receive a provider
monogram. Global listings retain the existing bundled logo coverage; universal
logo availability is not guaranteed. The addon sandbox retains its local-only
asset bridge.

Indian listings never fall back to an unsuffixed US ticker logo: the same ticker
can identify unrelated companies. Uploaded logos still take priority. No new
persistent logo cache or background synchronization was added. Logos and
trademarks belong to their respective company owners.
