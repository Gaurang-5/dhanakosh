# India and global CSV imports

These are synthetic examples, not broker records or historical market prices.
Use Import → choose a member's investment account → upload → select a template.
Always review field mappings, asset identity, exchange, currency, fees and final
transactions before confirming. Upload/preview alone must not write transactions.

- `zerodha-equity-synthetic.csv`: the **Zerodha equity tradebook (INR)** preset
  maps `trade_date`, `trade_type`, `symbol`, `isin`, `quantity`, and `price`.
  Scope is delivered equity trades, not derivatives or a tax P&L report. Choose
  NSE/BSE in asset review; exchange and order/trade IDs are not imported by this
  preset. Fees/taxes absent from a tradebook must be supplied separately; zero
  is not an estimate of real charges. Validate the headers of your actual export.
- `india-global-synthetic.csv`: select **India investments CSV (INR)** or
  **Global investments CSV (USD default)**. The CSV's explicit currency wins over
  the preset default. Resolve VWRP as its London listing, not another listing of
  the same ISIN. Transaction values here are GBP, not GBp; quotes may use pence.
  Resolve LOCAL-MF-DEMO as a manual test asset, never a live fund ticker.

A SIP installment is imported only after execution as a BUY. A future SIP
instruction is not a holding. This is a common CSV format, not a CAMS/KFintech
CAS parser. Password-protected PDFs, derivatives, EPFO/NPS and arbitrary broker
exports still require dedicated, verified adapters. Duplicate review uses the
existing native importer; these presets do not introduce an order-ID ledger.
