"""Convert Value Research transaction-history XLS exports to Wealthfolio CSVs.

Requires xlrd. Local conversion only; no network requests or portfolio writes.
Usage: python convert-value-research.py --output-dir OUTPUT FILE.xls [FILE.xls ...]
"""

import argparse
import csv
import hashlib
import io
import json
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import xlrd


FIELDS = ["date", "symbol", "isin", "activityType", "quantity", "unitPrice",
          "amount", "currency", "fee", "comment"]
TYPES = {"SIP Investment": "BUY", "Investment in fund": "BUY",
         "Switch Investment": "BUY", "Investment in stock": "BUY", "Purchase": "BUY",
         "Sell/Redemption": "SELL", "Switch Redemption": "SELL", "Dividend": "DIVIDEND",
         "Investment in PPF": "DEPOSIT", "Interest Accrued": "INTEREST"}
SHEETS = {"Mutual Funds & SIFs": ("Scheme Name", "Folio Number", "Units", "NAV", "mf"),
          "Stocks & ETFs": ("Stock/ETF Name", "Demat A/c", "Quantity", "Price", "demat"),
          "REITs & InvITs": ("REIT/InvIT Name", "Demat A/c", "Quantity", "Price", "demat"),
          "PPF": ("PPF A/C Name", "PPF A/C Name", None, None, "ppf")}


def number(value):
    if value in ("", "-", "--", None):
        return None
    result = Decimal(str(value).replace(",", "").strip())
    if not result.is_finite():
        raise ValueError("Non-finite number")
    return result


def decimal_text(value):
    return format(value.normalize(), "f") if value is not None else ""


def identifier(value):
    return decimal_text(number(value)) if isinstance(value, (int, float)) else str(value).strip()


def date_text(value):
    for pattern in ("%d-%b-%y", "%d-%b-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value), pattern).date().isoformat()
        except ValueError:
            pass
    raise ValueError("Unsupported transaction date")


def convert_row(row, sheet, source_row):
    name, account, units, price, category = SHEETS[sheet]
    kind = TYPES[row["Transaction Type"]]
    amount = number(row["Amount"])
    if amount is None:
        return None, "Missing transaction amount"
    quantity = number(row[units]) if units else None
    nav = number(row[price]) if price else None
    if kind in ("BUY", "SELL") and (not quantity or not nav or nav <= 0):
        raise ValueError("Trade requires units and positive NAV/price")
    warning = ""
    if kind in ("BUY", "SELL") and abs(abs(amount) - abs(quantity * nav)) > Decimal("1"):
        warning = "Source amount differs from units x NAV/price by more than INR 1; review fees/rounding"
    reference = identifier(row[account])
    comment = f"Value Research; {sheet}; row {source_row}; {row['Transaction Type']}; {account}: {reference}"
    if warning:
        comment += "; REVIEW: " + warning
    trade = kind in ("BUY", "SELL")
    return dict(zip(FIELDS, [date_text(row["Transaction Date"]),
        str(row[name]).strip() if category != "ppf" else "", row.get("ISIN", ""), kind,
        decimal_text(abs(quantity)) if trade else "",
        decimal_text(nav) if trade else "", decimal_text(abs(amount)), "INR",
        decimal_text(number(row.get("Brokerage"))), comment])), warning


def write_csv(path, headers, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def convert(paths, output):
    if output.exists():
        raise ValueError("Choose a new output directory to preserve existing exports")
    groups, seen, reviews, manifest = defaultdict(list), set(), [], []
    source_count = duplicate_count = 0
    for path in paths:
        # Some VR exporters produce overlapping OLE allocation metadata. Read
        # their intact worksheet streams, then validate every transaction below.
        book = xlrd.open_workbook(path, ignore_workbook_corruption=True, logfile=io.StringIO())
        content = [(s.name, [s.row_values(i) for i in range(s.nrows)]) for s in book.sheets()]
        fingerprint = hashlib.sha256(json.dumps(content).encode()).hexdigest()
        if fingerprint in seen:
            duplicate_count += 1
            continue
        if seen:
            raise ValueError("Different snapshots supplied; convert separately and review overlapping history")
        seen.add(fingerprint)
        for sheet in book.sheets():
            if sheet.name not in SHEETS:
                raise ValueError("Unsupported worksheet; no output written")
            header_row = next(i for i in range(sheet.nrows)
                              if "Transaction Date" in sheet.row_values(i))
            headers = sheet.row_values(header_row)
            name, account, _, _, category = SHEETS[sheet.name]
            for index in range(header_row + 1, sheet.nrows):
                values = sheet.row_values(index)
                if not any(values):
                    continue
                row = dict(zip(headers, values))
                if not row.get("Transaction Type"):
                    if str(row.get("Transaction Date", "")).endswith("Total"):
                        continue
                    raise ValueError("Unexpected non-transaction row")
                source_count += 1
                result, warning = convert_row(row, sheet.name, index + 1)
                reference = identifier(row[account])
                if warning:
                    reviews.append({"sheet": sheet.name, "sourceRow": index + 1,
                        "date": date_text(row["Transaction Date"]), "reference": reference,
                        "reason": warning, "sourceAmount": row["Amount"],
                        "sourceBalance": row.get("Balance Amount", ""),
                        "includedInImport": "yes" if result else "no"})
                if result:
                    groups[(category, reference)].append(result)
    output.mkdir(parents=True)
    for index, ((category, reference), rows) in enumerate(groups.items(), 1):
        filename = f"{index:02d}-{category}-transactions.csv"
        write_csv(output / filename, FIELDS, sorted(rows, key=lambda r: r["date"]))
        manifest.append({"file": filename, "type": category, "sourceReference": reference,
                         "transactions": len(rows), "destination": "Select the matching account in the app"})
    write_csv(output / "account-mapping.csv", list(manifest[0]), manifest)
    if reviews:
        write_csv(output / "review-required.csv", list(reviews[0]), reviews)
    imported = sum(len(rows) for rows in groups.values())
    excluded = sum(r["includedInImport"] == "no" for r in reviews)
    assert imported + excluded == source_count
    summary = {"sourceTransactions": source_count, "convertedTransactions": imported,
               "excludedMissingAmounts": excluded, "reviewItems": len(reviews),
               "duplicateWorkbooksSkipped": duplicate_count, "accountFiles": len(groups)}
    (output / "conversion-summary.json").write_text(json.dumps(summary, indent=2))
    (output / "READ-ME.txt").write_text(
        "Use Activities > Import with the Default template. Currency: INR; dates: YYYY-MM-DD.\n"
        "Import only numbered transaction CSVs. Select the correct portfolio and account for each file using account-mapping.csv.\n"
        "Fund names and ISINs are preserved: review asset matches, including plan and growth/dividend options.\n"
        "Folio/demat references are in comments, not auto-created accounts. No broker affiliation was inferred.\n"
        "Do not import these histories over the same transactions from Zerodha/CAS without duplicate review.\n"
        "Purchases/SIPs map to BUY; redemptions to SELL; switch legs stay separate; payouts map to DIVIDEND.\n"
        "Source amounts are preserved as positive magnitudes; direction comes from activity type. Missing fees remain blank.\n"
        "Balance Units, Market Value and summary totals are NOT transactions and were not imported.\n"
        "Review review-required.csv. Four trade discrepancies, if present, remain included with source values.\n"
        "PPF must go to a separate PPF account. Missing interest amounts are excluded, not zeroed or estimated.\n"
        "PPF history/balance is INCOMPLETE until missing interest is obtained from the PPF passbook.\n"
        "Conversion only: nothing has been saved into your live portfolio. Original XLS files are unchanged.\n")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()
    print(json.dumps(convert(args.files, args.output_dir)))
