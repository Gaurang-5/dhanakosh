# Investment cash ledger

Securities and crypto investment accounts keep available cash separate from
investment settlement. Purchases and sales still create and dispose lots with
unchanged quantities, prices, fees and cost basis, but do not debit or credit the
available cash balance. Investment-specific income and charges likewise do not
become available cash automatically. Reinvestment composite legs retain their
paired settlement so the reinvestment is not counted as new external funding.

Record cash explicitly with cash-only deposits, withdrawals, transfers or balance
adjustments. Cash remains part of account/portfolio total wealth. If a sale is
followed by an explicit cash deposit, the sale's external withdrawal and the
cash deposit offset in whole-portfolio contributions. No synthetic deposits are
created. Bank and credit-card account rules are unchanged. Observed holdings
snapshots remain observations, not reconstructed trade-ledger cash.

The Investments dashboard headline, history and account rows use investment
market value. Its comparison line is investment cost basis, not cash deposits.
Cash has its own display; Net Worth continues to include it. Cash is excluded
from the investment holdings table and its allocation weights. Cash-inclusive
account performance percentages are not shown next to investment-only values.
Global search includes closed positions and labels them Closed; the default
holdings list can still show open positions only.

## Architecture impact

Core accounts classify which accounts use the separate cash ledger and pass the
fact through the existing coordinator to the portfolio engine. The engine
compiles investment settlements into external flows and updates net
contributions rather than cash. This preserves return calculations without
inventing cash transactions. No new database tables, settings, migrations,
workers, provider calls or retry mechanisms were added. Existing portfolio
recalculation and persistence are reused by web and Tauri.

Previously calculated histories need a full recalculation after this behavior
change. Keep original activities and manually entered holdings snapshots.

## Validation

The engine regression covers a purchase, sale with fees, explicit cash deposit,
external sale flow, investment income, and unchanged normal cash-ledger behavior.
The core regression checks investment versus bank/credit-card classification.
The browser regression uses a disposable installation, creates a manual cash
deposit, checks investment-only dashboard/account values and total wealth,
fully exits a position, finds it in global search, and checks RTL mobile cash.
