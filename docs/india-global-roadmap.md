# India + Global Portfolio Roadmap

The broader household product scope, including self-hosted replacements for
optional paid Connect capabilities, is defined in
[`household-product-plan.md`](household-product-plan.md).

## Decision

Use Wealthfolio as the application base and keep the upstream architecture
intact while India-specific imports and reports are developed as an addon. Only
move functionality into the Rust core when an addon cannot preserve the same
data, security, or calculation guarantees.

Baseline:

- Wealthfolio version: `3.11.0`
- Upstream commit: `8ef1cb7d8`
- Working branch: `codex/india-global-foundation`
- Product name: Dhanakosh (धनकोश). Visual mark is the Dhanakosh icon, not the
  Wealthfolio logo.

## Household deployment model

The product is one local installation or one privately hosted household
instance. It is not a public SaaS, multi-tenant adviser platform, or customer
portal. Public registration, organisations, adviser access, billing, and
customer tenancy are explicitly out of scope.

Use Wealthfolio profiles as member portfolios inside that single installation.
There is one household login and one password; members do not receive separate
accounts or individual access:

- one profile per family member or independently managed portfolio
- separate profile databases and profile-scoped credentials
- profile switching from the shared installation
- one shared household authentication boundary

A combined family dashboard aggregates read-only summaries from every member
profile without duplicating transactions or weakening database isolation. The
India Import Center remains profile-scoped, so an import always belongs to the
currently selected family profile.

## Architecture impact

The first implementation phase does not change quote-provider selection,
portfolio calculations, SQLite persistence, device sync, or secret handling. It
reuses the addon sandbox and the existing host APIs:

- `files` for user-selected statements
- `activities.checkImport` and `activities.import` for validation, duplicate
  detection, and persistence
- `accounts`, `assets`, `currency`, and `quotes` for canonical portfolio data
- addon-scoped `storage` for non-sensitive import preferences
- `secrets` plus brokered `network.request` for credentials and approved API
  calls

The addon must not store financial data or secrets in browser `localStorage`.

## Canonical instrument rules

Do not treat a ticker as a globally unique identity. An imported security should
retain, when available:

- ISIN
- exchange MIC
- exchange ticker
- trading currency
- provider symbol
- country of domicile
- instrument type (stock, ETF, mutual fund, bond, and so on)
- fund distribution policy (accumulating or distributing)

Wealthfolio currently resolves exchange-traded securities primarily by ticker
plus optional MIC. Its provider profile can retain an ISIN. That is sufficient
for the first US, India, and UCITS validation cohort, but true cross-listing
deduplication and look-through exposure may require a later core identity
change.

## Phase 0: Golden portfolio fixture

Create a synthetic, non-personal test portfolio before implementing imports. It
should cover:

| Region         | Examples                                           | Required behavior                             |
| -------------- | -------------------------------------------------- | --------------------------------------------- |
| India          | NSE stock, BSE stock, Indian mutual fund, gold ETF | INR quotes, Indian grouping, broker import    |
| United States  | US stock, US ETF                                   | USD quotes, dividends, splits                 |
| UCITS          | LSE and Xetra ETF listings                         | correct MIC, currency, ISIN, and listing      |
| Multi-currency | INR, USD, EUR, GBP/GBX                             | dated FX conversion and base-currency returns |

Every importer and provider change must be checked against this fixture.

## Phase 1: India Import Center addon

Build one addon with a preview-first import flow. Start with these adapters:

1. Zerodha holdings and tradebook
2. Groww stocks and mutual funds
3. Upstox and Angel One tradebooks
4. CAMS/KFintech CAS
5. Generic CSV mapping as an escape hatch

Each adapter should produce the existing `ActivityImport` shape, call
`activities.checkImport`, show validation and duplicate results, and only call
`activities.import` after explicit confirmation. Parser fixtures must be
anonymised and committed with focused tests.

Deferred from this phase: broker login automation, email scraping, and automatic
background imports.

## Phase 2: Market-data coverage

Validate existing Yahoo symbol resolution first:

- NSE and BSE suffixes
- US exchanges
- LSE, Xetra, and Euronext UCITS listings
- GBP versus GBX quote scaling

Use Wealthfolio's existing custom HTTP provider for an Indian mutual-fund NAV
source when a stable JSON or CSV endpoint is sufficient. A compiled Rust
provider is justified only if authentication, pagination, identifier mapping, or
failure isolation cannot be expressed by the custom-provider mechanism.

Provider failures must remain isolated, disabled providers must receive no
requests, and user-edited asset metadata must not be overwritten by enrichment.

## Phase 3: India reports

Add reports without changing the canonical transaction ledger:

- financial-year XIRR
- FIFO realised gains
- indicative LTCG/STCG classification
- dividend and interest summaries
- tax-harvesting candidates
- benchmark comparison against a user-selected Indian index

Tax output must be labelled as an estimate and must preserve the underlying lots
and calculation inputs for review. Tax rules should be versioned by effective
date rather than scattered through UI components.

## Phase 4: Core changes only where proven necessary

Open a separate design change before modifying persisted identity or portfolio
calculations. Likely candidates are:

- first-class fund/share-class identity across multiple listings
- ISIN-based deduplication with listing-level price sources
- fund domicile and accumulating/distributing metadata
- look-through ETF and mutual-fund exposure
- jurisdiction-aware tax-lot reporting

Any schema change must use a new migration and be verified in both Tauri and web
runtimes.

## Phase 5: Distribution and branding

Before distributing a modified build:

- choose a new product name and replace Wealthfolio trademarks and brand assets
- retain required AGPL and third-party notices
- publish the corresponding source as required by the applicable licence
- document backup, restore, encryption, and data-source limitations
- perform a dependency and secret-handling review

## Verification gates

For every phase:

1. Run focused parser or domain tests.
2. Run `pnpm type-check` and the relevant frontend tests.
3. Exercise both normal and duplicate/re-import paths.
4. Verify values in native currency and selected base currency.
5. Verify the changed UI in left-to-right and right-to-left modes.
6. Run web and Tauri builds when shared adapter or runtime wiring changes.
7. Record anything not tested; do not treat a dev server as a build check.

## First deliverable

The first functional deliverable is the India Import Center addon with a Zerodha
holdings/tradebook adapter and synthetic fixtures. It provides immediate value
while keeping the upstream data model and calculation engine unchanged.
