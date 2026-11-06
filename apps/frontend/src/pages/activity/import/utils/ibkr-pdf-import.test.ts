import { describe, expect, it } from "vitest";

import { parseIbkrTradeConfirmationLines } from "./ibkr-pdf-import";

const sampleLines = [
  "Trade Confirmation Report",
  "Stocks",
  "USD",
  "U25832278 AAPL 2026-06-25, 12:59:56 2026-06-26 - BUY 0.7275 274.9800 -200.05 -0.50 0.00 MKT O;RP",
  "U25832278 AAPL 2026-06-25, 12:59:56 2026-06-26 IBKR BUY 0.7275 274.9800 -200.05 -0.50 0.00 MKT O;RP",
  "U25832278 GOOGL 2026-06-18, 11:17:52 2026-06-22 - BUY 0.5501 363.4900 -199.96 -0.50 0.00 MKT O;RP",
  "U25832278 GOOGL 2026-06-18, 11:17:52 2026-06-22 IBKR BUY 0.5501 363.4900 -199.96 -0.50 0.00 MKT O;RP",
  "AAPL APPLE INC 265598 US0378331005 AAPL NASDAQ 1 COMMON",
  "GOOGL ALPHABET INC-CL A 208813719 US02079K3059 GOOGL NASDAQ 1 COMMON",
];

describe("IBKR trade confirmation PDF import", () => {
  it("collapses mirrored advisor rows and retains identifiers and commissions", () => {
    const csv = parseIbkrTradeConfirmationLines(sampleLines);
    const rows = csv.split("\n");

    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe(
      "date,account,activityType,symbol,isin,quantity,unitPrice,amount,currency,fee,comment,instrumentType,exchangeMic",
    );
    expect(rows[1]).toContain("2026-06-25,U25832278,BUY,AAPL,US0378331005,0.7275,274.98,,USD,0.5");
    expect(rows[1]).toContain("APPLE INC");
    expect(rows[1].endsWith(",EQUITY,XNAS")).toBe(true);
  });

  it("keeps genuinely repeated executions from the same exchange", () => {
    const repeated = [sampleLines[2], sampleLines[4], sampleLines[4]];
    expect(parseIbkrTradeConfirmationLines(repeated).split("\n")).toHaveLength(3);
  });

  it("rejects documents without supported trades", () => {
    expect(() => parseIbkrTradeConfirmationLines(["Trade Confirmation Report"])).toThrow(
      "ibkrPdfInvalid",
    );
  });
});
