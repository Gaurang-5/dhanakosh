"""Private, stdin-only CAS conversion. No network, files, passwords or records in logs."""
import base64
import csv
import io
import json
import sys
from decimal import Decimal


def convert(data):
    if data.get("file_type") not in ("CAMS", "KFINTECH", "KARVY") or data.get("cas_type") != "DETAILED":
        raise ValueError("Request an original detailed CAMS/KFintech statement, not a summary or demat CAS.")
    if data.get("parse_warnings"):
        raise ValueError("Statement reconciliation failed. Review the original statement before importing.")
    owners = {f.get("PAN") for f in data["folios"] if f.get("PAN")}
    if len(owners) > 1:
        raise ValueError("This statement includes multiple owners. Request a separate statement for each member.")
    rows = []
    headers = ["date", "symbol", "isin", "activityType", "quantity", "unitPrice", "amount", "currency", "comment"]
    buy = {"PURCHASE", "PURCHASE_SIP", "SWITCH_IN"}
    sell = {"REDEMPTION", "SWITCH_OUT"}
    taxes = {"STT_TAX", "STAMP_DUTY_TAX", "TDS_TAX"}
    for folio in data["folios"]:
        for scheme in folio["schemes"]:
            if abs(Decimal(str(scheme["close"])) - Decimal(str(scheme["close_calculated"]))) > Decimal("0.001"):
                raise ValueError("Closing units do not reconcile. Nothing was converted.")
            code = str(scheme.get("amfi") or "")
            if not code.isdigit() or not 5 <= len(code) <= 8:
                raise ValueError("A scheme has no verified AMFI code. Resolve its identity before importing.")
            opening = Decimal(str(scheme["open"]))
            balance = opening
            if opening != 0:
                if not scheme["transactions"]:
                    raise ValueError("Opening units have no dated transaction to attach. Nothing was converted.")
                rows.append([
                    scheme["transactions"][0]["date"],
                    f"AMFI-{code}",
                    scheme.get("isin") or "",
                    "BUY",
                    str(opening),
                    "",
                    "",
                    "INR",
                    f"CAS opening units for scheme {code}; cost unknown",
                ])
            seen = {}
            for tx in scheme["transactions"]:
                kind = tx["type"]
                units = Decimal(str(tx.get("units") or 0))
                amount = abs(Decimal(str(tx.get("amount") or 0)))
                nav = Decimal(str(tx.get("nav") or 0))
                balance += units
                printed = tx.get("balance")
                if printed is not None and abs(balance - Decimal(str(printed))) > Decimal("0.001"):
                    raise ValueError("Running units do not reconcile. Nothing was converted.")
                if kind not in buy | sell | taxes | {"DIVIDEND_PAYOUT", "DIVIDEND_REINVEST"}:
                    raise ValueError("Statement contains unsupported transactions (such as mergers or reversals). Use reviewed CSV for these rows.")
                key = (tx["date"], kind, str(amount), str(units), str(nav), str(printed))
                seen[key] = seen.get(key, 0) + 1
                # Stable across overlapping statements; keeps equal legitimate rows distinct.
                comment = f"CAS folio {folio['folio']} scheme {code} {kind} balance {printed} occurrence {seen[key]}"
                def emit(activity, quantity="", price="", cash=amount, asset=True):
                    rows.append([tx["date"], f"AMFI-{code}" if asset else "", scheme.get("isin") or "" if asset else "", activity, str(quantity), str(price), str(cash), "INR", comment])
                if kind in buy | sell | {"DIVIDEND_REINVEST"}:
                    if units == 0 or nav <= 0 or amount <= 0 or (kind in sell) != (units < 0):
                        raise ValueError("Invalid trade units, direction, NAV or amount.")
                    if kind == "DIVIDEND_REINVEST":
                        emit("DIVIDEND", cash=amount)
                    emit("SELL" if kind in sell else "BUY", abs(units), nav)
                elif kind in taxes:
                    if units != 0 or amount <= 0:
                        raise ValueError("Invalid tax row.")
                    emit("TAX", asset=False)
                else:
                    if units != 0 or amount <= 0:
                        raise ValueError("Invalid dividend row.")
                    emit("DIVIDEND")
            if abs(balance - Decimal(str(scheme["close"]))) > Decimal("0.001"):
                raise ValueError("Final units do not reconcile.")
    if not rows:
        raise ValueError("No supported transactions found.")
    out = io.StringIO(newline="")
    writer = csv.writer(out)
    writer.writerow(headers)
    writer.writerows(rows)
    return {"csv": out.getvalue(), "rows": len(rows)}


def main():
    try:
        import casparser
    except ImportError:
        print(json.dumps({"error": "CAS parser is not installed. Configure WF_CAS_PYTHON with the local CASParser environment."}))
        return
    try:
        request = json.load(sys.stdin)
        pdf = base64.b64decode(request["content"], validate=True)
        result = casparser.read_cas_pdf(io.BytesIO(pdf), request.get("password", ""), output="json")
        data = json.loads(result)
    except Exception:
        print(json.dumps({"error": "Could not read the CAS PDF. Check the password and use the original issuer PDF."}))
        return
    try:
        print(json.dumps(convert(data)))
    except ValueError as error:
        print(json.dumps({"error": str(error)}))
    except Exception:
        print(json.dumps({"error": "Unsupported statement data. Nothing was imported."}))

if __name__ == "__main__":
    main()
