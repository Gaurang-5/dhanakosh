# Value Research XLS conversion

`scripts/convert-value-research.py` converts the transaction-history export into
ordinary Wealthfolio activity CSV files. It requires Python and `xlrd` (install
in a separate virtual environment). Run from the repository root:

```sh
python scripts/convert-value-research.py --output-dir /path/to/new-output /path/to/history.xls
python scripts/test-value-research-converter.py
```

The output directory must be new. The converter groups mutual funds by source
folio, stocks/ETFs/REITs by demat reference, and PPF by source account name.
Select the corresponding portfolio and account in the app's existing CSV import
flow using `account-mapping.csv`. Import only numbered transaction files with
the Default template. Dates are ISO and currency is INR. Review fund identities
using ISIN, plan and option before saving. Source references remain in comments;
the converter does not create accounts or infer brokers.

Identical worksheet snapshots are converted once even if filenames differ.
Different snapshots supplied together are rejected to avoid silently combining
overlapping histories. Within a snapshot all transaction rows are preserved.
Review duplicates against anything already imported through another source.

Purchases and SIP instalments become BUY, redemptions become SELL, and dividend
payouts become DIVIDEND. Switch legs remain separate transactions. Units and
amounts use positive magnitudes with direction represented by activity type.
Original NAV, amount and available brokerage are preserved. Source amount versus
units-times-price discrepancies over INR 1 are flagged, not corrected. Summary
totals, market values and balance units are not imported as extra transactions.

PPF contributions become explicit DEPOSIT entries in a separate PPF account.
Interest rows without amounts are excluded and listed in `review-required.csv`
with their source balances. Obtain the actual interest amounts from the passbook
before treating this as a complete PPF history. No interest is invented from a
balance or assumed rate.

## Architecture impact

This is a local file converter using the existing CSV importer. It makes no
network calls, database writes, provider changes or new persisted app settings.
The user retains account selection and asset-review control. The source XLS
files remain unchanged. Some Value Research XLS exports have malformed OLE
allocation metadata; the reader permits this export quirk while validating
worksheet headers, dates, transaction kinds and required trade values.

Verification covers signed redemptions, decimal units, dividend-only amounts,
missing interest and invalid trades. The supplied export was additionally run
through `createDraftActivities` without live imports. Provider matching and
final posting still require the normal asset review.
