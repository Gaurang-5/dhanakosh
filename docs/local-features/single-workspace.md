# Single-user portfolios

The local web app uses one workspace. Portfolio names are arbitrary labels, not
login identities. Create portfolios in Settings > Portfolios, then select an
owner and a country when creating an account in Settings > Accounts. Country is
independent of account currency and security exchange. The top bar combines all
portfolios by default and can select several portfolios, accounts, and an
account country without changing sessions or navigating away.

Existing dashboard, overview, holdings, income and performance screens remain.
Investment plans and account lists follow the shared selection. Goals are
filtered by their funding accounts; goal targets remain whole goals. Standalone
alternative assets without an account assignment appear only in the combined
view, not in a selected-account report.

## Architecture impact

Ownership reuses SQLite portfolio_accounts; no schema migration or separate user
store was added. Account form submissions supply meta.portfolioId, consumed
within the account write transaction and removed from persisted metadata.
Country remains in account metadata. Moving an account replaces its membership
without changing its ledger. Portfolio deletion rejects portfolios containing
accounts. Legacy callers that omit ownership remain compatible, so imports must
target an account created under a portfolio.

The session-scoped account filter is shared by report pages. Net-worth APIs
accept optional accountIds in both Axum and Tauri, backed by the existing core
service. An explicitly empty list returns no accounts; omission means combined
wealth. There are no new quote-provider calls, retries, or background workers.
Existing internal profile/session machinery still protects the workspace;
portfolios do not invoke profile switching. Native runtime wiring compiles, but
browser flows are the UI validation target.

## Local development

The ignored .env.web selects db/single-workspace for pnpm dev:web. Old household
demo data is no longer used, but was not physically deleted. This directory
contains an empty INR workspace, with no demo balances. Configure deployment
authentication and secrets through the existing server configuration for
private-server deployment.

## Verification

The isolated e2e/profiles/workspace-portfolios.spec.ts creates
portfolios/accounts through both APIs and UI, checks combined and scoped net
worth, empty selection, invalid ownership rollback, moving ownership, guarded
deletion, no filter-triggered reload, and mobile Arabic RTL layout. It uses
playwright.profiles.config.ts and never writes to the live workspace. Dashboard
and selector regressions, adapter parity, Rust storage/core checks, type
checking, lint, translations, web and Tauri frontend builds accompany this flow.
