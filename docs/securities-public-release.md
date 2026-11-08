# Securities public version

This is the release contract for the current version. Ship it as seven internal
updates. Publish only after Update 7. The next version can add EPF, NPS,
deposits, gold bonds, and the other passbook products.

## Decision

The security’s identity is its ISIN. A renamed fund or a renamed company stays
the same holding. The name is a label. An NSE fill and a BSE fill of that ISIN
are one demat holding. The price paid stays on the trade. The live quote uses
NSE when the name trades there, and BSE only when it does not.

Indian mutual-fund NAVs come from AMFI, looked up by scheme code after the ISIN
is resolved. NSE and BSE prices come from Yahoo, and only after the listing is
known (`XNSE` → `.NS`, `XBOM` → `.BO`). Yahoo is a quote feed, not the identity.
Google Finance is not used: it has no supported API, and scraping it would break
without notice. A missing listing or a missing price stays blank. It is not
filled from a US ticker.

Public Dhanakosh, for this version, is a local or private-server tracker for
listed securities and Indian mutual funds.

A stranger can install it, import a Zerodha tradebook, a Zerodha Coin file, a
detailed CAMS/KFintech statement, a Value Research workbook, or a mapped CSV,
and see quantities, cost, and value for:

- NSE and BSE stocks
- NSE and BSE ETFs, including gold and silver ETFs
- Indian mutual funds, direct and regular as separate schemes
- US stocks and US ETFs held in the same books

The number on screen is either a real price in the instrument currency, or a
visible gap. It is never a silent zero from the wrong exchange or a missing
rupee rate.

## What “public” means

- Published source, install instructions, and a supported-source list.
- One local installation or one private server. Not a signup site, not an App
  Store build, and not an adviser product.
- AGPL-3.0 stays the licence. A network install must offer the matching source.
  Wealthfolio remains a trademark of Teymz Inc. The public name and icon are
  Dhanakosh.
- No capital-gains calculator in this version. Lots and dates have to be right
  first. A wrong tax sheet is worse than none.

## In this version

- Identity: ISIN, exchange MIC, ticker, currency, and the provider symbol that
  will actually be fetched.
- Quotes for NSE, BSE, and AMFI. US listings stay on the existing providers.
- Imports named above, including fees when the file has them.
- Splits, dividends, IDCW, dividend reinvestment, fund switches, and bonus share
  issues.
- Re-import that does not drop a second identical fill or invent a duplicate.
- Data health for an unresolved symbol, a fund with no scheme code, a missing FX
  rate, and an opening quantity whose cost is unknown.

## Not in this version

Leave these for the following version. Do not start them inside these updates.

- EPF, VPF, NPS, FD, RD, SSY, NSC, SCSS, POMIS, SGB, insurance, ULIP, PMS, AIF
- PPF statutory rules. The existing PPF account can stay. Do not market it as
  finished, and do not spend this version on it.
- F&O, intraday, short selling, margin
- NSDL/CDSL demat CAS, MF Central, contract-note PDFs
- Groww and other broker files, until a synthetic fixture matches a verified
  column layout. Until then they are unsupported, not “planned” in the UI.
- Live Zerodha or ICICI sync. The Rust preview can stay unmounted.
- Order placement, Account Aggregator, offline device sync, ITR filing
- A new asset kind for ETFs or funds. They stay on the existing investment
  ledger. Gold ETFs are listed securities, not the manual precious-metal asset.

## Architecture impact

These boundaries change, and only these:

| Boundary                     | Change                                                                                                                                                                                   | Why the current path is not enough                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quote request                | An Indian stock or ETF with no MIC is not sent to Yahoo as a US ticker. A fund is sent to AMFI only as `AMFI-<scheme code>`.                                                             | `rules_resolver.rs` treats a missing MIC as a US symbol. A Coin or tradebook row without an exchange is then priced as the wrong listing.         |
| Valuation when FX is missing | Unchanged in this version. R3.4 still records an amount with no FX path as zero and marks the valuation unavailable. A missing NSE, BSE, or AMFI price is a blank quote, not a US price. | Rewriting the zero sentinel would change every historical fixture. The wrong-price bug was the missing exchange, and that request is now refused. |
| Corporate actions            | A new share-bonus subtype creates zero-cost shares on the bonus date. Cash `BONUS` stays a cash credit.                                                                                  | `ACTIVITY_SUBTYPE_BONUS` is a sign-up credit. `SPLIT` keeps the old acquisition date. Neither is an NSE bonus issue.                              |
| CAS accept policy            | Safe rows import. Opening units, mergers, and unsupported rows are listed for review. Mixed owners still reject the file.                                                                | The converter rejects the whole PDF, which is the normal shape of a real statement since inception.                                               |
| Duplicate key                | An order id, when the file has one, is part of the idempotency key.                                                                                                                      | The current hash collapses two equal fills on the same day.                                                                                       |

Unchanged on purpose:

- One SQLite database per profile. No household ledger and no addon ledger.
- Activity storage, account cost-basis method, and the portfolio engine remain
  the only place quantities and cost are computed.
- Secrets stay in `SecretStore`. The CAS password is still not stored.
- No new migration unless an existing column cannot represent “cost unknown” or
  “quote unresolved”. Never edit a migration that has already shipped.
- Tauri and the web server both get every new command. The parity test is
  necessary and not sufficient: the handler behaviour has to match.

India accounts use FIFO. Weighted average remains available and drops the
acquisition dates a later tax update will need, so it is not the default for a
new INR securities account.

## Update 1 — A security cannot be priced on the wrong market

**Reuse:** asset profiles, ISIN on the provider profile, MIC on the listing,
Yahoo suffix rules, AMFI provider.

**Add:** a commit block in import review. An INR stock or ETF row, or a row
whose ISIN starts with `INE`, needs an exchange MIC before it can be saved. An
Indian fund row whose ISIN starts with `INF` needs a resolved AMFI scheme code.
Show the exact provider symbol (`RELIANCE.NS`, `500325.BO`, `AMFI-119551`) on
the review row.

**Do not:** guess NSE when the exchange cell is empty. Do not search a bare
ticker against Indian providers. Do not merge two listings that share an ISIN
into one price.

**Exit:**

- `RELIANCE` with no MIC produces no Yahoo request and no US quote.
- `RELIANCE` plus `XNSE` resolves to `RELIANCE.NS`.
- A BSE scrip plus `XBOM` resolves to the `.BO` symbol.
- `INF…` without a scheme code cannot be committed.
- `AMFI-` codes still refuse every non-AMFI provider.
- Disabled providers still receive no requests.

**Check:** resolver unit tests, import-review test, `cargo test --locked -p` the
market-data crate, and the focused frontend vitest for the review step.

## Update 2 — Missing prices and missing rupee rates stay blank

**Reuse:** the existing FX pair store, manual FX entry, and the data-health
screen.

**Change:** valuation and household totals skip an amount that has no rate on
that date and show how many holdings were left out. Historical rows that already
stored a fake zero are not rewritten by a migration. New calculations stop
writing that zero.

A stock or ETF with no quote, and a fund with no NAV, show “no price” on the
holding and on data health. They contribute nothing to the total.

**Do not:** call a new FX vendor. Yahoo or a typed rate remains the source. Do
not convert with “latest available” without showing the rate date.

**Exit:**

- An INR household with a USD ETF and no `INR` rate shows the USD value and
  excludes it from the rupee total.
- Adding the rate includes it, at that date’s rate.
- A holding with no quote cannot increase net worth.
- The web overview and the server household summary use the same exclusion rule.
  Desktop valuation uses it too.

**Check:** portfolio-engine fixture for the missing-rate case, household summary
test, and one frontend test that the empty state is the gap message rather than
`0`.

## Update 3 — Stock and ETF trades survive a second import

**Reuse:** the activity importer, fee fields, `SPLIT`, and `DIVIDEND`.

**Add:**

- Zerodha equity preset maps brokerage, STT, stamp duty, GST, and order id when
  those columns exist. Absent columns stay empty. Do not invent fees.
- The generic India CSV preset gains the same optional columns.
- Idempotency includes the order id when present. Two fills with the same
  quantity and price and different order ids both import. A row with no order id
  that matches an existing row is flagged for review, not silently dropped and
  not silently duplicated.
- New subtype for a bonus issue of shares. It posts additional shares at zero
  cost on the bonus date, with no cash and no dividend income. The existing cash
  `BONUS` subtype is unchanged.
- `SPLIT` stays a ratio and keeps the original acquisition dates.

**Do not:** treat a bonus as `DIVIDEND_IN_KIND` or as a split. Do not model
rights, mergers, or demergers. Those rows stay unsupported and visible. Do not
pull dividend announcements from Yahoo or NSE. Dividends enter only from a file
or a typed activity.

**Exit:** a synthetic tradebook with two identical quantities, a fee column, a
split, and a bonus issue imports once, re-imports without new rows, and produces
the expected share count, cost, and acquisition dates. Gold and equity ETFs use
this same path.

**Check:** preset vitest, idempotency test, engine fixture for the bonus
subtype, `cargo fmt` and Clippy on the touched crates.

## Update 4 — Mutual funds use that same ledger

**Reuse:** AMFI provider, Coin preset, Value Research mutual-fund sheet, CAS
converter, `DRIP` expansion for reinvestment.

**Change:**

- Coin and Value Research rows resolve ISIN to `AMFI-<code>` before commit.
  Direct and regular plans stay separate because their ISINs differ.
- CAS setup is part of the product, not a hidden developer step. If
  `WF_CAS_PYTHON` or the project venv is missing, the wizard says how to enable
  it and does not pretend the PDF was read. Document the same step in the
  install guide.
- A detailed CAS imports the rows it understands. Opening units become a
  confirmed opening quantity with cost unknown. They do not receive a guessed
  NAV. Mergers, reversals, and unknown lines are returned as a review list.
  Mixed owners still reject the whole file. Summary and demat CAS stay
  unsupported and say so before conversion.
- A switch is a holding change inside the portfolio, not an external withdrawal
  and deposit. IDCW is `DIVIDEND`. Reinvestment uses the existing
  dividend-plus-buy expansion. SIP instalments are ordinary buys. SWP
  instalments are ordinary sells. An STP is a sell of one fund and a buy of
  another for the same amount, so the cash stays in the account.
- The monthly plan matches those trades. It still does not place orders. A
  future date is not written as a trade. Recording uses the saved price only
  after the due date.

**Do not:** infer cost for units that existed before the statement. Do not add
MF Central. Do not create a second mutual-fund database.

**Exit:** a synthetic CAS with a SIP, a switch, an IDCW, a reinvestment, and
opening units produces the right unit counts, a blank cost on the opening lot,
and an XIRR that does not treat the switch as money leaving the household.
Re-import is duplicate-safe.

**Check:** `python3 -m unittest discover -s scripts/cas/tests`, the CAS adapter
test on both runtimes, and an engine fixture for the switch.

## Update 5 — One import door, and an honest list

**Reuse:** the host import wizard. The India Import Center only opens that
wizard.

**Change:** the addon page, the wizard, and `docs/import-examples/` name the
same supported files and the same refusals. Remove the addon sentence that says
CAMS PDFs are unsupported. Supported for this version:

- Zerodha equity tradebook
- Zerodha Coin mutual-fund tradebook
- Value Research workbook for stocks, ETFs, and mutual funds
- Detailed CAMS/KFintech CAS, after the Python step is enabled
- Generic CSV, with the India and global presets
- IBKR trade-confirmation PDF, for the US stock and ETF path

Unsupported in the same screen: Groww, other Indian brokers, NSDL/CDSL, contract
notes, F&O, EPF, NPS, and every passbook product. No “planned” card for a file
this version will not read.

**Do not:** mount the Kite or ICICI holdings preview in this update. A quantity
with no cost would look like a finished import.

**Exit:** a person can tell, from the wizard alone, which file will work. The
addon has no parser and no private ledger.

**Check:** frontend test for the supported-list copy, addon test if one exists,
and a read-through of the import docs against the UI strings.

## Update 6 — One synthetic book proves the version

Build one fake household, with no personal data, and make it the release
fixture:

| Holding             | What the fixture must contain                            |
| ------------------- | -------------------------------------------------------- |
| NSE stock           | Buy, fee, dividend, split, bonus issue, partial sell     |
| BSE stock           | Scrip or symbol plus `XBOM`, buy and sell                |
| Equity ETF          | Buy and dividend                                         |
| Gold ETF            | Buy. Priced as a listed ETF                              |
| Indian fund         | Opening units, SIP, switch, IDCW, reinvestment           |
| US stock and US ETF | USD prices and a dated INR rate                          |
| Second member       | Same shape, so the household total does not double-count |

Every importer added above is run against this fixture. Native currency and base
currency are both asserted. Re-import asserts no extra rows. The unsupported
rows in the CAS fixture stay out of the ledger.

Run the fixture on the web server and on the desktop command path. Record
anything not run. A dev server is not the proof.

**Check:** the fixture test, `pnpm type-check`, focused Rust tests for the
touched crates, and `pnpm --filter frontend exec vitest run` on the import,
quote, and household tests. New user-visible strings go through
`pnpm --filter frontend i18n:check`.

## Update 7 — Publish this version, and nothing past it

**Change:**

- Install guide matches the commands a new machine actually runs.
- About and the repository state the AGPL, the source location, and that
  Wealthfolio is a separate trademark.
- The supported and unsupported lists from Update 5 are in the README.
- Backup and restore are described, including that a lost database password
  cannot be reset by anyone else.
- Secrets, PAN, CAS passwords, and holding values are not in logs or in the
  fixture files.
- Tag the version only after Update 6 is green.

**Do not:** publish a hosted signup server. Do not ship a tax report. Do not
leave a UI string that offers Groww, broker sync, or EPF import.

**Exit:** a clean machine can follow the guide, import the synthetic files, and
match the fixture totals. The limits page matches the product.

## Release gate

All of these are true before the tag:

1. No Indian stock or ETF is quoted without an MIC.
2. No fund is quoted without an AMFI scheme code.
3. No missing FX rate or missing price is added into a total as zero.
4. Bonus shares, splits, dividends, IDCW, switches, and fees match the fixture.
5. Re-import of every supported file is duplicate-safe.
6. Opening fund units are visible and marked cost unknown.
7. Web and desktop agree on the fixture totals.
8. The wizard’s supported list matches what the parsers accept.
9. Profile data and secrets do not cross members.
10. Licence and trademark notices are on the install path.

## Assumptions

- The first public artifact is source plus local install. A later hosted private
  server still needs the AGPL source offer.
- US listings and Indian listings are the certified set. Other exchanges stay
  best-effort and are described that way.
- Real customer PDFs are not committed. Synthetic files prove behaviour. A
  redacted real CAS and a redacted Zerodha tradebook are an acceptance pass run
  locally, outside the repository, before the tag.
- Tax rules are intentionally absent. The lot dates this version stores are the
  input for that later update.
