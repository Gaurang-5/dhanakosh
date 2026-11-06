import { describe, expect, it } from "vitest";
import { computeFieldMappings } from "../hooks/use-import-mapping";
import {
  createDefaultActivityMapping,
  createDefaultParseConfig,
} from "./default-activity-template";
import { createDraftActivities } from "./draft-utils";
import { detectInvestmentTable, prepareInvestmentTableRows } from "./investment-table";

const headers = [
  "symbol",
  "isin",
  "trade_date",
  "exchange",
  "segment",
  "trade_type",
  "quantity",
  "price",
];
const trade = [
  "DEMO",
  "INE000000001",
  "2026-01-02",
  "NSE",
  "EQ",
  "buy",
  "1.23456789",
  "100.12345678",
];

describe("investment transaction table detection", () => {
  it("finds the existing tradebook layout below report headings without changing values", () => {
    const rows = [["Tradebook"], ["Period", "2026"], [], headers, trade, ["Total", "1.23456789"]];
    expect(detectInvestmentTable(rows)?.headerRowIndex).toBe(3);
    expect(prepareInvestmentTableRows(rows)).toEqual([headers, trade, ["Total", "1.23456789"]]);
    expect(rows).toHaveLength(6);
  });

  it("prefers execution fields over settlement, net and market-value fields regardless of order", () => {
    const mapping = computeFieldMappings([
      "Settlement Date",
      "Net Amount",
      "Market Value",
      "Average Price",
      "Date",
      "Trade Date",
      "Symbol",
      "Buy/Sell",
      "Quantity",
      "Price",
      "Trade Price",
      "Gross Amount",
    ]);
    expect(mapping).toMatchObject({
      date: "Trade Date",
      activityType: "Buy/Sell",
      unitPrice: "Trade Price",
      amount: "Gross Amount",
    });
  });

  it("leaves net proceeds unmapped rather than treating them as gross trade amounts", () => {
    expect(computeFieldMappings([...headers, "Net Amount", "Brokerage"]).amount).toBeUndefined();
  });

  it("preserves explicit saved/user mappings over detected fields", () => {
    const mapping = computeFieldMappings([...headers, "Settlement Date", "Net Amount"], {
      date: "Settlement Date",
      amount: "Net Amount",
    });
    expect(mapping.date).toBe("Settlement Date");
    expect(mapping.amount).toBe("Net Amount");
  });

  it("recognizes source-neutral transaction headers without asserting a broker brand", () => {
    const result = detectInvestmentTable([
      [
        "Trade Date",
        "Action",
        "Ticker",
        "Shares",
        "Execution Price",
        "Currency",
        "Withholding Tax",
      ],
    ]);
    expect(result?.fieldMappings).toMatchObject({
      symbol: "Ticker",
      quantity: "Shares",
      currency: "Currency",
      tax: "Withholding Tax",
    });
  });

  it.each([
    ["Symbol", "Quantity", "Average Price", "Market Value"],
    ["Buy Date", "Sell Date", "Symbol", "Quantity", "Capital Gain"],
    ["Settlement Date", "Symbol", "Quantity", "Price", "Action"],
    [...headers, "TRADE_DATE"],
  ])(
    "does not classify holdings, tax summaries or ambiguous headers as a transaction table: %j",
    (...row) => {
      expect(detectInvestmentTable([row])).toBeNull();
    },
  );

  it("does not discard unknown rows, action labels, or invalid numeric values", () => {
    const bad = [...trade];
    bad[5] = "Unknown adjustment";
    bad[6] = "not a number";
    expect(prepareInvestmentTableRows([["Report"], headers, bad, ["Please verify"]])).toEqual([
      headers,
      bad,
      ["Please verify"],
    ]);
  });

  it("does not truncate multiple tables or rows with extra data", () => {
    expect(prepareInvestmentTableRows([["Report"], headers, trade, headers, trade])).toBeNull();
    expect(
      prepareInvestmentTableRows([["Report"], headers, [...trade, "unexpected data"]]),
    ).toBeNull();
  });

  it("keeps ordinary files unchanged and bounds the header search", () => {
    expect(prepareInvestmentTableRows([headers, trade])).toBeNull();
    expect(
      detectInvestmentTable([...Array.from({ length: 50 }, () => ["Report"]), headers]),
    ).toBeNull();
  });

  it("passes fractional USD transactions to the existing draft path without changing account currency defaults", () => {
    const usHeaders = ["Trade Date", "Action", "Ticker", "Shares", "Execution Price", "Currency"];
    const mapping = {
      ...createDefaultActivityMapping("chosen-account"),
      fieldMappings: computeFieldMappings(usHeaders),
    };
    const [draft] = createDraftActivities(
      [["2026-01-02", "BUY", "AAPL", "0.123456789", "200.123456", "USD"]],
      usHeaders,
      mapping,
      createDefaultParseConfig("INR"),
      "chosen-account",
    );
    expect(draft).toMatchObject({
      accountId: "chosen-account",
      activityType: "BUY",
      quantity: "0.123456789",
      unitPrice: "200.123456",
      currency: "USD",
      currencySource: "csv",
    });
  });
});
