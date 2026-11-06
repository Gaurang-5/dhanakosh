# Direct broker connections

Open **Connections** and select an INR investment account from its portfolio
group. Each investment account has its own broker credentials and connection
status; multiple portfolios may each contain a Zerodha account. File-based
tradebook import does not ask for API credentials. Choose Zerodha Kite or ICICI
Direct Breeze.

### Zerodha automatic login (web app)

1. Register your Kite application with the **Registered redirect URL** shown in
   Connections. For the local development app it is
   `http://localhost:1420/broker-callback.html`. On a private server use the
   exact HTTPS origin where you open the app, followed by
   `/broker-callback.html`. The URL is configured at Zerodha; the app cannot
   change it for you.
2. Enter your API key and API secret, then select **Connect with Zerodha**.
3. Complete the official login in the popup. Keep the original app window open.
4. The popup returns to the registered callback, and the app exchanges the token
   through its existing backend endpoint. Credentials are saved only after the
   holdings read succeeds.

Allow popups for this app. Cancelling, closing the popup, leaving the page,
locking/changing the member, or waiting ten minutes cancels the pending attempt.
Reloading loses the attempt; start a fresh login. No pending state or secrets
are written to browser storage. A successful state is consumed once.

### Manual fallback / ICICI / Tauri

Open **Manual login / fallback**, log in at the broker, and paste only the
`request_token` (Zerodha) or `API_Session` (ICICI) from the broker redirect into
the matching field. ICICI's published API documentation does not establish a
per-attempt state round trip, so an automatic ICICI callback is not enabled. The
native Tauri app retains this manual flow; external-browser popup handoff is
currently implemented only for the web app.

Use **Fetch holdings** for subsequent reads, or repeat login when the broker
session expires. Enter your broker password and OTP only on the broker website.

The API credentials belong to the user, and broker API pricing and access rules
still apply. This feature does not use Wealthfolio Connect or its subscription.

## Current coverage

- Zerodha: settled equity holdings from `/portfolio/holdings`. No mutual fund,
  derivatives, unsettled-quantity, or historical-trade aggregation in this view.
- ICICI: demat quantities from `/dematholdings`, identified by ISIN. ICICI's
  internal stock codes are displayed as broker codes, never treated as NSE
  ticker symbols. Breeze's documented market-data coverage is NSE only.
- The table is a **read-only preview**, not an imported balance. No purchase
  dates, cost basis, or transactions are inferred. Use the existing tradebook
  import workflow to populate the portfolio and calculate returns.
- Fetching is manual; no background scheduler or automatic session renewal.
- Removing a connection deletes its locally saved credentials. It does not
  revoke the API application or session at the broker.

## Architecture impact

Shared Rust code owns authentication, request signing, bounded response parsing,
and ISIN-based display identity. Thin Axum and Tauri entry points call the same
service through the existing frontend adapters. Requests go only to fixed broker
HTTPS endpoints, disallow redirects, have time and size limits, and never call
order-placement endpoints. Broker-supplied errors are not echoed to avoid
leaking credentials or personal information.

Credentials use the existing profile-scoped SecretStore, reserved under
`direct_broker_v1:`. The generic secrets API cannot read/write this namespace.
The selected account is resolved in the active member's database before any
credential or network access. The frontend does not persist credentials. No
ledger, provider setting, migration, event, or background job is changed.

Tests cover ISIN normalization, invalid/duplicate response rejection, signing
sensitivity to the exact body, profile/account isolation, reserved credential
access, and responsive/RTL setup. Real login remains unverified until tested
with a user's broker-issued credentials.

References:

- https://kite.trade/docs/connect/v3/user/
- https://kite.trade/docs/connect/v3/portfolio/
- https://api.icicidirect.com/breezeapi/documents/index.html

## Browser callback boundary

`broker-callback.html` is a static, same-origin relay with no application
bundle, third-party resources or storage. It strips the query string before
loading any other content and sends the result only to the same-origin opener.
The opener requires the exact origin, exact popup Window, expected message shape
and random per-attempt state before calling the existing authenticated broker
endpoint. Zerodha returns that state using its documented `redirect_params`
parameter. The broker token exchange, SecretStore, ledger, provider settings and
both runtime API contracts are unchanged. No new server persistence or
background worker is introduced. The existing manual flow remains available if
the broker/browser severs the opener relationship.

Unit tests exercise rejected origins, popup sources, state mismatch,
cancellation, timeout, blocked popups and one-time consumption. Browser tests
emulate the broker redirect and backend exchange; they do not prove that a real
broker account or its registered redirect configuration works. Real
authentication still requires broker-issued credentials.
