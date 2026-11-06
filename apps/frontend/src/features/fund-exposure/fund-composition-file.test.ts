import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { readFundCompositionFile } from "./fund-composition-file";

describe("issuer fund composition files", () => {
  it("normalizes a common Indian AMC portfolio workbook", async () => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["Monthly Portfolio Statement"],
      [],
      [
        "Sr. No.",
        "Name of the Instrument",
        "ISIN",
        "Industry*",
        "Quantity",
        "Market/Fair Value",
        "% to Net Assets",
      ],
      [1, "Reliance Industries Limited", "INE002A01018", "Petroleum Products", 100, 1200, 8.25],
      [2, "Cash and cash equivalents", "", "", "", 100, 1.25],
      ["", "Grand Total", "", "", "", 1300, 100],
    ]);
    utils.book_append_sheet(book, sheet, "Portfolio");
    const file = new File(
      [write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer],
      "issuer-portfolio.xlsx",
    );

    const csv = await readFundCompositionFile(file);

    expect(csv).toContain("identifier,name,weightPercent,sector");
    expect(csv).toContain("INE002A01018,Reliance Industries Limited,8.25,Petroleum Products");
    expect(csv).not.toContain("Cash and cash equivalents");
    expect(csv).not.toContain("Grand Total");
  });

  it("passes a CSV through for backend validation", async () => {
    const csv = "identifier,name,weightPercent\nNSE:TCS,TCS,4.2\n";
    await expect(readFundCompositionFile(new File([csv], "holdings.csv"))).resolves.toBe(csv);
  });

  it("selects the matching scheme from a multi-scheme AMC workbook", async () => {
    const book = utils.book_new();
    const rows = (scheme: string, isin: string) => [
      [scheme],
      ["Name of the Instrument", "ISIN", "% to Net Assets"],
      [`${scheme} Holding`, isin, 7.5],
    ];
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet(rows("HDFC Flexi Cap Fund", "INE002A01018")),
      "HDFC Flexi Cap",
    );
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet(rows("HDFC Mid Cap Fund", "INE040A01034")),
      "HDFC Mid Cap",
    );
    const file = new File(
      [write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer],
      "hdfc-monthly-portfolio.xlsx",
    );

    const csv = await readFundCompositionFile(file, "HDFC Mid Cap Direct Growth");

    expect(csv).toContain("INE040A01034,HDFC Mid Cap Fund Holding,7.5");
    expect(csv).not.toContain("INE002A01018");
  });

  it("rejects an ambiguous multi-scheme workbook", async () => {
    const book = utils.book_new();
    const rows = (isin: string) => [
      ["Name of the Instrument", "ISIN", "% to Net Assets"],
      ["Holding", isin, 5],
    ];
    utils.book_append_sheet(book, utils.aoa_to_sheet(rows("INE002A01018")), "Scheme A");
    utils.book_append_sheet(book, utils.aoa_to_sheet(rows("INE040A01034")), "Scheme B");
    const file = new File(
      [write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer],
      "multi-scheme.xlsx",
    );

    await expect(readFundCompositionFile(file, "Unknown Fund")).rejects.toThrow("multiple schemes");
  });
});
