# Private Household Portfolio Product Plan

## Product decision

Build a free and open-source household portfolio manager on top of Wealthfolio.
It runs locally or on one private server and supports multiple family
portfolios. It is not a public SaaS, adviser platform, or customer-tenancy
product.

The household has one login and one password. Family members are portfolio
containers inside the household, not users and not separate access identities.
After login, the household can view every member individually or together.

The project will implement self-hosted equivalents of Wealthfolio Connect
features. It will not bypass Connect subscription checks, call paid Connect or
SnapTrade services without entitlement, copy private cloud code, or represent
third-party licensed data as free. Where an external provider charges a fee, the
user may supply their own account or choose a free/manual source.

## Experience we are building

A household administrator installs the application once, creates a profile for
each family member or independently managed portfolio, imports investments from
India and international markets, and views individual portfolios or any
combination of family members through one reporting filter.

The same installation covers:

- Indian stocks, ETFs, mutual funds, bonds, SGB, gold, EPF, PPF, NPS, deposits,
  property, insurance, loans, and cash
- US and other international stocks and ETFs
- UCITS funds with listing, domicile, currency, and distributing/accumulating
  distinctions
- multiple currencies, dated FX conversion, and native/base-currency returns
- manual entry, file import, and optional direct broker/API connections
- desktop-quality web use on a private server, installable PWA/mobile layouts,
  encrypted backups, local AI, and household reporting

## Boundaries

### In scope

- one household installation
- many isolated profiles
- one household password and one recovery path
- member portfolios with no individual login or access control
- a collaborative household view across every member portfolio
- local/private-server deployment
- free self-hosted automation where providers permit it
- source-available modifications under the upstream AGPL requirements

### Out of scope

- public sign-up or arbitrary organisations
- adviser/client workflows
- subscription billing and entitlements
- separate member accounts, member passwords, or per-member permissions
- credential scraping or browser automation against broker terms
- redistributing proprietary market data
- pretending tax estimates are tax advice

## Paid-feature replacement matrix

| Wealthfolio paid capability    | Household replacement                                                                                                  | Cost boundary                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Device sync                    | Private server as the first source of truth; PWA/browser clients use the same live database                            | Free on owned hardware; hosting/VPN may cost money        |
| True offline device sync       | Later E2E sync service with per-device keys, mutation log, pairing, revocation, and conflict handling                  | Software is free; storage/traffic belongs to the operator |
| Encrypted cloud backup         | Encrypted scheduled profile backups to local disk, NAS, S3-compatible storage, WebDAV, or an rclone/restic destination | Free software; remote storage may charge                  |
| Automatic broker sync          | Open adapters using official broker APIs, user API keys, scheduled statement ingestion, and safe re-import             | Broker/API fees cannot be removed by this project         |
| Household sharing              | Local household aggregation service with member filters and combined dashboards                                        | Fully self-hosted                                         |
| BYOK AI                        | Existing local Ollama/LM Studio and user-supplied provider keys, with profile-scoped permissions                       | Local models are free; hosted API use may charge          |
| Portfolio briefs               | Scheduled local rule engine plus optional local/BYOK language-model summaries                                          | Free with local models                                    |
| Relevant news/events           | Pluggable RSS and user-supplied/open news sources, deduplicated against holdings                                       | Licensed feeds may charge                                 |
| Fundamentals/dividend insights | Open or BYOK data providers with provenance, caching, and stale-data labels                                            | No redistribution of restricted data                      |
| Analyst estimates/transcripts  | Optional provider adapters; hide the feature when no lawful source is configured                                       | Usually not reliably available for free                   |
| Licensed market intelligence   | Replace with open/BYOK providers and clearly show source/licence/coverage                                              | Cannot make proprietary licences free                     |

## Architecture

### 1. Wealthfolio core remains the ledger

Keep the existing Rust portfolio engine, activity model, calculations, SQLite
profile databases, quote-provider system, backup format, and addon sandbox.
Avoid forking financial calculations unless a tested India/global rule cannot be
implemented around the existing canonical ledger.

### 2. One database per profile

Retain Wealthfolio's current profile isolation:

- `profiles/<profile-id>/app.db`
- profile-scoped secrets and addon data
- independent ledger, backup, and import state
- one installation login; member profiles do not introduce separate logins
- no global financial table with a loosely enforced `profile_id`

### 3. Household service

Add a small server-owned household layer containing only:

- household name and display preferences
- profile membership references
- selected member IDs for read-only reporting
- owner selection for edits and imports

The service reads household member summaries and never copies canonical
transactions into a household ledger. Combined totals must be read-only and
traceable back to the source profile/account.

### 4. Private-server first

The first multi-device experience uses one always-on private server reached over
the LAN, HTTPS reverse proxy, or a private VPN such as Tailscale/WireGuard. This
avoids two independent databases and therefore avoids sync conflicts.

True offline native sync is a separate later milestone. It must not be marketed
as complete until concurrent edits, deletion, key rotation, lost devices,
restore, and schema migration have been tested.

### 5. Addons versus core changes

Use addons for:

- broker/file import screens
- provider-specific parsers
- India reports and tax worksheets
- optional research and insight pages

Use core/server changes for:

- cross-profile household aggregation
- household authentication and authorization
- background schedules that must run without a browser
- backup target management
- offline sync protocol and device-key lifecycle

## Feature programme

### A. Household and privacy

- create, rename, archive, export, and restore family profiles
- avatar and relationship labels
- one household password, cooldown, recovery path, and session timeout
- family members represented as portfolio containers, never login identities
- all household data available after the single household login
- combined net worth, allocation, performance, cash flow, goals, liabilities,
  and currency exposure
- drill-down from household totals to the permitted source account
- privacy mode that hides amounts on shared screens
- audit log for profile unlock, import, restore, sharing, and credential changes

### B. India Import Center

- preview, validation, duplicate detection, reconciliation, and reversible
  import
- Zerodha holdings, tradebook, dividends, and contract-note adapters
- Groww stocks and mutual-fund adapters
- Upstox, Angel One, ICICI Direct, HDFC Securities, Kotak, Dhan, and 5paisa
  adapters, introduced only with anonymised fixtures
- CAMS/KFintech and MF Central CAS parsing
- EPFO statement import and NPS statement import
- generic CSV mapper with saved mappings
- import history, error report, and deterministic re-import
- optional scheduled API import when an official API is available

### C. Global import coverage

- generic international activity CSV
- common US brokerage exports
- Interactive Brokers flex/query adapter where the user supplies access
- Fidelity/Morgan Stanley statement adapters as fixtures become available
- crypto exchange CSV/API adapters as an optional addon
- provider contracts based on ISIN, MIC, ticker, currency, and asset type—not
  ticker alone

### D. Instruments and assets

- stocks, ETFs, mutual funds, bonds, options, cash, crypto, commodities, and
  gold
- Indian FD/RD, SGB, PPF, SSY, NSC, MIS, EPF, NPS, and private/company shares
- property, vehicles, collectibles, insurance cash value, mortgages, and loans
- corporate actions: splits, mergers, spin-offs, rights, bonus issues, return of
  capital, dividends, reinvestment, and withholding tax
- UCITS domicile, ISIN, listing MIC, base/trading currency, and distribution
  policy
- cross-listed security identity without double-counting economic exposure

### E. Market data and currency

- provider priority and per-instrument override
- NSE/BSE symbol mapping and Indian mutual-fund NAV provider
- US and major global exchange coverage
- UCITS coverage for LSE, Xetra, Euronext, and other validated venues
- correct GBX/GBP handling
- dated FX rates with source and last-updated labels
- stale quote detection, retry/backoff, and manual-price fallback
- optional self-hosted quote cache to reduce external requests
- every displayed value exposes native currency and selected base currency

### F. Analytics and planning

- holdings and transaction tracking modes
- XIRR/MWRR, TWRR, realised/unrealised return, income, fees, and taxes
- benchmark comparison and contribution attribution
- asset, sector, geography, currency, broker, member, and account allocation
- goals, FIRE/retirement simulation, target allocation, and rebalancing
  suggestions
- household-level goals with explicit contribution ownership
- concentration, drawdown, volatility, risk/return, and scenario analysis
- look-through exposure only when sourced data is available; no double-counting

### G. India tax workspace

- Indian financial-year filters
- FIFO realised-gain worksheet
- indicative LTCG/STCG classification with versioned effective dates
- grandfathering and corporate-action inputs where supported
- dividend, interest, withholding, and advance-tax summaries
- tax-loss harvesting candidates
- exportable review worksheet with every lot and assumption
- prominent estimate/not-tax-advice labelling

Add country-neutral lot reports first; country-specific tax packs beyond India
require separately versioned rule modules.

### H. Free backup and recovery

- automatic encrypted backup per profile
- local directory, NAS, WebDAV, S3-compatible, and rclone/restic-style targets
- configurable daily/weekly schedules and retention
- checksum, atomic publication, and backup verification
- downloadable portable backup and recovery code
- restore preview, automatic safety backup, rollback, and explicit confirmation
- disaster-recovery documentation and scheduled restore drills
- administrator notifications for failed or stale backups

### I. Broker automation

- adapter interface separated from canonical import
- encrypted, profile-scoped API credentials
- read-only scopes whenever providers support them
- background scheduler with rate limits and exponential backoff
- cursor/watermark imports, idempotency keys, and duplicate protection
- reconciliation rather than silently deleting local edits
- connection health and last-success status
- no storage of broker passwords when OAuth/API-token access exists
- statement inbox/watch-folder as the fallback for brokers without usable APIs

### J. AI and portfolio intelligence

- local Ollama/LM Studio support by default
- optional user keys for OpenAI/Anthropic-compatible endpoints
- holdings-aware daily/weekly portfolio brief
- corporate action, dividend, earnings, maturity, and goal alerts
- news matching by stable instrument identifiers
- fundamentals and dividend trend summaries with citations and data timestamps
- natural-language questions over a permission-filtered, read-only portfolio
  tool
- deterministic calculations performed by the portfolio engine, never by the LLM
- prompt-injection filtering for external articles and transcripts
- no trade execution and no personalised buy/sell instruction mode

### K. PWA and notifications

- installable responsive web application
- fast household/profile switcher
- read-only privacy-safe home-screen widgets where supported
- optional email, ntfy, Gotify, or local push notifications
- alerts for import failures, stale quotes, allocation drift, maturities, goals,
  and backup failures
- offline read cache only after its encryption and data-expiry model is defined

### L. Operations and product quality

- Docker Compose example with persistent volumes and health checks
- HTTPS/private-VPN deployment guide
- structured logs with financial values and secrets redacted
- database migrations with rollback/recovery tests
- dependency, licence, and secret scanning
- import fixture suite using synthetic/anonymised data
- accessibility, responsive, LTR/RTL, and keyboard testing
- performance budgets for large portfolios and multi-year histories
- source and attribution page satisfying AGPL and third-party notices
- independent rebrand before any public distribution

## Delivery phases

### Phase 0 — Freeze the foundation

1. Pin the upstream version and document our patch surface.
2. Create synthetic India/US/UCITS/multi-currency portfolios.
3. Add automated core, frontend, addon, and migration checks.
4. Choose the new product name and establish licence/attribution handling.

**Exit:** reproducible development build, fixtures, backup, and green baseline.

### Phase 1 — Useful private household MVP

1. Deploy the self-hosted server with secure private access.
2. Finish multiple-profile onboarding, password/PIN, recovery, and switching.
3. Build the consent-based combined household net-worth/allocation dashboard.
4. Finish generic CSV plus Zerodha and CAMS/KFintech preview-first imports.
5. Add scheduled encrypted local/NAS backups and restore verification.

**Exit:** a family can use one private server daily without Connect.

### Phase 2 — India completeness

1. Add Groww, Upstox, Angel One, and selected broker statement adapters.
2. Add EPF, NPS, deposits, government schemes, property, insurance, and loans.
3. Validate Indian quotes/NAVs and India financial-year reports.
4. Add reconciliation and household goals.

**Exit:** the synthetic and pilot household portfolios reconcile against source
statements and every unsupported field is reported rather than guessed.

### Phase 3 — Global and UCITS

1. Validate US/global broker files and official API adapters.
2. Implement ISIN/MIC-based listing identity and UCITS metadata.
3. Validate FX, GBX/GBP, dividends, withholding, and corporate actions.
4. Add cross-market exposure and benchmark reporting.

**Exit:** India, US, and UCITS golden portfolios pass value and return checks.

### Phase 4 — Automation and insight

1. Add the scheduler and safe broker/API adapters.
2. Add open/BYOK fundamentals, news, earnings, and alert providers.
3. Add local/BYOK portfolio briefs and question answering.
4. Add notification channels and operational status screens.

**Exit:** automation is idempotent, sources are cited, failures are visible, and
no AI-generated number replaces an engine calculation.

### Phase 5 — Advanced device support

1. Ship and harden the installable PWA.
2. Decide whether real offline native databases are justified.
3. If justified, design E2E mutation sync, pairing, revocation, conflict policy,
   snapshot recovery, and schema compatibility as a separate protocol.

**Exit:** multi-device claims match tested offline/concurrent behavior. Until
then, the private server remains the authoritative database.

## Release gates

Every release must demonstrate:

1. no cross-profile data or credential leakage
2. duplicate-safe imports and deterministic re-import
3. correct native/base-currency totals and dated FX
4. reproducible XIRR/TWRR and lot calculations against fixtures
5. successful encrypted backup restore, not merely backup creation
6. secrets absent from logs, browser storage, exports, and repositories
7. explicit source, timestamp, and licence for external market/intelligence data
8. desktop and self-hosted-web verification for shared code
9. documented unsupported institutions, instruments, and tax cases
10. AGPL source/notice compliance for any network-served modified version

## Recommended first build slice

Do not begin with device sync or AI. Build the smallest complete household loop:

1. private server deployment
2. three synthetic family profiles
3. combined read-only reporting with one-or-more-member filters
4. Zerodha and CAMS/KFintech preview-first imports
5. India/US/UCITS quote validation
6. automatic encrypted local/NAS backup plus a proven restore

This delivers the main household value and removes dependence on paid Connect
without taking on the highest-risk distributed-sync work prematurely.

## Combined reporting implementation — 24 October 2026

The existing Overview, Home, Holdings, Net Worth, Goals, Activities, Income, and
Performance layouts now read the selected family members. Activities retains its
search, date/type/account filters, and table; editing selects the record owner.
Spending stays hidden in household mode.

Performance combines namespaced member valuation, lot, and cash-flow inputs in
the existing Rust measurement engine. It does not add member return percentages.
Income recomputes growth and averages from the combined amounts and preserves
missing-FX warnings. Income and Performance currently require a shared reporting
currency across selected members; their investments may have different native
currencies. This reporting change adds no database, migration, sync, or
provider.

The demo seeder can add duplicate-safe synthetic dividends and bond interest to
the existing demo profiles with
`node scripts/seed-household-demo.mjs --income-only`. This option refuses
non-demo accounts. It is sample data, not historical payouts.

Verification covers combined return weighting, deposits excluded from gains,
currency mismatch rejection, locked-member exclusion, original-page regressions,
member selection, Activities search and edit ownership, and RTL rendering. The
broader import, automation, backup, and device-sync roadmap above remains
separate from this completed reporting slice.

### Reporting filter correction — 25 October 2026

Selecting one member stays in the same reporting page and does not switch the
active profile or reload the document. Explicit editing uses the existing owner
profile; a `memberEdit=1` URL flag distinguishes that view. Returning to a
report or applying the member filter clears the editing view. No new persisted
state or backend authorization mechanism is introduced.

### Import, backup and automation increment — 25 October 2026

- Native import presets: Zerodha delivered-equity tradebook columns, common
  India CSV (INR default), common global CSV (USD default). Explicit CSV
  currencies take precedence. Asset/exchange review and duplicate review remain
  native; no arbitrary broker or CAS/PDF parser is implied. Synthetic examples
  and limitations are in `docs/import-examples/README.md`.
- India Import Center now opens the real import wizard rather than counting file
  characters. It does not request file access or maintain a second ledger.
- The existing six-hour server market refresh is retained. Regression coverage
  checks India/US/London listing resolution and minor-currency normalization.
  AMFI automatic NAV ingestion remains unfinished; demo prices remain synthetic.
- Optional daily local snapshots reuse SQLite's native snapshot service and
  profile worker lifetime, independently of Connect. Configuration and limits
  are in `docs/local-maintenance.md`. No schema or external storage was added.
- Private server schedules require the server and the member runtime to stay
  open. Unopened/locked members, off-device backup copies, CAS/PDF adapters and
  credentialed broker sync remain separate work, not silently marked complete.

### NAV, statements, recurring instructions and backup increment — 25 October 2026

Implemented in this increment:

- Official AMFI current/historical NAV provider, exact scheme-code routing,
  plan/ option-aware search, bounded bulk-feed cache, provider settings and a
  new additive provider-registration migration. Current and historical official
  feed access was tested live. Existing manual prices are not silently
  reassigned.
- Local CAMS/KFintech detailed CAS conversion into the native import review.
  Requires the Python environment described in `scripts/cas/README.md`.
  Reconciliation failures reject the candidate before any ledger write.
- Explicit read-only Zerodha and Upstox current-day delivery-trade previews.
  Transient credentials, fixed HTTPS broker endpoints, no redirects, no order
  placement and no automatic import. Both use the original review/commit flow.
  Historical trades continue to use CSV. Broker fees are not included in these
  endpoints; review them against statements. External access terms still apply.
- Per-member monthly SIP, SWP, and STP instructions in the existing SQLite
  settings store. Month-end dates clamp to the actual month, plans can pause/
  resume, and matching buys, sells, or transfer pairs are review suggestions.
  Recording an installment that is already due writes that trade at the saved
  price. It does not place a broker order, and a future date is not written as a
  trade.
- Scheduled backup catalogue timestamps survive restarts; unprotected members
  start with the server when scheduling is enabled. Retention affects scheduled
  local copies only. Optional verified encrypted copies use a mounted off-device
  directory. Original member backup/preview/restore UI remains in place.

Architecture impact: new optional CAS subprocess and explicit broker HTTPS
reads; AMFI uses the existing provider registry and portfolio job lifecycle.
Recurring instructions use existing settings persistence. Backup catalogue adds
a scheduled reason and reuses snapshot validation, leases and worker shutdown.
None introduces Connect billing, public registration, member login, a second
ledger, or background trade execution. The original dashboard/overview layout is
unchanged.

Acceptance still required before claiming complete coverage:

- Real redacted CAMS/KFintech PDFs, including tax/reinvestment edge cases.
- Live broker credentials to verify account permissions, token expiry and actual
  response variants; no credentials were supplied during development.
- Actual Groww/Angel One/NPS/EPFO export samples for dedicated format adapters.
  Generic CSV support is available; arbitrary PDF support is not claimed.
- An off-device destination and key-recovery procedure selected by the owner. No
  external backup destination has been invented or activated.
- SGB exchange symbols where quotes exist; unavailable series remain manual.
- A single family-wide restore wizard is not part of this increment; restore
  remains an explicit per-member preview and confirmation.

Combined SIP reporting uses the existing family selector and stays in the same
browser document when filtering one or several members. Manage plans explicitly
opens that member's editor. The household plans endpoint follows the existing
unlocked-member read boundary; no profile password is bypassed. A synthetic
monthly plan has been added for each demo member without creating more trades.
The seeder's `--plans-only` option adds these idempotently and refuses non-demo
accounts. Amount comparisons round decimal strings to the currency's minor unit,
and purchase months use the configured timezone.

Validation for this increment: focused TypeScript regressions, adapter command
parity, translation-key checks, Python conversion tests, Rust provider/resolver/
plan/backup tests, both frontend build targets, Rust Clippy and runtime build.
Live AMFI current/history feed and in-app scheme search passed. Isolated browser
coverage exercises saved plans, member isolation, invalid imports and import
controls; desktop/mobile RTL was also checked against the development app. Real
issuer PDFs, broker account authentication and off-device destination recovery
remain acceptance gates; the full application E2E suite was not run.

### PPF statement tracking

Use Settings → Accounts → the member's investment accounts → Add account → **Set
up a PPF account**. This presets an INR transaction-tracked investment account
and classifies its cash balance as fixed income. The existing ledger records
contributions (deposits), statement-credited interest, withdrawals, and internal
transfers. Existing member and household valuations include the balance.

For an existing PPF, enter the opening statement balance once, then only later
transactions. If funding comes from an account already tracked here, use an
internal transfer instead of another deposit. The old synthetic demo PPF bond is
not automatically migrated; do not recreate that same balance in a second
account.

This is statement tracking, not a PPF eligibility, maturity, tax, annual-limit,
or projected-interest calculator. No interest is automatically posted and no
external provider is contacted. It reuses account metadata and activity APIs;
there are no new migrations, background jobs, or runtime endpoints.
