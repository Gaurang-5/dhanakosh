# Import destinations

Transactions belong to an account ID. The account's portfolio membership
determines the portfolio; importing does not create or switch users.

- Choose the destination account in the import wizard. Account pickers, mapped
  cells, review rows, and bulk account actions show `Portfolio / Account`,
  including when two portfolios use the same broker name.
- The global reporting filter does not replace the wizard's explicit destination
  selection.
- A file without an Account column uses the selected account. Blank Account
  cells use the selected/default account.
- A populated Account cell must resolve to a valid account ID or an explicit
  mapping. It can deliberately target a different portfolio. Unknown or stale
  account references stay unresolved and require correction instead of silently
  using the default account.
- Automatic matching refuses duplicate account names. Display labels do not
  alter saved names or the matching rules.
- Changing the selected account ignores a late linked-template response for the
  account previously selected.

Architecture: the existing CSV mapping, draft validation, import API and account
ownership tables are reused. No schema, broker credentials, quote-provider
settings or import execution timing changes are introduced. The changed draft
resolution stops fallback for invalid populated Account values; the account ID
remains the persistence boundary.

Verification: focused account matching/draft/selector tests and
`e2e/profiles/import-portfolios.spec.ts`. The browser test uses a disposable
installation and imports cash transactions through mapping, review and
confirmation into two portfolios with identically named accounts, then checks
each account's net worth through the backend.
