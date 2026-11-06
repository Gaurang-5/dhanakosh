# Investment document coverage

Extend the current importer. Coverage is tracked per document layout and
version, not by a broker logo or the number of names in a picker. A source can
have Indian and overseas products, different statement issuers, and historical
formats.

## Implemented in this increment

- Local recognition of transaction tables in CSV and Excel reports, including a
  header below report metadata. Uses the existing SheetJS reader; no dependency,
  broker connection, migration, or new persistence path is added.
- Exact field priorities for trade dates, execution prices and gross amounts.
  Saved mappings still take precedence. Net amounts require explicit mapping.
- Saved templates and manual header/row settings disable the new table cleanup.
  Switching to those settings recreates the CSV from its original source, so
  existing row offsets are not applied to an already shortened file.
- Original columns, numeric strings, unknown actions, malformed values and
  trailing rows remain available to the existing mapping and review steps.
- Multiple candidate tables in the header search, duplicate headers and extra
  populated columns prevent automatic preamble removal. Unrecognized CSVs go to
  the original parser unchanged, including its legacy-encoding support.
- The initial header search is limited to 50 rows. This is table detection, not
  a guarantee that an arbitrary broker report can be imported correctly.

The existing Zerodha presets, Value Research workbook conversion, IBKR PDF
confirmation reader and CAS path remain separate capabilities. They have not
been re-certified against new real statements in this increment.

## Source discovery scope

These are research targets, not a supported-source list. Confirm current product
availability and statement issuer before adding each format. Historical exports
matter even when a product has closed, moved, or changed broker partners.

| Group                                             | Sources to investigate                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indian broker exports                             | Zerodha, Groww, Upstox, Angel One, Dhan, FYERS, 5paisa, ICICI Direct, HDFC Securities, Kotak Securities, Motilal Oswal, Sharekhan, SBI Securities, Axis Direct, IIFL Securities, Paytm Money, Alice Blue, Nuvama, Fisdom, m.Stock, Shoonya, SAMCO, Choice, Geojit, SMC, Flattrade |
| Indian-facing overseas investment apps and routes | INDmoney, Vested, Tickertape, ICICI Direct Global, HDFC Global Investing, Winvesta, Stockal, Appreciate, INX Global Access, Dhan's overseas route, Zerodha's overseas route, historical Groww and Fi exports                                                                      |
| Underlying overseas statement families            | Interactive Brokers, ViewTrade, DriveWealth, Alpaca; establish which issuer and account version a particular app uses                                                                                                                                                             |
| Mutual fund and consolidated sources              | CAMS, KFintech, NSDL, CDSL, MF Central; app-issued exports from Kuvera, Groww, Coin, Paytm Money, ET Money, Scripbox and others                                                                                                                                                   |
| Employer investment statements                    | Fidelity, Morgan Stanley at Work, E\*TRADE, Schwab and other employee stock-plan administrators                                                                                                                                                                                   |
| Other investment documents                        | NPS, EPF/PPF, bonds, SGBs, PMS/AIF and deposits; each requires its own document and domain review                                                                                                                                                                                 |

The inventory is deliberately open-ended. Add newly discovered sources and
versions instead of treating these names as the universe of Indian investing.

## Verified discovery pointers

Documentation below establishes an export path or provider relationship. It does
not establish compatibility with a parser.

| Source              | Evidence                                                                                                                                                                                                                                                                                                                                 | Next required evidence                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Zerodha             | [Official tradebook export guide](https://support.zerodha.com/category/console/reports/other-queries/articles/where-can-i-see-all-the-trades-i-ve-taken-for-a-particular-period): CSV and XLSX                                                                                                                                           | Original/anonymized equity and Coin layouts, including older versions                                  |
| Vested              | [Official transaction export announcement](https://vestedfinance.com/blog/vested-updates/a-whole-new-way-to-invest-the-vested-web-experience-just-got-a-major-upgrade/): PDF/XLSX; [trade-confirmation guide](https://support.vestedfinance.com/portal/en/kb/articles/how-do-i-get-confirmations-on-my-daily-trades-via-vested-8-2-2024) | Original transaction exports, cash activity and confirmations; layout/version checks                   |
| INDmoney            | [Official report overview](https://www.indmoney.com/learn/us-stocks/tax-on-us-stocks); [US trades-report download pointer](https://vestedfinance.com/blog/transfer-indmoney-to-vested/) published by Vested                                                                                                                              | Trades and running-balance layouts; issuer/version evidence; separate tax summaries                    |
| Tickertape          | [Official US investing page](https://www.tickertape.in/us-stocks) identifies ViewTrade International IFSC                                                                                                                                                                                                                                | Actual app-issued and underlying account export layouts; do not assume generic ViewTrade compatibility |
| ICICI Direct Global | [Official statement download guide](https://www.icicidirect.com/faqs/global-investment/how-do-i-download-my-reports): PDF/Excel/HTML                                                                                                                                                                                                     | Actual statement layouts and account activity sections                                                 |
| CDSL                | [Official CAS FAQ](https://www.cdslindia.com/CAS/FAQ.html) describes consolidation and eligibility                                                                                                                                                                                                                                       | Representative original statements and parser outputs; holdings/history limitations                    |

## Obtaining formats without the user's own accounts

1. Search official help centers and sample statements for each document type.
2. Inspect licensed public parser code and fixtures, recording the exact source
   URL, revision and license before reusing anything. Public visibility alone is
   not permission to copy. Avoid redistributing personal data in public
   fixtures.
3. Where public evidence is missing, prepare a sample request for the provider
   or an opt-in contribution guide. Sending requests requires separate
   authorization.
4. Anonymize consented examples while preserving columns, PDF text positions,
   dates and number formats needed to reproduce parsing. Do not retain
   passwords, PANs, addresses or account credentials in fixtures.
5. Use synthetic examples for edge cases, explicitly labelled synthetic. They
   prove code behavior, not compatibility with an unseen broker export.

For each new format record the issuer, product, document type, version/date,
source/license, expected activities, holdings/cash reconciliation, and known
unsupported sections. Test overlaps, reimports, malformed values, transfers,
fees, withholding, fractional units and currencies before claiming support.

## Architecture impact and remaining work

Table preparation is local and asynchronous within the existing upload callback.
The web runtime still sends the prepared CSV to its existing server parser;
Tauri still uses its existing native parser. Asset resolution, provider
settings, duplicate checks, ledger writes, events and failure handling remain
owned by their existing layers. This does not claim that the entire web import
is offline. Restoring a source after a template/settings change uses the
existing upload callback and can trigger an additional parse request on the same
web endpoint.

No all-broker or all-app compatibility is claimed. Per-source normalizers, PDF
layouts, multi-file reconciliation, and any new persisted external trade IDs
remain separate work. Existing duplicate review is reused; this increment does
not improve cross-document deduplication. New persistence must be justified
against the existing idempotency mechanism before changing it.
