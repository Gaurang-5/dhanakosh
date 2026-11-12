import { describe, expect, it } from "vitest";
import { utils, write, type CellObject } from "xlsx";
import { readExcelImport } from "./excel-import";
import { computeFieldMappings } from "../hooks/use-import-mapping";

function fixture(bookType: "xlsx" | "biff8") {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    ["date", "symbol", "quantity", "unitPrice", "comment"],
    [new Date(2026, 0, 2), "TEST", 1.234567, 123.456789, "quoted, value"],
  ]);
  (sheet.C2 as CellObject).z = "0.00";
  utils.book_append_sheet(book, sheet, "Trades");
  utils.book_append_sheet(book, utils.aoa_to_sheet([["Second"], ["not merged"]]), "Other");
  return new File(
    [write(book, { type: "array", bookType }) as ArrayBuffer],
    `test.${bookType === "xlsx" ? "xlsx" : "xls"}`,
  );
}

describe("Excel transaction upload", () => {
  it("finds a source-neutral USD transaction table below report metadata", async () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ["Account activity"],
        ["Statement period", "January 2026"],
        [],
        ["Trade Date", "Action", "Ticker", "Shares", "Execution Price", "Currency", "Reference"],
        ["2026-01-02", "BUY", "AAPL", 0.123456789, 200.123456, "USD", "000001"],
        ["Totals", "", "", 0.123456789],
      ]),
      "Transactions",
    );
    const file = new File(
      [write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer],
      "activity.xlsx",
    );
    const imported = await readExcelImport(file);
    const csv = await imported.toCsvFile("Transactions").text();
    expect(csv).toMatch(/^Trade Date,Action,Ticker,Shares,Execution Price,Currency,Reference/);
    expect(csv).toContain("AAPL,0.123456789,200.123456,USD,000001");
    expect(csv).toContain("Totals");
    expect(csv).not.toContain("Statement period");
    const original = await imported.toCsvFile("Transactions", false).text();
    expect(original).toContain("Statement period");
  });

  it.each(["xlsx", "biff8"] as const)(
    "reads %s sheets without merging or rounding units",
    async (format) => {
      const book = await readExcelImport(fixture(format));
      expect(book.sheetNames).toEqual(["Trades", "Other"]);
      const csv = await book.toCsvFile("Trades").text();
      expect(csv).toContain("2026-01-02");
      expect(csv).toContain("1.234567");
      expect(csv).toContain("123.456789");
      expect(csv).toContain('"quoted, value"');
      expect(csv).not.toContain("not merged");
    },
  );
  it("rejects non-workbooks and oversize files", async () => {
    await expect(readExcelImport(new File(["not Excel"], "bad.xls"))).rejects.toThrow(
      "excelInvalid",
    );
    const large = new File([], "large.xlsx");
    Object.defineProperty(large, "size", { value: 11 * 1024 * 1024 });
    await expect(readExcelImport(large)).rejects.toThrow("excelTooLarge");
  });

  it("finds and normalizes a Value Research transaction table below report headings", async () => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["Value Research Transaction History"],
      ["Investor", "Deepa Bhatia"],
      [],
      [
        "Transaction Date",
        "Scheme Name",
        "Folio Number",
        "Transaction Type",
        "Amount",
        "Units",
        "NAV",
        "Balance Units",
        "Market Value",
        "ISIN",
        "Exchange",
      ],
      [
        "02-Jan-26",
        "Example Direct Growth",
        "12345/67",
        "SIP Investment",
        -5000,
        4.125,
        1212.1212,
        4.125,
        5000,
        "INF000000001",
        "NSE",
      ],
      [
        "08-Feb-26",
        "Example Direct Growth",
        "12345/67",
        "Sell/Redemption",
        1200,
        -1,
        1200,
        3.125,
        3750,
        "INF000000001",
        "NSE",
      ],
      ["Grand Total", "", "", "", 6200],
    ]);
    utils.book_append_sheet(book, sheet, "Mutual Funds & SIFs");
    const file = new File(
      [write(book, { type: "array", bookType: "biff8" }) as ArrayBuffer],
      "value-research.xls",
    );

    const imported = await readExcelImport(file);
    const csv = await imported.toCsvFile("Mutual Funds & SIFs").text();
    const lines = csv.trim().split("\n");

    expect(lines[0]).toBe(
      "date,symbol,isin,exchange,activityType,quantity,unitPrice,amount,currency,fee,comment",
    );
    expect(lines).toHaveLength(3);
    expect(csv).toContain(
      "2026-01-02,Example Direct Growth,INF000000001,NSE,BUY,4.125,1212.1212,5000,INR",
    );
    expect(csv).toContain("2026-02-08,Example Direct Growth,INF000000001,NSE,SELL,1,1200,1200,INR");
    expect(csv).not.toContain("Grand Total");
    expect(computeFieldMappings(lines[0].split(","))).toMatchObject({
      date: "date",
      symbol: "symbol",
      isin: "isin",
      exchange: "exchange",
      activityType: "activityType",
      quantity: "quantity",
      unitPrice: "unitPrice",
      amount: "amount",
      currency: "currency",
    });
  });

  it("uses the NSE listing for a Value Research ETF when its stock export omits exchange", async () => {
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        ["Value Research Transaction History"],
        [],
        [
          "Transaction Date",
          "Stock/ETF Name",
          "Demat A/c",
          "Transaction Type",
          "Amount",
          "Quantity",
          "Price",
          "Brokerage",
          "Balance Quantity",
          "Market Value",
          "ISIN",
        ],
        [
          "04-Jun-26",
          "Motilal Oswal Nifty 500 ETF - Growth",
          "1208160187581886",
          "Investment in stock",
          7609.69,
          331,
          22.99,
          "--",
          892,
          20507.08,
          "INF247L01BU1",
        ],
      ]),
      "Stocks & ETFs",
    );
    const file = new File(
      [write(book, { type: "array", bookType: "biff8" }) as ArrayBuffer],
      "value-research.xls",
    );

    const imported = await readExcelImport(file);
    const csv = await imported.toCsvFile("Stocks & ETFs").text();

    expect(csv).toContain(
      "2026-06-04,Motilal Oswal Nifty 500 ETF - Growth,INF247L01BU1,NSE,BUY,331,22.99,7609.69,INR",
    );
  });

  it("imports Value Research PPF rows as account activities and derives statement interest", async () => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["Transaction Date", "PPF A/C Name", "Transaction Type", "Amount", "Balance Amount"],
      ["31-Mar-26", "SBI PPF", "Interest Accrued", "-", 101000],
      ["31-Dec-25", "SBI PPF", "Investment in PPF", 1000, 100000],
    ]);
    utils.book_append_sheet(book, sheet, "PPF");
    const file = new File(
      [write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer],
      "value-research.xlsx",
    );

    const imported = await readExcelImport(file);
    const csv = await imported.toCsvFile("PPF").text();

    expect(csv).toContain("2026-03-31,,,,INTEREST,,,1000,INR");
    expect(csv).toContain("2025-12-31,,,,DEPOSIT,,,1000,INR");
    expect(csv).toContain("Value Research; PPF; row 2; Interest Accrued; PPF A/C Name: SBI PPF");
  });

  it("leaves Value Research PPF interest unresolved when no earlier balance exists", async () => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["Transaction Date", "PPF A/C Name", "Transaction Type", "Amount", "Balance Amount"],
      ["31-Mar-26", "SBI PPF", "Interest Accrued", "-", 101000],
    ]);
    utils.book_append_sheet(book, sheet, "PPF");
    const file = new File(
      [write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer],
      "value-research.xlsx",
    );

    const imported = await readExcelImport(file);
    const csv = await imported.toCsvFile("PPF").text();

    expect(csv).toContain("2026-03-31,,,,INTEREST,,,,INR");
  });
});
